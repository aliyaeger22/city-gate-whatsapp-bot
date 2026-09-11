/**
 * City Gate Medical Center - WhatsApp Chatbot Webhook
 *
 * A production-ready Express.js server that handles incoming WhatsApp
 * messages via the Twilio WhatsApp API and routes them using simple,
 * case-insensitive keyword matching.
 */

'use strict';

const express = require('express');
const twilio = require('twilio');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const MessagingResponse = twilio.twiml.MessagingResponse;

const app = express();

// Twilio sends incoming webhook data as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VALIDATE_TWILIO_SIGNATURE = process.env.VALIDATE_TWILIO_SIGNATURE === 'true';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

// ---------------------------------------------------------------------------
// Message templates (with Silver & Gold packages integrated)
// ---------------------------------------------------------------------------

const MESSAGES = {
  WELCOME:
    'Welcome to *City Gate Medical Center, Sharjah*! 🏥\n\n' +
    'How can we help you today? Please reply with a number or keyword:\n\n' +
    '1️⃣ Complete Health Package (50 AED)\n' +
    '2️⃣ Silver Full-Body Package (49 AED) 🥈\n' +
    '3️⃣ Gold Full-Body Package (99 AED) 🥇\n' +
    '4️⃣ Medical, Lab & IV Drip Tiers ⭐\n' +
    '5️⃣ Mega Dental Offers (75 AED)\n' +
    '6️⃣ Clinic Location & Timings',

  HEALTH_50:
    '📋 *Complete Health Package (50 AED)*\n' +
    'Our standard preventive package including 50 essential tests across metabolic tracking, sugar evaluation, and vitamin monitoring.\n\n' +
    "To schedule your booking, reply *'BOOK'*, or type *'0'* to return to the main menu.",

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
    '📊 *LIPID PROFILE*\n' +
    '• Total Cholesterol | Triglycerides | Hdl\n' +
    '• Ldl | Vldl | Non-Hdl Cholesterol\n' +
    '• Ldl Hdl Ratio\n\n' +
    '🦴 *BONES*\n' +
    '• Vitamin D\n\n' +
    "To book your Gold Package, reply *'BOOK'*, or type *'0'* to return to the main menu.",

  MEDICAL_LAB_IV:
    '💧 IV DRIPS TIER MENU 💧\n' +
    'Feel better, look brighter, live stronger!\n\n' +
    'Please reply with a letter (A, B, C, or D) to check details:\n\n' +
    '🔹 [A] 99 AED Tier Drips\n' +
    '• Hydration, Whitening, or Melasma Drip\n\n' +
    '🔹 [B] 149 AED Tier Drips\n' +
    '• Pure Gluta, Vitamin C, or Iron Drip\n\n' +
    '🔹 [C] 199 AED Tier Drip\n' +
    '• Vitamin D / B12 Drip\n\n' +
    '🔹 [D] 299 AED Premium Tier Drips\n' +
    '• Cinderella w/ NAD+ or Energy Drip\n\n' +
    '📌 Starting Offer 99 AED! Buy Now, Pay Later available via Tamara & Tabby.\n\n' +
    "Reply '0' to return to the main menu.",

  DENTAL:
    '🦷 *City Gate Mega Dental Offers* 🦷\n' +
    'Premium specialist cleanings and operations at local Sharjah rates:\n\n' +
    '• Comprehensive Consultation: Free\n' +
    '• Scaling & Polishing: 75 AED\n' +
    '• Dental Filling: 99 AED\n' +
    '• Normal Extraction: 99 AED\n' +
    '• PFM Crown: 250 AED\n' +
    '• Zirconia Crown: 400 AED\n' +
    '• Bridge: According to number of units\n' +
    '• Surgical Extraction: 250 AED\n' +
    '• Root Canal Treatment: 400 AED\n' +
    '• Wisdom Tooth Extraction: 500 AED\n\n' +
    "Would you like to reserve a dental chair? Reply *'BOOK'* to send a request, or type *'0'* to return to the main menu.",

  LOCATION:
    '📍 *City Gate Medical Center Location & Hours*:\n' +
    'Building 575, Muwaileh Commercial, Sharjah (Behind Sheikh Mohammed Bin Zayed Road).\n\n' +
    '⏰ *Timings:* Daily 9:00 AM – 1:30 PM & 3:00 PM – 11:00 PM.\n' +
    '🕌 *Fridays:* 3:00 PM – 11:30 PM.\n' +
    '📍 Google Maps Direction Link: https://maps.google.com/?q=City+Gate+Medical+Center\n\n' +
    "Reply *'0'* to return to the menu.",

  BOOK: 'Connecting you to our front desk supervisor right now... Please hold on one moment! 📲',

  FALLBACK:
    '🤖 *City Gate Automated Assistant*\n\n' +
    'For custom treatment questions, urgent file updates, or to speak directly with our clinical reception staff, please call our front desk phone team directly right now!\n\n' +
    '📞 *Call Us Instantly:* +971 55 948 4795\n\n' +
    'We are ready to assist you immediately over the phone!',
};

