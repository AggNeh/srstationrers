const express = require('express');
const db = require('../db');
const { STORE } = require('../config');
const router = express.Router();

/**
 * Orders are enquiries (no payment gateway). On creation we store the order
 * and return a ready-to-use WhatsApp link plus a per-order edit token. The
 * customer's browser keeps the token so they can view/edit/cancel the order
 * while status is still 'new'.
 *
 * Endpoint matrix:
 *   POST   /api/orders                       public  create order
 *   GET    /api/orders/lookup?phone=NN       public  list orders for a phone
 *   GET    /api/orders/:id?token=XX          public  view (token-gated)
 *   PUT    /api/orders/:id?token=XX          public  edit (token + status='new')
 *   POST   /api/orders/:id/cancel?token=XX   public  cancel (token + status='new')
 *   GET    /api/orders                       admin   list all
 *   PUT    /api/orders/:id/status            admin   change status
 */

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (!req) return '';
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : '';
}

function buildWhatsappLink(order, kind = 'new', req = null) {
  const lines = [];
  const heading = ({ new: 'New Order', edit: 'Updated Order', cancel: 'Cancel Order' })[kind] || 'Order';
  lines.push(`*${heading} — ${order.reference}*`, '');
  order.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} × ${it.qty} — ₹${it.price * it.qty}`);
  });
  lines.push('', `*Total: ₹${order.total}*`);
  if (order.customer && order.customer.name) lines.push(`Name: ${order.customer.name}`);
  if (order.customer && order.customer.phone) lines.push(`Phone: ${order.customer.phone}`);
  if (order.customer && order.customer.address) lines.push(`Address: ${order.customer.address}`);
  if (order.note) lines.push(`Note: ${order.note}`);
  // Self-service link so the customer can reopen / edit this order later even
  // if they clear their browser. Token is the customer's own private token.
  const base = baseUrl(req);
  if (base && order.token) {
    lines.push('', `To view or update this order anytime, tap:`,
      `${base}/order/${order.reference}?id=${order.id}&token=${order.token}`);
  }
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${STORE.whatsapp}?text=${text}`;
}

function publicOrder(order) {
  if (!order) return order;
  const { token, ...rest } = order;
  return rest;
}

async function requireToken(req, res, next) {
  try {
    const order = await db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const tk = req.query.token || (req.body && req.body.token);
    if (!tk || tk !== order.token) return res.status(403).json({ error: 'Invalid or missing token' });
    req.order = order;
    next();
  } catch (e) { next(e); }
}

/* -------------------------------- public -------------------------------- */

// POST /api/orders  -> create enquiry + whatsapp link + token
router.post('/', async (req, res, next) => {
  try {
    const { customer, items, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const order = await db.orders.create({ customer, items, note });
    res.status(201).json({ order, whatsappUrl: buildWhatsappLink(order, 'new', req) });
  } catch (e) { next(e); }
});

// GET /api/orders/lookup?phone=...
router.get('/lookup', async (req, res, next) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    const found = await db.orders.byPhone(phone);
    res.json(found);
  } catch (e) { next(e); }
});

// GET /api/orders/:id?token=XX  -> view (no token = 403, unless admin)
router.get('/:id', async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Basic ')) {
      const order = await db.orders.byId(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json({ order, whatsappUrl: buildWhatsappLink(order, 'new', req) });
    }
    await requireToken(req, res, () => {
      res.json({
        order: publicOrder(req.order),
        whatsappUrl: buildWhatsappLink(req.order, 'new', req),
      });
    });
  } catch (e) { next(e); }
});

// PUT /api/orders/:id?token=XX  -> customer edit (only while status='new')
router.put('/:id', requireToken, async (req, res, next) => {
  try {
    const { customer, items, note } = req.body;
    const result = await db.orders.edit(req.params.id, { customer, items, note });
    if (!result) return res.status(404).json({ error: 'Order not found' });
    if (result.error) return res.status(409).json({ error: result.error });
    res.json({
      order: publicOrder(result),
      whatsappUrl: buildWhatsappLink(result, 'edit', req),
    });
  } catch (e) { next(e); }
});

// POST /api/orders/:id/cancel?token=XX
router.post('/:id/cancel', requireToken, async (req, res, next) => {
  try {
    if (req.order.status !== 'new') {
      return res.status(409).json({ error: 'This order is already being processed and cannot be cancelled here. Please WhatsApp us to request cancellation.' });
    }
    const order = await db.orders.updateStatus(req.params.id, 'cancelled');
    res.json({
      order: publicOrder(order),
      whatsappUrl: buildWhatsappLink(order, 'cancel', req),
    });
  } catch (e) { next(e); }
});

/* --------------------------------- admin -------------------------------- */

// GET /api/orders  (admin)
router.get('/', async (req, res, next) => {
  try {
    const all = await db.orders.all();
    res.json(all.map(publicOrder));
  } catch (e) { next(e); }
});

// PUT /api/orders/:id/status  (admin)
router.put('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await db.orders.updateStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(publicOrder(order));
  } catch (e) { next(e); }
});

// DELETE /api/orders/:id  (admin) — permanently remove an order
router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await db.orders.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Order not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
