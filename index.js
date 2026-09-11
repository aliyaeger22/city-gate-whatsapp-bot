/**
 * City Gate Medical Center — WhatsApp Chatbot Webhook
 *
 * Express.js server that handles incoming WhatsApp messages via the
 * Twilio WhatsApp API and replies using TwiML (MessagingResponse),
 * routed through case-insensitive keyword matching.
 *
 * Fixes / hardening applied vs. the previous version:
 *   1. Fails fast at startup if signature validation is enabled but no
 *      auth token is configured (previously this would silently run with
 *      an empty token).
 *   2. Guards against oversized/garbage input before regex matching.
 *   3. Normalizes trailing punctuation on menu replies (e.g. "1.", "1)")
 *      so they still route correctly.
 *   4. Caps + periodically prunes the in-memory session map so it can't
 *      grow unbounded on a long-running process.
 *   5. Centralized, timestamped logging instead of ad hoc console.log.
 *   6. Clear separation of config / content / routing / server concerns
 *      within the file, with JSDoc on every exported helper.
 *   7. Basic security response headers on every route.
 *   8. "Talk to a human" intent: patients asking for a human/agent are
 *      pointed to the WhatsApp number for the front desk, separate from
 *      the "BOOK" flow.
 */

'use strict';

const express = require('express');
const twilio = require('twilio');

const MessagingResponse = twilio.twiml.MessagingResponse;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = {
  port: Number(process.env.PORT) || 10000,
  validateTwilioSignature: process.env.VALIDATE_TWILIO_SIGNATURE === 'true',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  maxIncomingMessageLength: 500,
  sessionTtlMs: 24 * 60 * 60 * 1000, // 24h
  sessionSweepIntervalMs: 60 * 60 * 1000, // 1h
  // Front-desk phone number, used both for phone calls (FALLBACK message)
  // and as the WhatsApp number patients are told to message directly when
  // they ask for a human.
  frontDeskPhone: '+971 55 948 4795',
  // wa.me deep link needs digits only (no "+", spaces, or leading zeros).
  frontDeskWhatsapp: '971559484795',
};

