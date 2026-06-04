const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const ACCESS_SECRET = process.env.ACCESS_SECRET || 'sr-stationers-default-access-secret-change-me';

function currentCode() {
  // Persisted code wins; env var only used as initial fallback for a fresh deploy.
  return db.config.get('accessCode', process.env.ACCESS_CODE || '');
}

function cookieFor(code) {
  return crypto.createHmac('sha256', ACCESS_SECRET).update(String(code)).digest('hex');
}

function setAccessCookie(res, code, req) {
  const value = cookieFor(code);
  // 30 days, HttpOnly so JS can't read it, SameSite=Lax for top-level nav.
  const secure = req && (req.secure || req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `sr_access=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure}`);
}

function clearAccessCookie(res) {
  res.setHeader('Set-Cookie', 'sr_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* ----------------------------- public ----------------------------------- */

// GET /api/access/status -> { gated, authorized }
router.get('/status', (req, res) => {
  const code = currentCode();
  const cookie = (req.cookies && req.cookies.sr_access) || '';
  res.json({
    gated: !!code,
    authorized: !code || cookie === cookieFor(code),
  });
});

// POST /api/access  body: { code }
router.post('/', (req, res) => {
  const code = currentCode();
  if (!code) {
    // No gate active — let everyone through, set the cookie to "open" so
    // the gate page wouldn't be served accidentally.
    setAccessCookie(res, '', req);
    return res.json({ ok: true, gated: false });
  }
  const supplied = String((req.body && req.body.code) || '').trim();
  if (!supplied) return res.status(400).json({ error: 'Code is required' });
  if (supplied !== code) return res.status(401).json({ error: 'Wrong access code' });
  setAccessCookie(res, code, req);
  res.json({ ok: true, gated: true });
});

/* ----------------------------- admin ------------------------------------ */

// GET /api/access/code   (admin)  -> { code, gated, updatedAt }
router.get('/code', (req, res) => {
  res.json({
    code: currentCode(),
    gated: !!currentCode(),
    updatedAt: db.config.get('accessCodeUpdatedAt', null),
  });
});

// PUT /api/access/code   (admin)  body: { code }
// Empty string disables the gate.
router.put('/code', (req, res) => {
  const next = String((req.body && req.body.code !== undefined ? req.body.code : '')).trim();
  db.config.set('accessCode', next);
  db.config.set('accessCodeUpdatedAt', new Date().toISOString());
  // Also refresh the admin's own access cookie so they don't lock themselves out.
  if (next) setAccessCookie(res, next, req);
  else clearAccessCookie(res);
  res.json({
    code: next,
    gated: !!next,
    updatedAt: db.config.get('accessCodeUpdatedAt', null),
  });
});

module.exports = { router, currentCode, cookieFor };
