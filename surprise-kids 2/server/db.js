/**
 * db.js
 * A tiny, dependency-free JSON-file data store.
 *
 * Why not SQLite? A flat JSON store keeps this project a pure-JS,
 * clone-and-run repo with no native build step. It is more than enough
 * for a product catalog of this size. Every write is persisted to
 * data/store.json atomically.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const EMPTY = { categories: [], products: [], orders: [], meta: { seq: { product: 0, category: 0, order: 0 } } };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(EMPTY, null, 2));
    return JSON.parse(JSON.stringify(EMPTY));
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    // backfill any missing top-level keys
    return Object.assign(JSON.parse(JSON.stringify(EMPTY)), data);
  } catch (err) {
    console.error('Could not parse store.json, starting fresh:', err.message);
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

let cache = load();

function persist() {
  ensureDir();
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, STORE_FILE); // atomic on same filesystem
}

function nextId(kind) {
  cache.meta.seq[kind] = (cache.meta.seq[kind] || 0) + 1;
  return cache.meta.seq[kind];
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Lighten a hex color (#RRGGBB) by mixing it ~75% toward white — used as a
// sensible default accent when only a base color is provided.
function lightenColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#FFE2E5';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * 0.75);
  const hx = (c) => mix(c).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`.toUpperCase();
}

/* ------------------------------- Categories ------------------------------ */

const categories = {
  all() {
    return [...cache.categories].sort((a, b) => a.position - b.position);
  },
  bySlug(slug) {
    return cache.categories.find((c) => c.slug === slug) || null;
  },
  byId(id) {
    return cache.categories.find((c) => c.id === Number(id)) || null;
  },
  create({ name, position, emoji, color, accent, image }) {
    const id = nextId('category');
    let slug = slugify(name);
    if (cache.categories.some((c) => c.slug === slug)) slug = `${slug}-${id}`;
    const cat = {
      id,
      name,
      slug,
      position: position ?? cache.categories.length + 1,
      emoji: emoji || '🧷',
      color: color || '#FF5A6A',
      accent: accent || lightenColor(color || '#FF5A6A'),
      image: image || null,
    };
    cache.categories.push(cat);
    persist();
    return cat;
  },
  update(id, patch) {
    const cat = this.byId(id);
    if (!cat) return null;
    if (patch.name !== undefined) cat.name = patch.name;
    if (patch.position !== undefined) cat.position = Number(patch.position) || cat.position;
    if (patch.emoji !== undefined) cat.emoji = patch.emoji;
    if (patch.color !== undefined) cat.color = patch.color;
    if (patch.accent !== undefined) cat.accent = patch.accent;
    if (patch.image !== undefined) cat.image = patch.image || null;
    persist();
    return cat;
  },
  remove(id) {
    const idx = cache.categories.findIndex((c) => c.id === Number(id));
    if (idx === -1) return false;
    cache.categories.splice(idx, 1);
    persist();
    return true;
  },
};

/* -------------------------------- Products ------------------------------- */

