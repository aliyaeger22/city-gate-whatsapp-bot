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

const MessagingResponse = twilio.twiml.MessagingResponse;

const app = express();

// Twilio sends incoming webhook data as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VALIDATE_TWILIO_SIGNATURE = process.env.VALIDATE_TWILIO_SIGNATURE === 'true';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

// ---------------------------------------------------------------------------
// Message Templates (Mobile-Optimized Layout)
// ---------------------------------------------------------------------------

const MESSAGES = {
  WELCOME:
    'Welcome to City Gate Medical Center, Sharjah! 🏥\n\n' +
    'How can we help you today? Please reply with a number or keyword:\n\n' +
    '1️⃣ Complete Health Package (50 AED)\n' +
    '2️⃣ Medical, Lab & IV Drip Tiers ⭐\n' +
    '3️⃣ Mega Dental Offers (75 AED)\n' +
    '4️⃣ Clinic Location & Timings',

  HEALTH_50:
    '📋 Complete Health Package (50 AED)\n' +
    'Our most popular preventive package. Includes 51 essential tests:\n\n' +
    '• Blood Sugar & Cholesterol\n' +
    '• Kidney & Liver Functions\n' +
    '• Vitamin D & Vitamin B12\n' +
     "To schedule your booking, reply 'BOOK' to connect with our front desk, or type '0' to return to the main menu.",

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

  DRIP_A:
    '💧 99 AED Tier Drips Menu 💧\n\n' +
    '• HYDRATION DRIP: Deep hydration for your body.\n' +
    '• WHITENING DRIP: Brighten your skin naturally.\n' +
    '• MELASMA DRIP: Helps reduce pigmentation.\n\n' +
    "To reserve your session today, reply 'BOOK', or type '0' to return to the menu.",

  DRIP_B:
    '🍊 149 AED Tier Drips Menu 🍊\n\n' +
    '• PURE GLUTA: Powerful skin brightening.\n' +
    '• VITAMIN C: Boosts immunity & glow.\n' +
    '• IRON DRIP: Fights fatigue & boosts energy.\n\n' +
    "To reserve your session today, reply 'BOOK', or type '0' to return to the menu.",

  DRIP_C:
    '🦴 199 AED Tier Drip Menu 🦴\n\n' +
    '• VITAMIN D / B12: Stronger bones & more energy.\n\n' +
    "To reserve your session today, reply 'BOOK', or type '0' to return to the menu.",

  DRIP_D:
    '👑 299 AED Premium Tier Drips Menu 👑\n\n' +
    '• CINDERELLA w/ NAD+: Ultimate glow & anti-aging.\n' +
    '• ENERGY DRIP: Recharge your body & mind.\n\n' +
    "To reserve your session today, reply 'BOOK', or type '0' to return to the menu.",

  DENTAL:
    '🦷 City Gate Mega Dental Offers 🦷\n' +
    'Premium specialist cleanings and operations at local Sharjah rates:\n\n' +
    '• Comprehensive Consultation + Scaling & Polishing: 75 AED\n' +
    '• Dental Filling: 99 AED\n' +
    '• Normal Extraction: 99 AED\n' +
    '• Crown & Bridge Work: 250 AED\n' +
    '• Surgical Extraction: 250 AED\n' +
    '• Specialized Root Canal Treatment: 400 AED\n' +
    '• Impacted Wisdom Tooth Extraction: 500 AED\n\n' +
    "Would you like to reserve a dental chair? Reply 'BOOK' to send a request, or type '0' to return to the main menu.",

  LOCATION:
    '📍 City Gate Medical Center Location & Hours:\n' +
    'Building 575, Muwaileh Commercial, Sharjah (Behind Sheikh Mohammed Bin Zayed Road).\n\n' +
    '⏰ Timings: Daily 9:00 AM – 1:30 PM & 3:00 PM – 11:00 PM.\n' +
    '🕌 Fridays: 3:00 PM – 11:30 PM.\n' +
    '📍 Google Maps Direction Link: https://maps.google.com/?q=City+Gate+Medical+Center\n\n' +
    "Reply '0' to return to the menu.",

  BOOK: 'Connecting you to our front desk supervisor right now... Please hold on one moment! 📲',

  FALLBACK:
    '🤖 City Gate Automated Assistant\n\n' +
    'For custom treatment questions, urgent file updates, or to speak directly with our clinical reception staff, please call our front desk phone team directly right now!\n\n' +
    '📞 Call Us Instantly: +971 55 948 4795\n\n' +
    'We are ready to assist you immediately over the phone!',
};

// ---------------------------------------------------------------------------
// Keyword Sets (Case-insensitive mapping structure)
// ---------------------------------------------------------------------------

const KEYWORDS = {
  WELCOME: ['hi', 'hello', 'hey', 'menu', 'start', 'deals', 'offers', '0'],
  HEALTH_50: ['1', 'health', 'screening', '50 aed'],
  MEDICAL_LAB_IV: ['2', 'lab', 'package', 'packages', 'blood', 'test', 'tests', 'wellness', 'iv', 'drip', 'drips'],
  DRIP_A: ['a', '99 aed', '99'],
  DRIP_B: ['b', '149 aed', '149'],
  DRIP_C: ['c', '199 aed', '199'],
  DRIP_D: ['d', '299 aed', '299', 'nad'],
  DENTAL: ['3', 'dental', 'teeth', 'dentist', 'tooth', 'scaling'],
  LOCATION: ['4', 'location', 'where', 'timing', 'timings', 'hours'],
  BOOK: ['book', 'reception', 'call', 'talk', 'agent'],
};

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

    if (isNumeric || isSingleLetter) {
      return normalizedMessage === keyword;
    }

    return normalizedMessage === keyword || normalizedMessage.includes(keyword);
  });
}

function getReplyForMessage(rawBody) {
  const message = normalizeText(rawBody);

  if (matchesKeyword(message, KEYWORDS.BOOK)) return MESSAGES.BOOK;
  if (matchesKeyword(message, KEYWORDS.HEALTH_50)) return MESSAGES.HEALTH_50;
  if (matchesKeyword(message, KEYWORDS.DRIP_A)) return MESSAGES.DRIP_A;
  if (matchesKeyword(message, KEYWORDS.DRIP_B)) return MESSAGES.DRIP_B;
  if (matchesKeyword(message, KEYWORDS.DRIP_C)) return MESSAGES.DRIP_C;
  if (matchesKeyword(message, KEYWORDS.DRIP_D)) return MESSAGES.DRIP_D;
  if (matchesKeyword(message, KEYWORDS.MEDICAL_LAB_IV)) return MESSAGES.MEDICAL_LAB_IV;
  if (matchesKeyword(message, KEYWORDS.DENTAL)) return MESSAGES.DENTAL;
  if (matchesKeyword(message, KEYWORDS.LOCATION)) return MESSAGES.LOCATION;
  if (matchesKeyword(message, KEYWORDS.WELCOME)) return MESSAGES.WELCOME;

  return MESSAGES.FALLBACK;
}

// ---------------------------------------------------------------------------
// Twilio Request Signature Validation
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

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`City Gate Medical Center bot live on port ${PORT}`);
});

module.exports = app;