if (config.validateTwilioSignature && !config.twilioAuthToken) {
  // Fail fast and loud rather than silently validating against an empty
  // token, which would make every request fail with a confusing 403.
  // eslint-disable-next-line no-console
  console.error(
    '[FATAL] VALIDATE_TWILIO_SIGNATURE is true but TWILIO_AUTH_TOKEN is not set. ' +
      'Set TWILIO_AUTH_TOKEN or disable signature validation.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] INFO  ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ERROR ${msg}`),
  alarm: (msg) => console.log(`[${new Date().toISOString()}] 🚨 BOOKING ${msg}`),
};

// ---------------------------------------------------------------------------
// In-memory per-user session state
// ---------------------------------------------------------------------------
//
// Tracks the last package/offer a patient looked at, so that when they
// reply "book" we can log which treatment the booking request is likely
// for. Keyed by the WhatsApp "From" number.
//
// NOTE: resets on process restart and won't stay in sync across multiple
// server instances. Fine for a single small deployment — swap for Redis
// or a DB table if you scale horizontally. Entries older than
// `sessionTtlMs` are pruned periodically so this can't grow forever.

const patientSessions = new Map(); // from -> { label, updatedAt }

function rememberTreatment(from, label) {
  patientSessions.set(from, { label, updatedAt: Date.now() });
}

function getLastTreatment(from) {
  const entry = patientSessions.get(from);
  return entry ? entry.label : 'Unspecified Package';
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - config.sessionTtlMs;
  let removed = 0;
  for (const [from, entry] of patientSessions.entries()) {
    if (entry.updatedAt < cutoff) {
      patientSessions.delete(from);
      removed += 1;
    }
  }
  if (removed > 0) {
    logger.info(`Pruned ${removed} expired patient session(s).`);
  }
}

const sessionSweepTimer = setInterval(pruneExpiredSessions, config.sessionSweepIntervalMs);
sessionSweepTimer.unref(); // don't keep the process alive just for this timer

// Human-readable labels for logging/session purposes, keyed by the same
// routing keys used in MESSAGES / KEYWORDS below.
const TREATMENT_LABELS = {
  SILVER_49: 'Silver Full-Body Package (49 AED)',
  GOLD_99: 'Gold Full-Body Package (99 AED)',
  MEDICAL_LAB_IV: 'Medical, Lab & IV Drip Tiers (overview)',
  DRIP_A: 'IV Drip Tier A - 99 AED (Hydration / Whitening / Melasma)',
  DRIP_B: 'IV Drip Tier B - 149 AED (Pure Gluta / Vitamin C / Iron)',
  DRIP_C: 'IV Drip Tier C - 199 AED (Vitamin D / B12)',
  DRIP_D: 'IV Drip Tier D - 299 AED Premium (Cinderella NAD+ / Energy)',
  DENTAL: 'Mega Dental Offers (75 AED)',
};

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

const MESSAGES = {
  WELCOME:
    'Welcome to *City Gate Medical Center, Sharjah*! 🏥\n\n' +
    'How can we help you today? Please reply with a number or keyword:\n\n' +
    '1️⃣ Silver Full-Body Package (49 AED) 🥈\n' +
    '2️⃣ Gold Full-Body Package (99 AED) 🥇\n' +
    '3️⃣ Medical, Lab & IV Drip Tiers ⭐\n' +
    '4️⃣ Mega Dental Offers (75 AED)\n' +
    '5️⃣ Clinic Location & Timings\n' +
    '6️⃣ Talk to a Human 🙋',

  SILVER_49:
    '🥈 *SILVER FULL-BODY PACKAGE (49 AED)* 🥈\n' +
    'A comprehensive laboratory diagnostic profile mapping critical health metrics:\n\n' +
    '🩸 *IRON DEFICIENCY*\n' +
    '• Iron\n\n' +
    '🧪 *RENAL FUNCTION (Kidneys)*\n' +
    '• Creatinine\n' +
    '• Uric Acid\n' +
    '• Bun\n\n' +
    '📊 *LIPID PROFILE (Cholesterol)*\n' +
    '• Total Cholesterol\n' +
    '• Triglycerides\n' +
    '• HDL\n' +
    '• LDL\n\n' +
    '🩺 *GENERAL HEALTH*\n' +
    '• CBC (Complete Blood Count)\n\n' +
    '💡 *SPECIAL ADD-ON:* Add a Vitamin D Test to this package for only 20 AED extra!\n\n' +
    "To book your Silver Package, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  GOLD_99:
    '🥇 *GOLD FULL-BODY PACKAGE (99 AED)* 🥇\n' +
    'Our elite multi-system wellness panel containing targeted deep-dive diagnostics:\n\n' +
    '🩸 *IRON DEFICIENCY*\n' +
    '• Iron | Tibc\n\n' +
    '🧪 *RENAL FUNCTION (Kidneys)*\n' +
    '• Creatinine | Uric Acid | Bun | Calcium\n\n' +
    '🍬 *DIABETES*\n' +
    '• RBS / FBS (Blood Sugar)\n' +
    '• HbA1C (3-Month Average Sugar)\n\n' +
    '🧬 *LIVER FUNCTION*\n' +
    '• Bilirubin Total | Bilirubin Direct\n' +
    '• Alt/Sgpt | Ast/Sgot\n' +
    '• Alkaline Phosphastate | Albumin | Globulin\n' +
    '• Ggt | Total Protein\n\n' +
    '🦋 *THYROID*\n' +
    '• T3 | T4 | TSH\n\n' +
    '📊 *LIPID PROFILE (Comprehensive Cholesterol)*\n' +
    '• Total Cholesterol | Triglycerides | Hdl\n' +
    '• Ldl | Vldl | Non-Hdl Cholesterol\n' +
    '• Ldl Hdl Ratio\n\n' +
    '🦴 *BONES*\n' +
    '• Vitamin D (Included!)\n\n' +
    '🩺 *GENERAL HEALTH*\n' +
    '• CBC (Complete Blood Count)\n\n' +
    "To book your Gold Package, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  MEDICAL_LAB_IV:
    '💧 IV DRIPS TIER MENU 💧\n' +
    'Feel better, look brighter, live stronger!\n\n' +
    'Please reply with a letter (A, B, C, or D) to check details:\n\n' +
    '🔹 [A] ── 99 AED Tier Drips\n' +
    '• Hydration\n' +
    '🔹 [B] ── 149 AED Tier Drips\n' +
    '• Iron Drip\n\n' +
    '🔹 [C] ── 199 AED Tier Drip\n' +
    '• Vitamin D / B12 Drip\n\n' +
    '🔹 [D] ── 299 AED Premium Tier Drips\n' +
    '• Energy Drip\n\n' +
    '📌 Starting Offer 99 AED! Buy Now, Pay Later available via Tamara & Tabby.\n\n' +
    "Reply '0' to return to the main menu.",

  DRIP_A:
    '🔹 *[A] 99 AED TIER DRIPS* 🔹\n\n' +
    '• *Hydration Drip* — Deep hydration\n\n' +
    "To book, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  DRIP_B:
    '🔹 *[B] 149 AED TIER DRIPS* 🔹\n\n' +
    '• *Iron Drip* — Fights fatigue & boosts energy\n\n' +
    "To book, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  DRIP_C:
    '🔹 *[C] 199 AED TIER DRIP* 🔹\n\n' +
    '• *Vitamin D / B12* — Stronger bones & more energy\n\n' +
    "To book, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  DRIP_D:
    '🔹 *[D] 299 AED PREMIUM TIER DRIPS* 🔹\n\n' +
    '• *Energy Drip* — Recharge your body & mind\n\n' +
    "To book, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  DENTAL:
    '🦷 *City Gate Mega Dental Offers* 🦷\n' +
    'Premium specialist cleanings and operations at local Sharjah rates:\n\n' +
    '• Consultation + Scaling & Polishing: 75 AED\n' +
    '• Dental Filling: 99 AED\n' +
    '• Normal Extraction: 99 AED\n' +
    '• Pediatric Extraction: 200 AED\n' +
    '• Crown & Bridge Work: 250 AED\n' +
    '• Surgical Extraction: 250 AED\n' +
    '• Root Canal: 400 AED\n' +
    '• Wisdom Extraction: 500 AED\n\n' +
    "Would you like to reserve a dental chair? Reply *'BOOK'* to send a request, or type *'0'* to return to the main menu.",

  LOCATION:
    '📍 *City Gate Medical Center Location & Hours*:\n' +
    'Building 575, Muwaileh Commercial, Sharjah.\n\n' +
    '⏰ *Timings:* Daily 9:00 AM – 1:30 PM & 3:00 PM – 11:00 PM.\n' +
    '🕌 *Fridays:* 3:00 PM – 11:30 PM.\n' +
    '📍 Map Link: https://maps.app.goo.gl/F88HYUCj3UJbginh6\n\n' +
    "Reply *'0'* to return to the menu.",

  BOOK: 'Connecting you to our front desk supervisor right now... Please hold on one moment! 📲',

  // Sent when a patient explicitly asks to speak with a real person
  // (e.g. "human", "agent", "representative", "real person"). Gives them
  // the WhatsApp number to message directly, plus a tap-to-chat link.
  HUMAN: (whatsappNumberDisplay, whatsappLink) =>
    '🙋 *Talk to a Human*\n\n' +
    `No problem! You can message/WhatsApp our front desk team directly at *${whatsappNumberDisplay}*.\n\n` +
    `Tap to chat: ${whatsappLink}\n\n` +
    "Reply *'0'* to return to the main menu in the meantime.",

  FALLBACK:
    '🤖 *City Gate Automated Assistant*\n\n' +
    'For custom treatment questions, urgent file updates, or to speak directly with our clinical reception staff, please call or WhatsApp our front desk phone team directly right now!\n\n' +
    '📞 *Call or WhatsApp:* +971 55 948 4795\n\n' +
    'We are ready to assist you immediately over the phone!',
};

// ---------------------------------------------------------------------------
// Keyword sets (case-insensitive mapping structure)
// ---------------------------------------------------------------------------

const KEYWORDS = {
  WELCOME: ['hi', 'hello', 'hey', 'menu', 'start', 'deals', 'offers', '0'],
  SILVER_49: ['1', 'silver', '49'],
  GOLD_99: ['2', 'gold', '99'],
  MEDICAL_LAB_IV: ['3', 'lab', 'package', 'iv', 'drip', 'drips'],
  DRIP_A: ['a'],
  DRIP_B: ['b'],
  DRIP_C: ['c'],
  DRIP_D: ['d'],
  DENTAL: ['4', 'dental', 'teeth', 'dentist', 'scaling'],
  LOCATION: ['5', 'location', 'where', 'timing', 'hours'],
  BOOK: ['book', 'reception', 'call', 'talk'],
  // Distinct from BOOK: patients who just want a person, not a booking.
  HUMAN: ['6', 'human', 'agent', 'representative', 'real person', 'person', 'staff', 'whatsapp'],
};

// Order in which keyword groups are checked. Kept as a single ordered list
// (rather than a long if/else chain) so the routing priority is explicit
// and easy to re-order without touching the matching logic.
// HUMAN is checked before BOOK because 'book' is in BOOK's keyword list
// and 'talk' used to be too — 'talk' now only routes to a human, not the
// booking flow, since "talk to reception" and "book an appointment" are
// different intents.
const ROUTING_ORDER = [
  'HUMAN',
  'BOOK',
  'SILVER_49',
  'GOLD_99',
  'DRIP_A',
  'DRIP_B',
  'DRIP_C',
  'DRIP_D',
  'MEDICAL_LAB_IV',
  'DENTAL',
  'LOCATION',
  'WELCOME',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lower-cases, trims, collapses whitespace, and strips a single trailing
 * punctuation character (".", ")", "!", "?") so replies like "1." or "a)"
 * still route the same as "1" or "a".
 */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.)!?]$/, '');
}

