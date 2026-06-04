/**
 * config.js — central store settings.
 * Override any of these with environment variables when deploying.
 */

// Minimal, dependency-free .env loader (only sets vars not already present).
(function loadDotEnv() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const STORE = {
  name: process.env.STORE_NAME || 'SR Stationers',
  tagline: process.env.STORE_TAGLINE || 'Stationery, gifts & return gifts',
  // WhatsApp number in international format WITHOUT '+' or spaces, e.g. 919876543210
  whatsapp: process.env.STORE_WHATSAPP || '919999999999',
  email: process.env.STORE_EMAIL || 'hello@srstationers.example',
  phone: process.env.STORE_PHONE || '+91 99999 99999',
  address: process.env.STORE_ADDRESS || 'Hyderabad, Telangana, India',
  currency: process.env.STORE_CURRENCY || '₹',
  instagram: process.env.STORE_INSTAGRAM || '#',
  facebook: process.env.STORE_FACEBOOK || '#',
};

const PORT = process.env.PORT || 3000;

module.exports = { STORE, PORT };
