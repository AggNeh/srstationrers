/**
 * db.js  —  MongoDB-backed data layer for SR Stationers.
 *
 * Exposes the same module surface the rest of the app already uses:
 *   db.categories.{all, byId, bySlug, byIdOrSlug, create, update, remove}
 *   db.products.{query, byId, bySlug, create, update, remove}
 *   db.orders.{all, byId, byPhone, create, edit, updateStatus}
 *   db.config.{get, set}
 *   db.reset()
 *   db.slugify, db.connect, db.disconnect
 *
 * All methods are async. Call db.connect() once on startup before serving
 * traffic. The connection string is read from MONGODB_URI; the database
 * name from MONGODB_DB (default "srstationers").
 */

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'srstationers';

let client, _db;

async function connect(uriOverride) {
  if (_db) return _db;
  const uri = uriOverride || URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  _db = client.db(DB_NAME);
  await ensureIndexes();
  return _db;
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    _db = null;
  }
}

function db() {
  if (!_db) throw new Error('Database not connected — call db.connect() first');
  return _db;
}

async function ensureIndexes() {
  const d = _db;
  await Promise.all([
    d.collection('categories').createIndex({ id: 1 }, { unique: true }),
    d.collection('categories').createIndex({ slug: 1 }, { unique: true }),
    d.collection('categories').createIndex({ position: 1 }),
    d.collection('products').createIndex({ id: 1 }, { unique: true }),
    d.collection('products').createIndex({ slug: 1 }, { unique: true }),
    d.collection('products').createIndex({ categoryId: 1 }),
    d.collection('products').createIndex({ featured: 1 }),
    d.collection('products').createIndex({ comingSoon: 1 }),
    d.collection('products').createIndex({ views: -1 }),
    d.collection('orders').createIndex({ id: 1 }, { unique: true }),
    d.collection('orders').createIndex({ reference: 1 }, { unique: true }),
    d.collection('orders').createIndex({ 'customer.phone': 1 }),
  ]);
}

/* ----------------------------- helpers --------------------------------- */

