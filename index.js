/**
 * City Gate Medical Center - WhatsApp Chatbot Webhook
 * -----------------------------------------------------
 * A production-ready Express.js server that handles incoming WhatsApp
 * messages via the Twilio WhatsApp API and routes them using simple,
 * case-insensitive keyword matching.
 *
 * Requirements:
 *   npm install express twilio
 *
 * Run:
 *   node index.js
 *
 * Environment variables (optional but recommended for production):
 *   PORT                        - Port to listen on (default: 3000)
 *   TWILIO_AUTH_TOKEN           - Used to validate that incoming requests
 *                                  genuinely come from Twilio (recommended
 *                                  for production; see validateTwilioRequest below)
 *   VALIDATE_TWILIO_SIGNATURE   - Set to "true" to enforce signature validation
 */

'use strict';

const express = require('express');
const twilio = require('twilio');

const { MessagingResponse } = twilio.twiml;

const app = express();

// Twilio sends incoming webhook data as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VALIDATE_TWILIO_SIGNATURE = process.env.VALIDATE_TWILIO_SIGNATURE === 'true';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

// ---------------------------------------------------------------------------
// Message Templates
// ---------------------------------------------------------------------------

const MESSAGES = {
  WELCOME:
    'Welcome to City Gate Medical Center, Sharjah! 🏥 We are happy to assist you today. ' +
    'Please reply with the number or keyword of what you are looking for:\n\n' +
    '1️⃣ Mega Dental Offers\n' +
    '2️⃣ Medical & Lab Packages\n' +
    '3️⃣ Clinic Location & Timings',

  DENTAL:
    '🦷 City Gate Mega Dental Offers:\n' +
    'Here are our current special rates:\n\n' +
    '• Scaling & Polishing: 75 AED\n' +
    '• Filling: 99 AED\n' +
    '• Normal Extraction: 99 AED\n' +
    '• Surgical Extraction: 250 AED\n' +
    '• Crown & Bridge: 250 AED\n' +
    '• Root Canal: 400 AED\n' +
    '• Wisdom Tooth Extraction: 500 AED\n\n' +
    "Would you like to schedule an appointment? Reply 'BOOK' to speak with reception, or type '0' to return to the main menu.",

  MEDICAL_LAB:
    '🔬 City Gate Medical & Lab Packages:\n' +
    'Here are our current health screenings:\n\n' +
    '• Vitamin D Test Special: 12 AED\n' +
    '• Basic Wellness Screening: 25 AED\n' +
    '• Silver Full-Body Package (50+ Tests): 49 AED\n' +
    '• Golden Hormone & Full-Body Package: 99 AED\n\n' +
    "Would you like to book a package? Reply 'BOOK' to speak with reception, or type '0' to return to the main menu.",

  LOCATION:
    '📍 City Gate Medical Center Location:\n' +
    'Building 575, Muwaileh Commercial, Sharjah (Behind Sheikh Mohammed Bin Zayed Road).\n\n' +
    'Hours: Daily 9:00 AM – 1:30 PM & 3:00 PM – 11:00 PM (Fridays: 3:00 PM – 11:30 PM).\n\n' +
    "Reply '0' to return to the main menu.",

  BOOK:
    'Connecting you to our front desk supervisor right now... Please hold on one moment! 📲',
};

// ---------------------------------------------------------------------------
// Keyword Sets (all matching is case-insensitive; see normalizeText below)
// ---------------------------------------------------------------------------

