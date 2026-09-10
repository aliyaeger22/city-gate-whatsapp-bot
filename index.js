/**
 * City Gate Medical Center — Twilio WhatsApp Chatbot
 * ---------------------------------------------------
 * A stateless, menu-driven WhatsApp bot built with Express and Twilio's
 * MessagingResponse (TwiML). Deployable on Render (or any Node host).
 *
 * Run:
 *   npm install express twilio
 *   node app.js
 *
 * Env:
 *   PORT  (optional) - defaults to 10000, falls back for Render compatibility
 */

const express = require('express');

const twilio = require('twilio');

const MessagingResponse = twilio.twiml.MessagingResponse;

const app = express();

// Twilio sends webhook payloads as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const CLINIC_NAME = 'City Gate Medical Center';
const CLINIC_PHONE = '+971 55 948 4795';
const MAPS_LINK = 'https://maps.app.goo.gl/CityGateMedicalCenterMuwaileh';

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

const MESSAGES = {
  mainMenu: `Welcome to *${CLINIC_NAME}*! 🩺

How can we help you today? Please reply with a number:
*1* ── Complete Health Package (50 AED)
*2* ── Medical, Lab & IV Drip Packages ⭐
*3* ── Dental Scaling & Polishing (75 AED)
*4* ── Clinic Location & Timings
*5* ── Speak to Reception`,

  option1HealthPackage: `🩺 *Complete Health Package — 50 AED*

This all-in-one package includes 51 comprehensive tests, covering:
• Blood Sugar Profile
• Cholesterol / Lipid Profile
• Kidney Function Tests
• Liver Function Tests
• Vitamin D & Vitamin B12
• Complete Blood Count (CBC)

...and 45+ additional diagnostic markers for a full picture of your health.

📅 To book, reply *BOOK 1* along with your preferred date.`,

  option2IvMenu: `💉 *Medical, Lab & IV Drip Packages* ⭐

Please choose a category by replying with its letter:

*[A]* ── 99 AED Tier Drips
   (Hydration Drip, Whitening Drip, Melasma Drip)

*[B]* ── 149 AED Tier Drips
   (Pure Gluta, Vitamin C, Iron Drip)

*[C]* ── 199 AED Tier
   (Vitamin D / B12 Injection Bundle)

*[D]* ── 299 AED Premium Tier Drips
   (Cinderella w/ NAD+, Energy Drip)

💳 Flexible installment options via *Tamara* & *Tabby* are accepted at the clinic.`,

  subMenuA: `💧 *99 AED Tier Drips*

• *Hydration Drip* — Replenishes fluids and essential electrolytes, ideal for fatigue, dehydration, and post-travel recovery.
• *Whitening Drip* — A blend of antioxidants and glutathione boosters to support brighter, even-toned skin.
• *Melasma Drip* — Targets pigmentation and dark spots with a formula aimed at reducing melasma appearance.

📅 Reply *BOOK IV* to secure your slot.`,

  subMenuB: `💧 *149 AED Tier Drips*

• *Pure Gluta Drip* — High-dose glutathione for antioxidant support and skin brightening.
• *Vitamin C Drip* — Immune-boosting, collagen-supporting high-dose Vitamin C infusion.
• *Iron Drip* — Restores iron levels efficiently, helpful for fatigue linked to low iron/anemia.

📅 Reply *BOOK IV* to secure your slot.`,

  subMenuC: `💧 *199 AED Tier*

• *Vitamin D / B12 Injection Bundle* — A combined injection designed to strengthen bones, boost energy, and support overall vitamin levels for a stronger, healthier you.

📅 Reply *BOOK IV* to secure your slot.`,

  subMenuD: `💧 *299 AED Premium Tier Drips*

• *Cinderella Drip w/ NAD+* — Our premium anti-aging and cellular-repair infusion, combining skin-brightening actives with NAD+ for enhanced energy and recovery.
• *Energy Drip* — A revitalizing blend of B-vitamins and minerals formulated to fight fatigue and restore energy levels.

📅 Reply *BOOK IV* to secure your slot.`,

  option3Dental: `🦷 *Dental Scaling & Polishing — 75 AED*

Includes professional plaque and tartar removal plus a full polish, leaving your teeth clean, smooth, and refreshed.

📅 To book, reply *BOOK DENTAL*.`,

  option4Location: `📍 *Clinic Location & Timings*

*${CLINIC_NAME}*
Commercial Area, Muwaileh, Sharjah, UAE

🕘 *Timings:* 9 AM – 9 PM, Saturday – Thursday

🗺️ Google Maps: ${MAPS_LINK}`,

  option5Reception: `📞 *Speak to Reception*

Our reception team is ready to assist you directly.

*Call us now:* ${CLINIC_PHONE}

Alternatively, reply *MENU* at any time to return to the main options.`,

  fallback: `🤖 *City Gate Automated Assistant*

For custom packages, urgent diagnostic timelines, or highly specific medical inquiries, let's connect you directly to our medical staff over the phone right now!

📞 *Call Front Desk Directly:* ${CLINIC_PHONE}

We are ready to guide you immediately!`,
};

// ---------------------------------------------------------------------------
// Input normalization + routing
// ---------------------------------------------------------------------------

/**
 * Normalizes incoming WhatsApp message text: trims whitespace and
 * lower-cases it for case-insensitive matching.
 */
function normalizeInput(rawBody) {
  return (rawBody || '').toString().trim().toLowerCase();
}

/**
 * Resolves the normalized input to a reply message.
 */
function getReplyForInput(normalized) {
  switch (normalized) {
    case 'hi':
    case 'hello':
    case 'menu':
      return MESSAGES.mainMenu;

    case '1':
      return MESSAGES.option1HealthPackage;

    case '2':
      return MESSAGES.option2IvMenu;

    case 'a':
      return MESSAGES.subMenuA;

    case 'b':
      return MESSAGES.subMenuB;

    case 'c':
      return MESSAGES.subMenuC;

    case 'd':
      return MESSAGES.subMenuD;

    case '3':
      return MESSAGES.option3Dental;

    case '4':
      return MESSAGES.option4Location;

    case '5':
      return MESSAGES.option5Reception;

    default:
      return MESSAGES.fallback;
  }
}

// ---------------------------------------------------------------------------
// Webhook route
// ---------------------------------------------------------------------------

app.post('/whatsapp', (req, res) => {
  const incomingMessage = req.body.Body;
  const normalized = normalizeInput(incomingMessage);

  const replyText = getReplyForInput(normalized);

  const twiml = new MessagingResponse();
  twiml.message(replyText);

  res.set('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
});

// Simple health check endpoint, useful for Render deployment checks
app.get('/', (req, res) => {
  res.status(200).send(`${CLINIC_NAME} WhatsApp bot is running.`);
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`${CLINIC_NAME} WhatsApp bot listening on port ${PORT}`);
});

module.exports = app;
