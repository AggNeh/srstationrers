const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/categories  -> list with product counts (counts come from db layer)
router.get('/', async (req, res, next) => {
  try { res.json(await db.categories.all()); }
  catch (e) { next(e); }
});

// GET /api/categories/:slug   (also accepts a numeric id)
router.get('/:slug', async (req, res, next) => {
  try {
    const cat = await db.categories.byIdOrSlug(req.params.slug);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
  } catch (e) { next(e); }
});

// POST /api/categories   (admin)
router.post('/', async (req, res, next) => {
  try {
    const { name, position, emoji, color, accent, image } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const created = await db.categories.create({
      name: name.trim(), position, emoji, color, accent, image,
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PUT /api/categories/:id  (admin)
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await db.categories.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/categories/:id  (admin)
router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await db.categories.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
