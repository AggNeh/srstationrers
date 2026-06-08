const express = require('express');
const db = require('../db');
const { writeProductImage } = require('../imageGen');

const router = express.Router();

// GET /api/products?category=&search=&sort=&featured=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { category, search, sort, featured, page, limit } = req.query;
    const result = await db.products.query({
      category, search, sort,
      featured: featured === undefined ? undefined : featured,
      page: page || 1,
      limit: limit || 24,
    });
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/products/:idOrSlug
router.get('/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    const product = /^\d+$/.test(key)
      ? await db.products.byId(key)
      : await db.products.bySlug(key);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) { next(e); }
});

// POST /api/products  (admin)
router.post('/', async (req, res, next) => {
  try {
    const { name, price } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (price === undefined || price === '') return res.status(400).json({ error: 'Price is required' });
    const created = await db.products.create(req.body);
    // Auto-generate an SVG cover when no image was supplied.
    const hasImage = (Array.isArray(created.images) && created.images.length) || created.image;
    if (!hasImage) {
      const cat = created.categoryId ? await db.categories.byId(created.categoryId) : null;
      const url = await writeProductImage(created.slug, created.name, cat || {});
      return res.status(201).json(await db.products.update(created.id, { images: [url] }));
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PUT /api/products/:id  (admin)
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await db.products.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/products/:id  (admin)
router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await db.products.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