const KEYWORDS = {
  WELCOME: ['hi', 'hello', 'hey', 'menu', 'start', 'deals', 'offers', 'any deals', '0'],
  DENTAL: ['1', 'dental', 'teeth', 'dentist', 'tooth'],
  MEDICAL_LAB: ['2', 'lab', 'package', 'packages', 'blood', 'test', 'tests', 'wellness'],
  LOCATION: ['3', 'location', 'where', 'timing', 'timings', 'hours'],
  BOOK: ['book'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes incoming text for reliable, case-insensitive matching:
 * lowercases, trims, and collapses extra whitespace.
 */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Returns true if the normalized message either exactly equals one of the
 * keywords, or contains one of the (non-numeric) keywords as a substring.
 * Numeric keywords (like "1", "2", "3", "0") only match on exact equality
 * so that phone numbers, prices, etc. typed by the user don't accidentally
 * trigger a menu branch.
 */
function matchesKeyword(normalizedMessage, keywordList) {
  return keywordList.some((keyword) => {
    const isNumeric = /^\d+$/.test(keyword);
    if (isNumeric) {
      return normalizedMessage === keyword;
    }
    return normalizedMessage === keyword || normalizedMessage.includes(keyword);
  });
}

/**
 * Core routing logic: given the raw incoming message body, returns the
 * appropriate reply text based on the conversational rules.
 */
function getReplyForMessage(rawBody) {
  const message = normalizeText(rawBody);

  if (matchesKeyword(message, KEYWORDS.BOOK)) {
    return MESSAGES.BOOK;
  }

  if (matchesKeyword(message, KEYWORDS.DENTAL)) {
    return MESSAGES.DENTAL;
  }

  if (matchesKeyword(message, KEYWORDS.MEDICAL_LAB)) {
    return MESSAGES.MEDICAL_LAB;
  }

  if (matchesKeyword(message, KEYWORDS.LOCATION)) {
    return MESSAGES.LOCATION;
  }

  if (matchesKeyword(message, KEYWORDS.WELCOME)) {
    return MESSAGES.WELCOME;
  }

  // Fallback: anything unrecognized returns the main menu.
  return MESSAGES.WELCOME;
}

// ---------------------------------------------------------------------------
// Optional: Twilio request signature validation (recommended for production)
// ---------------------------------------------------------------------------

function validateTwilioRequest(req, res, next) {
  if (!VALIDATE_TWILIO_SIGNATURE) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];

  // Twilio signs the *exact* public URL it called. If you're behind a proxy
  // (ngrok, load balancer, etc.), make sure this matches the URL configured
  // in your Twilio Sandbox/Console settings (protocol + host + path).
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    twilioSignature,
    fullUrl,
    req.body
  );

  if (!isValid) {
    console.warn('⚠️  Rejected request with invalid Twilio signature.');
    return res.status(403).send('Forbidden: invalid Twilio signature.');
  }

  return next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check endpoint - useful for deployment platforms (Render, Railway, etc.)
app.get('/', (req, res) => {
  res.status(200).send('City Gate Medical Center WhatsApp Bot is running.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'city-gate-whatsapp-bot' });
});

// Main Twilio WhatsApp webhook
app.post('/whatsapp', validateTwilioRequest, (req, res) => {
  try {
    const incomingBody = req.body && req.body.Body ? req.body.Body : '';
    const from = req.body && req.body.From ? req.body.From : 'unknown';

    console.log(`📩 Incoming WhatsApp message from ${from}: "${incomingBody}"`);

    const replyText = getReplyForMessage(incomingBody);

    const twiml = new MessagingResponse();
    twiml.message(replyText);

    res.type('text/xml').status(200).send(twiml.toString());
  } catch (err) {
    console.error('❌ Error handling incoming WhatsApp message:', err);

    // Fail gracefully with a valid empty TwiML response so Twilio doesn't
    // treat this as a broken webhook.
    const twiml = new MessagingResponse();
    twiml.message(
      'Sorry, something went wrong on our end. Please try again in a moment, or reply "0" for the main menu.'
    );
    res.type('text/xml').status(200).send(twiml.toString());
  }
});

// 404 handler for any other route
app.use((req, res) => {
  res.status(404).send('Not found.');
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled server error:', err);
  res.status(500).send('Internal server error.');
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🏥 City Gate Medical Center WhatsApp bot is live on port ${PORT}`);
  console.log(`   Webhook endpoint: POST http://localhost:${PORT}/whatsapp`);
});

module.exports = app;