/**
 * @param {string} normalizedMessage
 * @param {string[]} keywordList
 * @returns {boolean} whether the message matches any keyword in the list.
 */
function matchesKeyword(normalizedMessage, keywordList) {
  return keywordList.some((keyword) => {
    const isNumeric = /^\d+$/.test(keyword);
    const isSingleLetter = keyword.length === 1 && /[a-z]/.test(keyword);

    // Numeric and single-letter keywords must match the whole message
    // exactly, otherwise short tokens like "1" or "a" would match almost
    // any longer message that happens to contain that character.
    if (isNumeric || isSingleLetter) {
      return normalizedMessage === keyword;
    }

    return normalizedMessage === keyword || normalizedMessage.includes(keyword);
  });
}

/** @returns {string|null} the first matching routing key, or null. */
function getMatchedKey(normalizedMessage) {
  return ROUTING_ORDER.find((key) => matchesKeyword(normalizedMessage, KEYWORDS[key])) || null;
}

/**
 * Builds a wa.me "tap to chat" link for the front desk WhatsApp number.
 * @returns {string}
 */
function buildFrontDeskWhatsappLink() {
  return `https://wa.me/${config.frontDeskWhatsapp}`;
}

// ---------------------------------------------------------------------------
// Twilio request signature validation
// ---------------------------------------------------------------------------

