const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const ACCESS_SECRET = process.env.ACCESS_SECRET || 'sr-stationers-default-access-secret-change-me';

async function currentCode() {
  // Persisted code wins; env var only used as initial fallback for a fresh deploy.
  const stored = await db.config.get('accessCode', null);
  if (stored !== null && stored !== undefined) return stored;
  return process.env.ACCESS_CODE || '';
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
router.get('/status', async (req, res, next) => {
  try {
    const code = await currentCode();
    const cookie = (req.cookies && req.cookies.sr_access) || '';
    res.json({
      gated: !!code,
      authorized: !code || cookie === cookieFor(code),
    });
  } catch (e) { next(e); }
});

// POST /api/access  body: { code }
router.post('/', async (req, res, next) => {
  try {
    const code = await currentCode();
    if (!code) {
      setAccessCookie(res, '', req);
      return res.json({ ok: true, gated: false });
    }
    const supplied = String((req.body && req.body.code) || '').trim();
    if (!supplied) return res.status(400).json({ error: 'Code is required' });
    if (supplied !== code) return res.status(401).json({ error: 'Wrong access code' });
    setAccessCookie(res, code, req);
    res.json({ ok: true, gated: true });
  } catch (e) { next(e); }
});

/* ----------------------------- admin ------------------------------------ */

// GET /api/access/code   (admin)
router.get('/code', async (req, res, next) => {
  try {
    const code = await currentCode();
    res.json({
      code,
      gated: !!code,
      updatedAt: await db.config.get('accessCodeUpdatedAt', null),
    });
  } catch (e) { next(e); }
});

// PUT /api/access/code   (admin)
router.put('/code', async (req, res, next) => {
  try {
    const next_ = String((req.body && req.body.code !== undefined ? req.body.code : '')).trim();
    await db.config.set('accessCode', next_);
    await db.config.set('accessCodeUpdatedAt', new Date().toISOString());
    if (next_) setAccessCookie(res, next_, req);
    else clearAccessCookie(res);
    res.json({
      code: next_,
      gated: !!next_,
      updatedAt: await db.config.get('accessCodeUpdatedAt', null),
    });
  } catch (e) { next(e); }
});

module.exports = { router, currentCode, cookieFor };
