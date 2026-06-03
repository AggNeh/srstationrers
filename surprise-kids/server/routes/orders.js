const express = require('express');
const db = require('../db');
const { STORE } = require('../config');
const router = express.Router();

/**
 * Orders here are *enquiries* — there is no payment gateway.
 * On creation we store the order and return a ready-to-use WhatsApp link
 * so the customer can confirm the order directly with the shop.
 */

function buildWhatsappLink(order) {
  const lines = [];
  lines.push(`*New Order — ${order.reference}*`);
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

// POST /api/orders  -> create enquiry + whatsapp link
router.post('/', (req, res) => {
  const { customer, items, note } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const order = db.orders.create({ customer, items, note });
  res.status(201).json({ order, whatsappUrl: buildWhatsappLink(order) });
});

// GET /api/orders  (admin)
router.get('/', (req, res) => {
  res.json(db.orders.all());
});

// GET /api/orders/:id  (admin)
router.get('/:id', (req, res) => {
  const order = db.orders.byId(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order, whatsappUrl: buildWhatsappLink(order) });
});

// PUT /api/orders/:id/status  (admin)
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const order = db.orders.updateStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

module.exports = router;