function validateTwilioRequest(req, res, next) {
  if (!config.validateTwilioSignature) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(config.twilioAuthToken, twilioSignature, fullUrl, req.body);

  if (!isValid) {
    logger.warn(`Rejected request with invalid Twilio signature (from ${req.body && req.body.From}).`);
    return res.status(403).send('Forbidden: invalid Twilio signature.');
  }

  return next();
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();

app.disable('x-powered-by');

// Basic security headers on every response.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Twilio sends incoming webhook data as application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.status(200).send('City Gate Medical Center WhatsApp Bot is running.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'city-gate-whatsapp-bot' });
});

app.post('/whatsapp', validateTwilioRequest, (req, res) => {
  try {
    const rawBody = req.body && req.body.Body ? req.body.Body : '';
    const from = req.body && req.body.From ? req.body.From : 'unknown';

    if (rawBody.length > config.maxIncomingMessageLength) {
      logger.warn(`Rejected oversized message (${rawBody.length} chars) from ${from}.`);
      const twiml = new MessagingResponse();
      twiml.message(MESSAGES.FALLBACK);
      return res.type('text/xml').status(200).send(twiml.toString());
    }

    const message = normalizeText(rawBody);
    logger.info(`Incoming message from ${from}: "${rawBody}"`);

    let replyText;
    const matchedKey = getMatchedKey(message);

    if (matchedKey === 'BOOK') {
      replyText = MESSAGES.BOOK;

      const lastCheckedTreatment = getLastTreatment(from);
      logger.alarm(
        `Patient ${from} requested a booking for: ${lastCheckedTreatment}. Please schedule immediately.`
      );
    } else if (matchedKey === 'HUMAN') {
      replyText = MESSAGES.HUMAN(config.frontDeskPhone, buildFrontDeskWhatsappLink());
      logger.info(`Patient ${from} asked for a human — sent WhatsApp/front-desk contact.`);
    } else if (matchedKey) {
      replyText = MESSAGES[matchedKey];

      // Remember which package/offer this patient last looked at, so a
      // later "book" reply can be logged with useful context.
      if (TREATMENT_LABELS[matchedKey]) {
        rememberTreatment(from, TREATMENT_LABELS[matchedKey]);
      }

      logger.info(`Menu sent to ${from}: ${matchedKey}`);
    } else {
      replyText = MESSAGES.FALLBACK;
      logger.info(`Fallback sent to ${from} (no keyword match for: "${rawBody}").`);
    }

    const twiml = new MessagingResponse();
    twiml.message(replyText);

    return res.type('text/xml').status(200).send(twiml.toString());
  } catch (err) {
    logger.error(`Error handling incoming WhatsApp message: ${err && err.stack ? err.stack : err}`);

    const twiml = new MessagingResponse();
    twiml.message(MESSAGES.FALLBACK);

    return res.type('text/xml').status(200).send(twiml.toString());
  }
});

app.use((req, res) => res.status(404).send('Not found.'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err && err.stack ? err.stack : err}`);
  res.status(500).send('Internal server error.');
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = app.listen(config.port, () => {
  logger.info(`City Gate Medical Center bot live on port ${config.port}`);
});

// Graceful shutdown so in-flight requests finish and the sweep timer is
// cleared cleanly (handy on platforms like Render that send SIGTERM).
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  clearInterval(sessionSweepTimer);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
