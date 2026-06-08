# SR Stationers 🎁

A full-stack **online catalog store** for kids' stationery, gifts, toys and
accessories — modelled on [surprisekids.catalog.to](https://surprisekids.catalog.to/),
**without any payment gateway**. Instead of online payment, customers place
their order as a pre-filled **WhatsApp message** (exactly how `catalog.to`
stores work), and the shop confirms and collects payment directly.

Everything — frontend **and** backend — lives in this one repo.

---

## ✨ Features

**Storefront**
- Home page with hero, category tiles and a "Latest Arrivals" grid
- Browse by category, full-text search, and sorting (newest / price / name)
- Product detail pages with quantity selector and related products
- Cart with live totals (persisted in the browser via `localStorage`)
- **WhatsApp checkout** — builds an order message with items, totals and
  customer details and opens `wa.me/...` (no card/UPI integration)
- Fully responsive, playful design (self-contained — no external image hosts)

**Admin panel** (`/admin`)
- Dashboard with product / category / order stats
- Product CRUD with image upload (or leave image blank — server auto-generates one themed by category)
- Inline "+ New category" from the product form so you can create a category while adding a product
- Category CRUD with a real form: custom emoji (picker + free text), color + accent presets and pickers, position ordering, and a live preview tile
- Storefront tiles use each category's emoji/color/accent directly, so anything you add shows up styled correctly with zero code changes
- Order list, detail view, status updates, and one-click "Open in WhatsApp"

**Backend**
- Node.js + Express REST API
- MongoDB data store (works with MongoDB Atlas free tier or any other Mongo)
- Self-contained SVG product images generated on the fly when none is uploaded

> The categories (Erasers, Keychains, Sharpeners, Return Gifts, Playing Cards,
> Carry Bags, Cosmetics, Bags, Bottles & Sippers, Pouches, Games/Toy, DOMS,
> Wipes, Home & Kitchen, Hair Accessories, Gift Wrap Sheet, Pen & Pencils,
> Lunch Box) mirror the reference store.

---

## 🚀 Getting started

```bash
# 1. install dependencies
npm install

# 2. configure MongoDB
cp .env.example .env
# edit .env and set MONGODB_URI (see below)

# 3. seed the catalog (creates 18 categories, 0 products by default)
npm run seed

# 4. start the server
npm start
```

**MongoDB setup:** sign up free at [mongodb.com/atlas](https://www.mongodb.com/atlas), create
a free M0 cluster, click **Connect → Drivers** and copy the `mongodb+srv://...`
connection string into `MONGODB_URI` in your `.env`. Atlas M0 is free forever,
allows commercial use, and holds 512 MB — plenty for a small-to-medium shop.

**Object storage setup (for product photos and videos):** product media should
never live in the database — store metadata in Mongo and the actual files in
S3-compatible object storage. The recommended free choice is **Cloudflare R2**:
10 GB free forever, zero egress fees, S3 API.

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → **Create bucket**, name it `srstationers-media`
2. **R2 → Manage R2 API Tokens → Create API token**, choose *Object Read & Write*, scoped to your bucket
3. On the bucket settings, enable a **public r2.dev URL** (or attach a custom domain)
4. Copy these into `.env` (or your Render service env vars):
   ```
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_ACCESS_KEY_ID=...
   STORAGE_SECRET_KEY=...
   STORAGE_BUCKET=srstationers-media
   STORAGE_PUBLIC_URL=https://pub-<id>.r2.dev
   ```

Uploads automatically resize photos to max 1600 px and re-encode as WebP
(turns a 5 MB JPEG into ~250 KB without visible quality loss). Videos up
to 100 MB pass through as-is. When the `STORAGE_*` vars aren't set the
upload route falls back to local disk — fine for dev, but on Render's
free tier the disk is wiped on every restart so you must use R2 in
production.

Then open:
- Storefront → http://localhost:3000
- Admin panel → http://localhost:3000/admin  (default credentials `admin` / `changeme` — change these via env vars)

For auto-reload during development: `npm run dev`.

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and edit. The most important value is your
**WhatsApp number** (international format, digits only):

```
STORE_WHATSAPP=919876543210
STORE_NAME=SR Stationers
STORE_TAGLINE=Stationery, gifts & return gifts
ADMIN_USER=admin
ADMIN_PASS=use-a-long-random-string-here
```

All settings have sensible defaults, so the app runs without a `.env` too.

---

## 🗂️ Project structure

```
surprise-kids/
├── server/
│   ├── server.js          # Express app + static hosting + pretty routes
│   ├── config.js          # store settings (env-overridable)
│   ├── db.js              # JSON-file data store (categories/products/orders)
│   ├── seed.js            # resets data, generates SVG images, inserts catalog
│   ├── seed-data.js       # category + product definitions
│   └── routes/
│       ├── products.js    # /api/products (+ image upload)
│       ├── categories.js  # /api/categories
│       └── orders.js      # /api/orders (builds WhatsApp link)
├── public/
│   ├── index.html         # storefront home / catalog
│   ├── product.html       # product detail
│   ├── cart.html          # cart + WhatsApp checkout
│   ├── admin.html         # admin panel
│   ├── css/styles.css     # design system
│   ├── js/                # app.js (shared), home.js, product.js, cart.js, admin.js
│   └── images/products/   # generated product images
├── (MongoDB)              # data lives in your Mongo cluster
├── .env.example
└── package.json
```

---

## 🔌 API reference

| Method | Endpoint                       | Purpose                                  |
|--------|--------------------------------|------------------------------------------|
| GET    | `/api/config`                  | Public store settings                    |
| GET    | `/api/categories`              | List categories (with product counts)    |
| POST   | `/api/categories`              | Create category (admin)                  |
| PUT    | `/api/categories/:id`          | Update category (admin)                  |
| DELETE | `/api/categories/:id`          | Delete category (admin)                  |
| GET    | `/api/products`                | List/search/filter/sort/paginate         |
| GET    | `/api/products/:idOrSlug`      | Single product                           |
| POST   | `/api/products`                | Create product (admin)                   |
| PUT    | `/api/products/:id`            | Update product (admin)                   |
| DELETE | `/api/products/:id`            | Delete product (admin)                   |
| POST   | `/api/products/upload`         | Upload product image → `{ url }`         |
| POST   | `/api/orders`                  | Create order → `{ order, whatsappUrl }`  |
| GET    | `/api/orders`                  | List orders (admin)                      |
| GET    | `/api/orders/:id`              | Order detail + WhatsApp link (admin)     |
| PUT    | `/api/orders/:id/status`       | Update order status (admin)              |

`GET /api/products` query params: `category`, `search`, `sort`
(`newest|price_asc|price_desc|name|oldest`), `featured`, `page`, `limit`.

---

## 🔐 Security note

Admin authentication is HTTP Basic Auth against the credentials set via the
`ADMIN_USER` and `ADMIN_PASS` environment variables. These protect the
admin dashboard *and* the admin-only API endpoints (`POST/PUT/DELETE` on
`/api/products` and `/api/categories`, plus reads on `/api/orders`). The
public order-placement endpoint (`POST /api/orders`) is intentionally left
open so customers can check out without an account.

**Always set ADMIN_USER and ADMIN_PASS to your own values via environment
variables before deploying.** The fall-back defaults (`admin` / `changeme`)
exist only so a fresh clone runs at all.

For higher-stakes deployments, consider also adding rate-limiting on the
login endpoint and serving the site behind HTTPS (Render and similar hosts
do this automatically).

There is intentionally **no payment processing** in this project.

---

## License

MIT