// ---------------------------------------------------------------------------
// Keyword sets (case-insensitive mapping structure)
// ---------------------------------------------------------------------------

const KEYWORDS = {
  WELCOME: ['hi', 'hello', 'hey', 'menu', 'start', 'deals', 'offers', '0'],
  HEALTH_50: ['1', 'health', 'screening', '50 aed'],
  SILVER_49: ['2', 'silver', '49', '49 aed'],
  GOLD_99: ['3', 'gold', '99', '99 aed'],
  MEDICAL_LAB_IV: ['4', 'lab', 'package', 'packages', 'blood', 'test', 'tests', 'wellness', 'iv', 'drip', 'drips'],
  DRIP_A: ['a'],
  DRIP_B: ['b'],
  DRIP_C: ['c'],
  DRIP_D: ['d', 'nad'],
  DENTAL: ['5', 'dental', 'teeth', 'dentist', 'tooth', 'scaling'],
  LOCATION: ['6', 'location', 'where', 'timing', 'timings', 'hours'],
  BOOK: ['book', 'reception', 'call', 'talk', 'agent'],
};

// Order in which keyword groups are checked. Kept as a single ordered list
// (rather than a long if/else chain) so the routing priority is explicit
// and easy to re-order without touching the matching logic.
const ROUTING_ORDER = [
  'BOOK',
  'HEALTH_50',
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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

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

function getReplyForMessage(rawBody) {
  const message = normalizeText(rawBody);

  const matchedKey = ROUTING_ORDER.find((key) => matchesKeyword(message, KEYWORDS[key]));

  return matchedKey ? MESSAGES[matchedKey] : MESSAGES.FALLBACK;
}

// ---------------------------------------------------------------------------
// Twilio request signature validation
// ---------------------------------------------------------------------------

function validateTwilioRequest(req, res, next) {
  if (!VALIDATE_TWILIO_SIGNATURE) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, twilioSignature, fullUrl, req.body);

  if (!isValid) {
    console.warn('⚠️  Rejected request with invalid Twilio signature.');
    return res.status(403).send('Forbidden: invalid Twilio signature.');
  }

  return next();
}

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
    const incomingBody = req.body && req.body.Body ? req.body.Body : '';
    const from = req.body && req.body.From ? req.body.From : 'unknown';

    console.log(`Incoming message from ${from}: "${incomingBody}"`);

    const replyText = getReplyForMessage(incomingBody);

    console.log(`🤖 AI Automated Response sent to ${from}: \n"${replyText}"\n---------------------------------------`);

    const twiml = new MessagingResponse();
    twiml.message(replyText);

    res.type('text/xml').status(200).send(twiml.toString());
  } catch (err) {
    console.error('Error handling incoming WhatsApp message:', err);

    const twiml = new MessagingResponse();
    twiml.message(MESSAGES.FALLBACK);

    res.type('text/xml').status(200).send(twiml.toString());
  }
});

app.use((req, res) => res.status(404).send('Not found.'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(500).send('Internal server error.'));

//-----------------------------------------------------------------------------
 } else if (matchesKeyword(message, KEYWORDS.BOOK)) {
      replyText = MESSAGES.BOOK;

      // Pull historical state out of memory before executing alarm log
      const lastCheckedTreatment = patientSessions[from] || 'Unspecified Package / Direct Booking Request';

      console.log(\n🚨🚨🚨 ALARM: BOOKING REQUEST RECEIVED 🚨🚨🚨);
      console.log(This patient wants to book an appointment for ${lastCheckedTreatment}!);
      console.log(Patient Phone Number: ${from});
      console.log(Please schedule his appointment immediately!);
      console.log(🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n);
    } else {"

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`City Gate Medical Center bot live on port ${PORT}`);
});

module.exports = app;
