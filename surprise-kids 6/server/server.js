const express = require('express');
const cors = require('cors');
const path = require('path');

const { STORE, PORT } = require('./config');
const db = require('./db');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const ordersRouter = require('./routes/orders');
const uploadRouter = require('./routes/upload');
const access = require('./routes/access');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ cookie parser --------------------------- */
// Minimal cookie parser — avoids pulling in the cookie-parser package.
app.use((req, res, next) => {
  const cookies = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('=') || '');
  }
  req.cookies = cookies;
  next();
});

/* ------------------------------ admin auth ------------------------------ */
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

function timingSafeEqualStr(a, b) {
  const crypto = require('crypto');
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  const len = Math.max(A.length, B.length);
  const Ap = Buffer.alloc(len); A.copy(Ap);
  const Bp = Buffer.alloc(len); B.copy(Bp);
  return crypto.timingSafeEqual(Ap, Bp) && A.length === B.length;
}

function checkBasicAuth(req) {
  const header = req.headers.authorization || '';
  const [scheme, b64] = header.split(' ');
  if (scheme !== 'Basic' || !b64) return false;
  let decoded;
  try { decoded = Buffer.from(b64, 'base64').toString('utf8'); } catch (e) { return false; }
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  return timingSafeEqualStr(decoded.slice(0, sep), ADMIN_USER)
      && timingSafeEqualStr(decoded.slice(sep + 1), ADMIN_PASS);
}

function requireAdmin(req, res, next) {
  if (checkBasicAuth(req)) return next();
  return res.status(401).json({ error: 'Auth required' });
}

app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true }));

// Admin-only mutations
app.use((req, res, next) => {
  const p = req.path, m = req.method;
  let adminOnly = false;
  if (['POST', 'PUT', 'DELETE'].includes(m) && /^\/api\/(products|categories)(\/|$)/.test(p)) adminOnly = true;
  if (m === 'POST' && /^\/api\/upload$/.test(p)) adminOnly = true;
  if (m === 'GET'  && /^\/api\/orders\/?$/.test(p)) adminOnly = true;
  if (m === 'PUT'  && /^\/api\/orders\/[^/]+\/status$/.test(p)) adminOnly = true;
  if (m === 'DELETE' && /^\/api\/orders\/[^/]+$/.test(p)) adminOnly = true;
  if (m === 'GET'  && /^\/api\/access\/code$/.test(p)) adminOnly = true;
  if (m === 'PUT'  && /^\/api\/access\/code$/.test(p)) adminOnly = true;
  if (m === 'GET'  && /^\/api\/products\/top$/.test(p)) adminOnly = true;
  if (!adminOnly) return next();
  return requireAdmin(req, res, next);
});

/* ----------------------------- access gate -----------------------------
 * Site-wide gate the admin can rotate from the admin panel. A non-empty
 * access code activates the gate; the customer must enter it once and a
 * signed HttpOnly cookie is set. When the admin changes the code, all old
 * cookies invalidate automatically because the cookie value is an HMAC of
 * the current code.
 *
 * Bypassed:
 *   - static assets (css/js/images, gate page itself, favicon)
 *   - /admin HTML and /api/admin/* (admin uses Basic Auth)
 *   - /api/config and /api/access/* (gate page and store name need these)
 *   - any request that already carries valid admin Basic Auth
 */
function gateOpen(req) {
  const p = req.path;
  if (
    p.startsWith('/css/') ||
    p.startsWith('/js/') ||
    p.startsWith('/images/') ||
    p === '/favicon.ico' ||
    p === '/gate.html' ||
    p.startsWith('/api/access') ||
    p.startsWith('/api/admin') ||
    p === '/api/config' ||
    p === '/api/health' ||
    p === '/admin' ||
    p.startsWith('/admin/')
  ) return Promise.resolve(true);

  if (checkBasicAuth(req)) return Promise.resolve(true);

  return access.currentCode().then(code => {
    if (!code) return true; // gate disabled
    const cookie = req.cookies.sr_access || '';
    return cookie === access.cookieFor(code);
  });
}

app.use(async (req, res, next) => {
  try {
    if (await gateOpen(req)) return next();
    // Tell the client this was an access-gate rejection (not e.g. a bad
    // login) so the storefront JS can redirect to the gate page. Also
    // prevent any caching/bfcache from serving a stale authorized page.
    res.set('X-Access-Gated', '1');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
      return res.status(401).sendFile(path.join(PUBLIC_DIR, 'gate.html'));
    }
    return res.status(401).json({ error: 'Access code required', gated: true });
  } catch (e) { next(e); }
});

/* ------------------------------ public config --------------------------- */
app.get('/api/config', (req, res) => {
  res.json({
    name: STORE.name,
    tagline: STORE.tagline,
    whatsapp: STORE.whatsapp,
    email: STORE.email,
    phone: STORE.phone,
    address: STORE.address,
    currency: STORE.currency,
    instagram: STORE.instagram,
    facebook: STORE.facebook,
  });
});

/* ------------------------------ API routers ----------------------------- */
app.use('/api/access', access.router);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/upload', uploadRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ------------------------------ static + pages -------------------------- */
app.use(express.static(PUBLIC_DIR));

// Serve an HTML page with no-store so the access gate can never be bypassed
// by a cached/bfcache copy of an authorized page.
function sendPage(res, file) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PUBLIC_DIR, file));
}

app.get('/shop',              (req, res) => sendPage(res, 'shop.html'));
app.get('/category/:slug',    (req, res) => sendPage(res, 'shop.html'));
app.get('/product/:slug',     (req, res) => sendPage(res, 'product.html'));
app.get('/cart',              (req, res) => sendPage(res, 'cart.html'));
app.get('/orders',            (req, res) => sendPage(res, 'my-orders.html'));
app.get('/order/:ref',        (req, res) => sendPage(res, 'order.html'));
app.get('/coming-soon',       (req, res) => sendPage(res, 'coming-soon.html'));
app.get('/admin',             (req, res) => sendPage(res, 'admin.html'));

/* ------------------------------ errors ---------------------------------- */
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || 'Something went wrong' });
});

async function start() {
  try {
    await db.connect();
    console.log(`\n  Connected to MongoDB (${process.env.MONGODB_DB || 'srstationers'})`);
    app.listen(PORT, () => {
      console.log(`  ${STORE.name} is running`);
      console.log(`  Storefront : http://localhost:${PORT}`);
      console.log(`  Admin      : http://localhost:${PORT}/admin\n`);
    });
  } catch (err) {
    console.error('\n  ✗ Failed to start: ' + err.message);
    console.error('  Set MONGODB_URI to a valid MongoDB connection string and try again.\n');
    process.exit(1);
  }
}

start();
