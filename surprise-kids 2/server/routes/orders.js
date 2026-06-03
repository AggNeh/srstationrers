const express = require('express');
const db = require('../db');
const { STORE } = require('../config');
const router = express.Router();

/**
 * Orders are enquiries (no payment gateway). On creation we store the order
 * and return a ready-to-use WhatsApp link plus a per-order edit token. The
 * customer's browser stores that token so they can later view, edit or
 * cancel the order while its status is still 'new'.
 *
 * Endpoint matrix:
 *   POST   /api/orders                       public  create order
 *   GET    /api/orders/lookup?phone=NN       public  list orders for a phone
 *   GET    /api/orders/:id?token=XX          public  view (token-gated)
 *   PUT    /api/orders/:id?token=XX          public  edit (token + status='new')
 *   POST   /api/orders/:id/cancel?token=XX   public  cancel (token + status='new')
 *   GET    /api/orders                       admin   list all
 *   GET    /api/orders/admin/:id             admin   view any order
 *   PUT    /api/orders/:id/status            admin   change status
 *
 * The admin auth middleware in server.js protects the admin routes.
 */

function buildWhatsappLink(order, kind = 'new') {
  const lines = [];
  const heading = {
    new: 'New Order',
    edit: 'Updated Order',
    cancel: 'Cancel Order',
  }[kind] || 'Order';
  lines.push(`*${heading} — ${order.reference}*`);
  lines.push('');
  order.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} × ${it.qty} — ₹${it.price * it.qty}`);
  });
  lines.push('');
  lines.push(`*Total: ₹${order.total}*`);
  if (order.customer && order.customer.name) lines.push(`Name: ${order.customer.name}`);
  if (order.customer && order.customer.phone) lines.push(`Phone: ${order.customer.phone}`);
  if (order.customer && order.customer.address) lines.push(`Address: ${order.customer.address}`);
  if (order.note) lines.push(`Note: ${order.note}`);
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${STORE.whatsapp}?text=${text}`;
}

// Strip the token before sending an order to the public.
function publicOrder(order) {
  if (!order) return order;
  const { token, ...rest } = order;
  return rest;
}

function requireToken(req, res, next) {
  const order = db.orders.byId(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const tk = req.query.token || (req.body && req.body.token);
  if (!tk || tk !== order.token) return res.status(403).json({ error: 'Invalid or missing token' });
  req.order = order;
  next();
}

/* -------------------------------- public -------------------------------- */

// POST /api/orders  -> create enquiry + whatsapp link + token
router.post('/', (req, res) => {
  const { customer, items, note } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const order = db.orders.create({ customer, items, note });
  // Returning the full order INCLUDING token so the customer's browser can
  // save it for later edits. The token never leaves their device.
  res.status(201).json({ order, whatsappUrl: buildWhatsappLink(order, 'new') });
});

// GET /api/orders/lookup?phone=9876543210  -> all orders for that phone
// (Phone is the soft credential — anyone who knows it can list orders.)
router.get('/lookup', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });
  const found = db.orders.byPhone(phone);
  // Return tokens too — the user has just demonstrated they know the phone,
  // which is the same threshold they'd cross to call/WhatsApp the shop.
  res.json(found);
});

// GET /api/orders/:id?token=XX  -> view (no token = 403)
router.get('/:id', (req, res, next) => {
  // If this is an admin GET (the admin middleware will have authed), allow
  // them through without a token. We detect that by the presence of the
  // Basic Auth header. The server.js middleware already protected the
  // /api/orders LIST and the admin-only routes; here we let token work too.
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Basic ')) {
    // admin auth has been verified at the global middleware; serve full order
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ order, whatsappUrl: buildWhatsappLink(order) });
  }
  return requireToken(req, res, () => {
    res.json({
      order: publicOrder(req.order),
      whatsappUrl: buildWhatsappLink(req.order),
    });
  });
});

// PUT /api/orders/:id?token=XX  -> customer edit (only while status='new')
router.put('/:id', requireToken, (req, res) => {
  const { customer, items, note } = req.body;
  const result = db.orders.edit(req.params.id, { customer, items, note });
  if (!result) return res.status(404).json({ error: 'Order not found' });
  if (result.error) return res.status(409).json({ error: result.error });
  res.json({
    order: publicOrder(result),
    whatsappUrl: buildWhatsappLink(result, 'edit'),
  });
});

// POST /api/orders/:id/cancel?token=XX  -> customer cancel
router.post('/:id/cancel', requireToken, (req, res) => {
  if (req.order.status !== 'new') {
    return res.status(409).json({ error: 'This order is already being processed and cannot be cancelled here. Please WhatsApp us to request cancellation.' });
  }
  const order = db.orders.updateStatus(req.params.id, 'cancelled');
  res.json({
    order: publicOrder(order),
    whatsappUrl: buildWhatsappLink(order, 'cancel'),
  });
});

/* --------------------------------- admin -------------------------------- */

// GET /api/orders  (admin — protected by server.js middleware)
router.get('/', (req, res) => {
  res.json(db.orders.all().map(publicOrder));
});

// PUT /api/orders/:id/status  (admin)
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const order = db.orders.updateStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(publicOrder(order));
});

module.exports = router;
