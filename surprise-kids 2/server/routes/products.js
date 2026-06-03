const express = require('express');
const db = require('../db');
const { writeProductImage } = require('../imageGen');

const router = express.Router();

/* ------------------------------- queries -------------------------------- */

// GET /api/products?category=&search=&sort=&featured=&page=&limit=
router.get('/', (req, res) => {
  const { category, search, sort, featured, page, limit } = req.query;
  const result = db.products.query({
    category,
    search,
    sort,
    featured: featured === undefined ? undefined : featured,
    page: page || 1,
    limit: limit || 24,
  });
  res.json(result);
});

// GET /api/products/:idOrSlug
router.get('/:key', (req, res) => {
  const key = req.params.key;
  const product = /^\d+$/.test(key) ? db.products.byId(key) : db.products.bySlug(key);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

/* ------------------------------- mutations ------------------------------ */

// POST /api/products  (admin)
router.post('/', (req, res) => {
  const { name, price } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (price === undefined || price === '') return res.status(400).json({ error: 'Price is required' });
  const created = db.products.create(req.body);
  // If no image was provided, auto-generate one themed by the product's category.
  if (!created.image) {
    const cat = created.categoryId ? db.categories.byId(created.categoryId) : null;
    const url = writeProductImage(created.slug, created.name, cat || {});
    return res.status(201).json(db.products.update(created.id, { image: url }));
  }
  res.status(201).json(created);
});

// PUT /api/products/:id  (admin)
router.put('/:id', (req, res) => {
  const updated = db.products.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json(updated);
});

// DELETE /api/products/:id  (admin)
router.delete('/:id', (req, res) => {
  const ok = db.products.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

module.exports = router;