const products = {
  all() {
    return [...cache.products];
  },

  query({ category, search, sort, featured, page = 1, limit = 24 } = {}) {
    let list = [...cache.products];

    if (category) {
      const cat = categories.bySlug(category);
      if (cat) list = list.filter((p) => p.categoryId === cat.id);
      else list = [];
    }
    if (featured !== undefined) {
      const want = featured === true || featured === 'true';
      list = list.filter((p) => !!p.featured === want);
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case 'price_asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'oldest':
        list.sort((a, b) => a.id - b.id);
        break;
      case 'newest':
      default:
        list.sort((a, b) => b.id - a.id);
    }

    const total = list.length;
    const start = (Number(page) - 1) * Number(limit);
    const items = list.slice(start, start + Number(limit));
    return { items: items.map(withCategory), total, page: Number(page), limit: Number(limit) };
  },

  byId(id) {
    const p = cache.products.find((x) => x.id === Number(id));
    return p ? withCategory(p) : null;
  },
  bySlug(slug) {
    const p = cache.products.find((x) => x.slug === slug);
    return p ? withCategory(p) : null;
  },

  create(input) {
    const id = nextId('product');
    let slug = slugify(input.name);
    if (cache.products.some((p) => p.slug === slug)) slug = `${slug}-${id}`;
    // Normalize image/images: keep images[] as the source of truth,
    // mirror images[0] into 'image' for back-compat readers (cart, card, etc).
    let images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
    if (!images.length && input.image) images = [input.image];
    const product = {
      id,
      slug,
      name: input.name,
      description: input.description || '',
      price: Number(input.price) || 0,
      mrp: input.mrp != null ? Number(input.mrp) : null,
      categoryId: input.categoryId ? Number(input.categoryId) : null,
      image: images[0] || '',
      images,
      inStock: input.inStock === undefined ? true : !!input.inStock,
      featured: !!input.featured,
      createdAt: new Date().toISOString(),
    };
    cache.products.push(product);
    persist();
    return withCategory(product);
  },

  update(id, patch) {
    const product = cache.products.find((x) => x.id === Number(id));
    if (!product) return null;
    const fields = ['name', 'description', 'price', 'mrp', 'categoryId', 'image', 'images', 'inStock', 'featured'];
    for (const f of fields) {
      if (patch[f] === undefined) continue;
      if (f === 'price' || f === 'mrp') product[f] = patch[f] == null ? null : Number(patch[f]);
      else if (f === 'categoryId') product[f] = patch[f] ? Number(patch[f]) : null;
      else if (f === 'inStock' || f === 'featured') product[f] = !!patch[f];
      else product[f] = patch[f];
    }
    // Re-normalize after patch: if images provided, image mirrors [0];
    // if only image provided, images mirrors [image].
    if (Array.isArray(patch.images)) {
      product.images = patch.images.filter(Boolean);
      product.image = product.images[0] || '';
    } else if (patch.image !== undefined) {
      product.image = patch.image || '';
      product.images = product.image ? [product.image] : [];
    }
    persist();
    return withCategory(product);
  },

  remove(id) {
    const idx = cache.products.findIndex((p) => p.id === Number(id));
    if (idx === -1) return false;
    cache.products.splice(idx, 1);
    persist();
    return true;
  },
};

function withCategory(p) {
  const cat = p.categoryId ? categories.byId(p.categoryId) : null;
  return { ...p, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null };
}

/* --------------------------------- Orders -------------------------------- */

function randomToken(len = 24) {
  const crypto = require('crypto');
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function recomputeTotal(items) {
  return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}

const orders = {
  all() {
    return [...cache.orders].sort((a, b) => b.id - a.id);
  },
  byId(id) {
    return cache.orders.find((o) => o.id === Number(id)) || null;
  },
  byPhone(phone) {
    const clean = String(phone || '').replace(/\D+/g, '');
    if (!clean) return [];
    return cache.orders
      .filter((o) => o.customer && String(o.customer.phone || '').replace(/\D+/g, '') === clean)
      .sort((a, b) => b.id - a.id);
  },
  create({ customer, items, note }) {
    const id = nextId('order');
    const lineItems = (items || []).map((it) => {
      const product = cache.products.find((p) => p.id === Number(it.productId));
      const price = product ? product.price : Number(it.price) || 0;
      const qty = Number(it.qty) || 1;
      return {
        productId: product ? product.id : null,
        name: product ? product.name : it.name || 'Item',
        price,
        qty,
      };
    });
    const order = {
      id,
      reference: `SR-${String(id).padStart(5, '0')}`,
      token: randomToken(),
      customer: customer || {},
      items: lineItems,
      note: note || '',
      total: recomputeTotal(lineItems),
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    cache.orders.push(order);
    persist();
    return order;
  },
  // Customer-side edit: only allowed while status === 'new'.
  // Items are re-priced from the live products catalogue so customers can't
  // sneak through stale prices.
  edit(id, { customer, items, note }) {
    const order = this.byId(id);
    if (!order) return null;
    if (order.status !== 'new') return { error: 'Order is locked — please contact us via WhatsApp.' };
    if (customer && typeof customer === 'object') {
      order.customer = { ...order.customer, ...customer };
    }
    if (Array.isArray(items)) {
      order.items = items.map((it) => {
        const product = cache.products.find((p) => p.id === Number(it.productId));
        const price = product ? product.price : Number(it.price) || 0;
        const qty = Math.max(1, Number(it.qty) || 1);
        return {
          productId: product ? product.id : null,
          name: product ? product.name : it.name || 'Item',
          price,
          qty,
        };
      });
    }
    if (note !== undefined) order.note = String(note);
    order.total = recomputeTotal(order.items);
    order.updatedAt = new Date().toISOString();
    persist();
    return order;
  },
  updateStatus(id, status) {
    const order = this.byId(id);
    if (!order) return null;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    persist();
    return order;
  },
};

/* ------------------------------ Bulk / seed ------------------------------ */

function reset() {
  cache = JSON.parse(JSON.stringify(EMPTY));
  persist();
}

module.exports = { categories, products, orders, reset, persist, slugify, _raw: () => cache };
