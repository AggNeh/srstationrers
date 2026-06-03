const express = require('express');
const cors = require('cors');
const path = require('path');

const { STORE, PORT } = require('./config');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const ordersRouter = require('./routes/orders');
const uploadRouter = require('./routes/upload');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

/* ------------------------------ admin auth ------------------------------
 * HTTP Basic Auth on every admin-only API endpoint:
 *   - POST/PUT/DELETE on /api/products  and  /api/categories
 *   - GET on /api/orders (the customer-facing POST /api/orders is left open
 *     so visitors can place orders without logging in)
 *   - PUT on /api/orders/.../status
 * Credentials come from env vars; defaults are safe-but-obvious so an
 * un-configured deployment refuses to look like a real store.
 */
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

function timingSafeEqualStr(a, b) {
  const crypto = require('crypto');
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  // Pad to equal length so timingSafeEqual doesn't throw; result still
  // differs when lengths differ because the underlying bytes won't match.
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
  const u = decoded.slice(0, sep);
  const p = decoded.slice(sep + 1);
  return timingSafeEqualStr(u, ADMIN_USER) && timingSafeEqualStr(p, ADMIN_PASS);
}

function requireAdmin(req, res, next) {
  if (checkBasicAuth(req)) return next();
  // No WWW-Authenticate header — that would trigger the browser's native
  // ugly login dialog. Our admin page handles auth itself in JS.
  return res.status(401).json({ error: 'Auth required' });
}

// Endpoint used by the admin login form to verify credentials.
app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true }));

// Apply auth to admin-only operations on the data routes.
app.use((req, res, next) => {
  const p = req.path;
  const m = req.method;
  let adminOnly = false;

  // Products / categories: any write op needs admin.
  if (['POST', 'PUT', 'DELETE'].includes(m) && /^\/api\/(products|categories)(\/|$)/.test(p)) adminOnly = true;
  // Generic image upload endpoint.
  if (m === 'POST' && /^\/api\/upload$/.test(p)) adminOnly = true;
  // Orders: only LIST and STATUS update are admin. The single-order GET/PUT
  // and the cancel endpoint are public but token-gated inside the route.
  if (m === 'GET'  && /^\/api\/orders\/?$/.test(p)) adminOnly = true;
  if (m === 'PUT'  && /^\/api\/orders\/[^/]+\/status$/.test(p)) adminOnly = true;

  if (!adminOnly) return next();
  return requireAdmin(req, res, next);
});

// Expose public store config to the frontend (no secrets here)
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

app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/upload', uploadRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ----- static frontend -----
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// pretty routes -> serve the relevant HTML page (client-side handles the rest)
app.get('/shop',              (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'shop.html')));
app.get('/category/:slug',    (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'shop.html')));
app.get('/product/:slug',     (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'product.html')));
app.get('/cart',              (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'cart.html')));
app.get('/orders',            (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'my-orders.html')));
app.get('/order/:ref',        (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'order.html')));
app.get('/admin',             (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// error handler (e.g. multer file-too-large / wrong type)
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`\n  ${STORE.name} is running`);
  console.log(`  Storefront : http://localhost:${PORT}`);
  console.log(`  Admin      : http://localhost:${PORT}/admin\n`);
});
