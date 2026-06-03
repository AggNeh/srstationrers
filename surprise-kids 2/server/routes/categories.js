const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/categories  -> list with product counts
router.get('/', (req, res) => {
  const products = db.products.all();
  const cats = db.categories.all().map((c) => ({
    ...c,
    count: products.filter((p) => p.categoryId === c.id).length,
  }));
  res.json(cats);
});

// GET /api/categories/:slug
router.get('/:slug', (req, res) => {
  const cat = db.categories.bySlug(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  res.json(cat);
});

// POST /api/categories   (admin)
router.post('/', (req, res) => {
  const { name, position, emoji, color, accent, image } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  res.status(201).json(db.categories.create({
    name: name.trim(), position, emoji, color, accent, image,
  }));
});

// PUT /api/categories/:id  (admin)
router.put('/:id', (req, res) => {
  const updated = db.categories.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  res.json(updated);
});

// DELETE /api/categories/:id  (admin)
router.delete('/:id', (req, res) => {
  const ok = db.categories.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Category not found' });
  res.json({ ok: true });
});

module.exports = router;