function slugify(text) {
  return String(text)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function lightenColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#FFE2E5';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * 0.75);
  const hx = (c) => mix(c).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`.toUpperCase();
}

function randomToken(len = 24) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function recomputeTotal(items) {
  return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}

// Detect a video URL by extension so we never pick a video as the cover image.
function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|#|$)/i.test(String(url || ''));
}

// Choose the cover image: first non-video media, else first media, else ''.
function coverFrom(images) {
  if (!Array.isArray(images) || !images.length) return '';
  return images.find(u => !isVideoUrl(u)) || '';
}

// Atomic sequence generator using a dedicated `counters` collection.
async function nextId(kind) {
  const r = await db().collection('counters').findOneAndUpdate(
    { _id: kind },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  // MongoDB driver versions return either { value: doc } or the doc directly.
  const doc = r && (r.value !== undefined ? r.value : r);
  return doc.seq;
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

/* ------------------------------ Categories ----------------------------- */

const categories = {
  async all() {
    const list = await db().collection('categories').find({}).sort({ position: 1 }).toArray();
    // Annotate with product counts
    const counts = await db().collection('products').aggregate([
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).toArray();
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));
    return list.map(c => ({ ...stripMongoId(c), count: countMap[c.id] || 0 }));
  },
  async byId(id) {
    return stripMongoId(await db().collection('categories').findOne({ id: Number(id) }));
  },
  async bySlug(slug) {
    return stripMongoId(await db().collection('categories').findOne({ slug }));
  },
  async byIdOrSlug(key) {
    if (/^\d+$/.test(String(key))) return this.byId(key);
    return this.bySlug(key);
  },
  async create({ name, position, emoji, color, accent, image }) {
    const id = await nextId('category');
    let slug = slugify(name);
    const exists = await db().collection('categories').findOne({ slug });
    if (exists) slug = `${slug}-${id}`;
    const cat = {
      id, name, slug,
      position: position ?? (await db().collection('categories').countDocuments()) + 1,
      emoji: emoji || '🧷',
      color: color || '#FF5A6A',
      accent: accent || lightenColor(color || '#FF5A6A'),
      image: image || null,
    };
    await db().collection('categories').insertOne(cat);
    return stripMongoId(cat);
  },
  async update(id, patch) {
    const set = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.position !== undefined) set.position = Number(patch.position);
    if (patch.emoji !== undefined) set.emoji = patch.emoji;
    if (patch.color !== undefined) set.color = patch.color;
    if (patch.accent !== undefined) set.accent = patch.accent;
    if (patch.image !== undefined) set.image = patch.image || null;
    if (Object.keys(set).length) {
      await db().collection('categories').updateOne({ id: Number(id) }, { $set: set });
    }
    return this.byId(id);
  },
  async remove(id) {
    const r = await db().collection('categories').deleteOne({ id: Number(id) });
    return r.deletedCount > 0;
  },
};

/* ------------------------------ Products ------------------------------- */

async function withCategory(product, catMap) {
  if (!product) return null;
  if (catMap) {
    return { ...product, category: catMap[product.categoryId] || null };
  }
  const cat = product.categoryId != null ? await categories.byId(product.categoryId) : null;
  return { ...product, category: cat || null };
}

const products = {
  async query({ category, search, sort = 'newest', featured, comingSoon, page = 1, limit = 24 } = {}) {
    const filter = {};
    if (category) {
      const cat = await db().collection('categories').findOne({ slug: category });
      filter.categoryId = cat ? cat.id : -1;
    }
    if (search) {
      // Case-insensitive substring match on name (escape regex special chars)
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: safe, $options: 'i' };
    }
    if (featured !== undefined) {
      const v = String(featured).toLowerCase();
      filter.featured = v === 'true' || v === '1';
    }
    // Coming-soon handling:
    //   comingSoon === 'true'/true  -> only coming-soon items
    //   comingSoon === 'all'        -> include everything
    //   otherwise (default)         -> exclude coming-soon items
    const cs = comingSoon === undefined ? undefined : String(comingSoon).toLowerCase();
    if (cs === 'true' || cs === '1' || cs === 'only') {
      filter.comingSoon = true;
    } else if (cs === 'all') {
      /* no filter */
    } else {
      filter.comingSoon = { $ne: true };
    }

    const sortMap = {
      newest:     { id: -1 },
      oldest:     { id: 1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      name:       { name: 1 },
    };
    const sortDoc = sortMap[sort] || sortMap.newest;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 24));
    const skip = (p - 1) * l;

    const coll = db().collection('products');
    const total = await coll.countDocuments(filter);
    const docs = await coll.find(filter).sort(sortDoc).skip(skip).limit(l).toArray();

    // Batch-load the categories referenced in this page
    const catIds = [...new Set(docs.map(x => x.categoryId).filter(x => x != null))];
    const cats = catIds.length
      ? await db().collection('categories').find({ id: { $in: catIds } }).toArray()
      : [];
    const catMap = Object.fromEntries(cats.map(c => [c.id, stripMongoId(c)]));

    const items = docs.map(d => ({ ...stripMongoId(d), category: catMap[d.categoryId] || null }));
    return { items, total, page: p, limit: l };
  },
  async byId(id) {
    const p = await db().collection('products').findOne({ id: Number(id) });
    return p ? withCategory(stripMongoId(p)) : null;
  },
  async bySlug(slug) {
    const p = await db().collection('products').findOne({ slug });
    return p ? withCategory(stripMongoId(p)) : null;
  },
  async create(input) {
    const id = await nextId('product');
    let slug = slugify(input.name);
    const exists = await db().collection('products').findOne({ slug });
    if (exists) slug = `${slug}-${id}`;
    let images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
    if (!images.length && input.image) images = [input.image];

    // Stock: when a numeric stock is given, it drives inStock automatically.
    let stock = null;
    if (input.stock !== undefined && input.stock !== null && input.stock !== '') {
      stock = Math.max(0, Math.floor(Number(input.stock)) || 0);
    }
    const inStock = stock !== null
      ? stock > 0
      : (input.inStock === undefined ? true : !!input.inStock);

    const product = {
      id, slug,
      name: input.name,
      description: input.description || '',
      price: Number(input.price) || 0,
      mrp: input.mrp != null ? Number(input.mrp) : null,
      categoryId: input.categoryId ? Number(input.categoryId) : null,
      image: coverFrom(images),
      images,
      posters: (input.posters && typeof input.posters === 'object') ? input.posters : {},
      stock,
      inStock,
      featured: !!input.featured,
      comingSoon: !!input.comingSoon,
      views: 0,
      createdAt: new Date().toISOString(),
    };
    await db().collection('products').insertOne(product);
    return withCategory(product);
  },
  async update(id, patch) {
    const current = await db().collection('products').findOne({ id: Number(id) });
    if (!current) return null;

    const set = {};
    const fields = ['name', 'description', 'price', 'mrp', 'categoryId', 'image', 'images', 'inStock', 'featured', 'comingSoon', 'posters'];
    for (const f of fields) {
      if (patch[f] === undefined) continue;
      if (f === 'price' || f === 'mrp') set[f] = patch[f] == null ? null : Number(patch[f]);
      else if (f === 'categoryId') set[f] = patch[f] ? Number(patch[f]) : null;
      else if (f === 'inStock' || f === 'featured' || f === 'comingSoon') set[f] = !!patch[f];
      else set[f] = patch[f];
    }
    // Stock: if provided, it drives inStock. Empty string clears tracking.
    if (patch.stock !== undefined) {
      if (patch.stock === null || patch.stock === '') {
        set.stock = null; // untracked — leave inStock as set/managed
      } else {
        const n = Math.max(0, Math.floor(Number(patch.stock)) || 0);
        set.stock = n;
        set.inStock = n > 0;
      }
    }
    // Re-normalize image/images so they stay in sync (cover = first non-video).
    if (Array.isArray(patch.images)) {
      set.images = patch.images.filter(Boolean);
      set.image = coverFrom(set.images);
    } else if (patch.image !== undefined) {
      set.image = patch.image || '';
      set.images = set.image ? [set.image] : [];
    }

    if (Object.keys(set).length) {
      await db().collection('products').updateOne({ id: Number(id) }, { $set: set });
    }
    return this.byId(id);
  },
  async remove(id) {
    const r = await db().collection('products').deleteOne({ id: Number(id) });
    return r.deletedCount > 0;
  },
  // Create many products in one go (used by CSV import). Returns per-row result.
  async bulkCreate(rows) {
    const results = [];
    for (const row of rows) {
      try {
        if (!row.name || !String(row.name).trim()) {
          results.push({ ok: false, name: row.name || '(blank)', error: 'Missing name' });
          continue;
        }
        const created = await this.create(row);
        results.push({ ok: true, id: created.id, name: created.name });
      } catch (e) {
        results.push({ ok: false, name: row.name, error: e.message });
      }
    }
    return results;
  },
  // Increment the view counter for a product (best-effort analytics).
  async incrementViews(id) {
    await db().collection('products').updateOne({ id: Number(id) }, { $inc: { views: 1 } });
  },
  // Top products by view count (for the admin dashboard).
  async topViewed(limit = 8) {
    const docs = await db().collection('products')
      .find({ views: { $gt: 0 } })
      .sort({ views: -1 })
      .limit(Math.min(50, Math.max(1, Number(limit) || 8)))
      .toArray();
    return docs.map(stripMongoId);
  },
};

/* ------------------------------ Orders --------------------------------- */

const orders = {
  async all() {
    const list = await db().collection('orders').find({}).sort({ id: -1 }).toArray();
    return list.map(stripMongoId);
  },
  async byId(id) {
    return stripMongoId(await db().collection('orders').findOne({ id: Number(id) }));
  },
  async byPhone(phone) {
    const clean = String(phone || '').replace(/\D+/g, '');
    if (!clean) return [];
    // Match phone with any non-digit characters stripped (stored phones may
    // have spaces or dashes from user input).
    const list = await db().collection('orders').find({}).sort({ id: -1 }).toArray();
    return list
      .filter(o => o.customer && String(o.customer.phone || '').replace(/\D+/g, '') === clean)
      .map(stripMongoId);
  },
  async create({ customer, items, note }) {
    const id = await nextId('order');

    const productIds = (items || []).map(it => Number(it.productId)).filter(n => n);
    const matched = productIds.length
      ? await db().collection('products').find({ id: { $in: productIds } }).toArray()
      : [];
    const productMap = Object.fromEntries(matched.map(p => [p.id, p]));

    const lineItems = (items || []).map((it) => {
      const product = productMap[Number(it.productId)];
      const price = product ? product.price : Number(it.price) || 0;
      const qty = Number(it.qty) || 1;
      return {
        productId: product ? product.id : null,
        name: product ? product.name : (it.name || 'Item'),
        price, qty,
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
    await db().collection('orders').insertOne(order);
    return stripMongoId(order);
  },
  async edit(id, { customer, items, note }) {
    const order = await this.byId(id);
    if (!order) return null;
    if (order.status !== 'new') return { error: 'Order is locked — please contact us via WhatsApp.' };

    const update = { updatedAt: new Date().toISOString() };
    if (customer && typeof customer === 'object') {
      update.customer = { ...order.customer, ...customer };
    }
    if (Array.isArray(items)) {
      const productIds = items.map(it => Number(it.productId)).filter(n => n);
      const matched = productIds.length
        ? await db().collection('products').find({ id: { $in: productIds } }).toArray()
        : [];
      const productMap = Object.fromEntries(matched.map(p => [p.id, p]));
      update.items = items.map((it) => {
        const product = productMap[Number(it.productId)];
        const price = product ? product.price : Number(it.price) || 0;
        const qty = Math.max(1, Number(it.qty) || 1);
        return {
          productId: product ? product.id : null,
          name: product ? product.name : (it.name || 'Item'),
          price, qty,
        };
      });
      update.total = recomputeTotal(update.items);
    }
    if (note !== undefined) update.note = String(note);

    await db().collection('orders').updateOne({ id: Number(id) }, { $set: update });
    return this.byId(id);
  },
  async updateStatus(id, status) {
    await db().collection('orders').updateOne(
      { id: Number(id) },
      { $set: { status, updatedAt: new Date().toISOString() } }
    );
    return this.byId(id);
  },
  async remove(id) {
    const r = await db().collection('orders').deleteOne({ id: Number(id) });
    return r.deletedCount > 0;
  },
};

/* ------------------------------ Config --------------------------------- */

const config = {
  async get(key, fallback = null) {
    const doc = await db().collection('config').findOne({ _id: key });
    return doc ? doc.value : fallback;
  },
  async set(key, value) {
    await db().collection('config').replaceOne(
      { _id: key },
      { _id: key, value },
      { upsert: true }
    );
    return value;
  },
};

/* ------------------------------ Reset ---------------------------------- */

async function reset() {
  await Promise.all([
    db().collection('categories').deleteMany({}),
    db().collection('products').deleteMany({}),
    db().collection('orders').deleteMany({}),
    db().collection('counters').deleteMany({}),
    db().collection('config').deleteMany({}),
  ]);
}

module.exports = {
  connect, disconnect,
  categories, products, orders, config,
  reset, slugify, isVideoUrl,
};
