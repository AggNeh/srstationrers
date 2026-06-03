const express = require('express');
const cors = require('cors');
const path = require('path');

const { STORE, PORT } = require('./config');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const ordersRouter = require('./routes/orders');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

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

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ----- static frontend -----
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// pretty routes -> serve the relevant HTML page (client-side handles the rest)
app.get('/category/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/product/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'product.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'cart.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

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
