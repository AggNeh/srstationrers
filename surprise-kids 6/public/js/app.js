/* =========================================================================
   app.js — shared storefront logic: config, cart, header/footer, helpers
   ========================================================================= */

const API = '/api';
const CART_KEY = 'sk_cart_v1';

/* When the access gate is on and a cookie has expired or the code was
   rotated, API calls come back 401 with an X-Access-Gated header. Redirect
   the visitor to the gate page so they can re-enter the code, instead of
   silently showing an empty page. */
(function installGateRedirect() {
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    try {
      if (res.status === 401 && res.headers.get('X-Access-Gated') === '1'
          && !location.pathname.startsWith('/gate')) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/gate.html?next=${next}`;
      }
    } catch (e) { /* ignore */ }
    return res;
  };
})();

/* ------------------------------ media helpers --------------------------- */
// 1x1 transparent + a friendly placeholder used when an image is missing or
// fails to load (prevents broken-image icons in the cart and cards).
const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23f3eee6'/%3E%3Ctext x='200' y='210' font-size='120' text-anchor='middle'%3E%F0%9F%8E%81%3C/text%3E%3C/svg%3E";

function isVideo(url) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|#|$)/i.test(String(url || ''));
}
// Poster image for a given video URL, if the product has one stored.
function posterFor(p, url) {
  return (p && p.posters && p.posters[url]) || '';
}
// Best image to show for a product: explicit cover, else first non-video
// media, else a video's poster frame, else placeholder.
function imgOf(p) {
  if (!p) return PLACEHOLDER_IMG;
  if (p.image && !isVideo(p.image)) return p.image;
  if (Array.isArray(p.images)) {
    const firstImg = p.images.find(u => u && !isVideo(u));
    if (firstImg) return firstImg;
    const firstVid = p.images.find(u => u && isVideo(u));
    if (firstVid && posterFor(p, firstVid)) return posterFor(p, firstVid);
  }
  return PLACEHOLDER_IMG;
}
// Inline onerror handler string for <img> tags.
const IMG_FALLBACK = `onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'"`;

/* ------------------------------ stock badges ---------------------------- */
const LOW_STOCK = 5;
// Returns { cls, text } for a stock state, or null when no badge is needed.
function stockBadge(p) {
  if (!p || p.comingSoon) return null;
  if (p.stock === null || p.stock === undefined) {
    return p.inStock ? null : { cls: 'oos', text: 'Sold out' };
  }
  if (p.stock <= 0) return { cls: 'oos', text: 'Sold out' };
  if (p.stock <= LOW_STOCK) return { cls: 'low', text: `Only ${p.stock} left` };
  return null;
}

/* ------------------------------- config --------------------------------- */
let STORE = {
  name: 'SR Stationers', tagline: 'Stationery, gifts & return gifts',
  whatsapp: '919999999999', currency: '₹', email: '', phone: '', address: '',
  instagram: '#', facebook: '#',
};
async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    if (res.ok) STORE = await res.json();
  } catch (e) { /* keep defaults */ }
  return STORE;
}

/* ------------------------------- helpers -------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function money(n) { return `${STORE.currency}${Number(n).toLocaleString('en-IN')}`; }
function discount(price, mrp) {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qs(name) { return new URLSearchParams(location.search).get(name); }

/* -------------------------------- cart ---------------------------------- */
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
  document.dispatchEvent(new CustomEvent('cart:change'));
}
function cartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return getCart().reduce((s, i) => s + i.price * i.qty, 0); }

function addToCart(product, qty = 1) {
  const cart = getCart();
  const found = cart.find((i) => i.productId === product.id);
  if (found) found.qty += qty;
  else cart.push({
    productId: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    image: imgOf(product),
    qty,
  });
  saveCart(cart);
  toast(`Added “${product.name}” to cart 🎉`);
}
function setQty(productId, qty) {
  let cart = getCart();
  if (qty <= 0) cart = cart.filter((i) => i.productId !== productId);
  else { const it = cart.find((i) => i.productId === productId); if (it) it.qty = qty; }
  saveCart(cart);
}
function removeFromCart(productId) {
  saveCart(getCart().filter((i) => i.productId !== productId));
}
function clearCart() { saveCart([]); }

function updateCartCount() {
  $$('.cart-count').forEach((el) => {
    const c = cartCount();
    el.textContent = c;
    el.style.display = c > 0 ? 'grid' : 'none';
  });
}

/* -------------------------------- toast --------------------------------- */
function toast(msg) {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = esc(msg);
  wrap.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 2200);
  setTimeout(() => t.remove(), 2600);
}

/* --------------------------- header & footer ---------------------------- */
async function renderChrome(activeSlug) {
  await loadConfig();
  const header = $('#site-header');
  if (header) {
    header.innerHTML = `
      <div class="header-top container">
        <a class="brand" href="/">
          <span class="brand-mark">🎁</span>
          <span class="brand-name">${esc(STORE.name)}<span>${esc(STORE.tagline)}</span></span>
        </a>
        <form class="search" id="search-form" role="search">
          <input type="search" name="q" placeholder="Search erasers, bags, toys…" aria-label="Search products" value="${esc(qs('search') || '')}">
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
        <div class="header-actions">
          <a class="header-link" href="/coming-soon">✨ Coming soon</a>
          <a class="header-link" href="/orders">📦 My Orders</a>
          <a class="cart-btn" href="/cart">🛒 Cart <span class="cart-count">0</span></a>
        </div>
      </div>
      <nav class="cat-nav">
        <div class="cat-nav-scroll container" id="cat-nav"></div>
      </nav>`;
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new FormData(e.target).get('q').trim();
      location.href = q ? `/shop?search=${encodeURIComponent(q)}` : '/shop';
    });
    renderCatNav(activeSlug);
  }

  const footer = $('#site-footer');
  if (footer) {
    footer.innerHTML = `
      <div class="container footer-grid">
        <div class="footer-brand">
          <div class="brand-name">${esc(STORE.name)}</div>
          <p class="muted" style="color:#b9b9cf;max-width:340px">Joyful stationery, gifts, toys and return-gift goodies for kids — curated by ${esc(STORE.tagline)}. Order easily on WhatsApp, no online payment needed.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <a href="/shop">All products</a>
          <a href="/category/return-gifts">Return Gifts</a>
          <a href="/category/games-toy">Games &amp; Toys</a>
          <a href="/category/bags">Bags</a>
          <a href="/orders">My orders</a>
        </div>
        <div>
          <h4>Contact</h4>
          <a href="https://wa.me/${esc(STORE.whatsapp)}" target="_blank" rel="noopener">WhatsApp us</a>
          <a href="mailto:${esc(STORE.email)}">${esc(STORE.email)}</a>
          <a>${esc(STORE.phone)}</a>
          <a>${esc(STORE.address)}</a>
        </div>
      </div>
      <div class="footer-bottom container">© ${new Date().getFullYear()} ${esc(STORE.name)} · ${esc(STORE.tagline)} · Built as a catalog demo (no payment gateway).</div>`;
  }

  updateCartCount();
}

async function renderCatNav(activeSlug) {
  const nav = $('#cat-nav');
  if (!nav) return;
  try {
    const cats = await fetch(`${API}/categories`).then((r) => r.json());
    const onShop = location.pathname.startsWith('/shop') || location.pathname.startsWith('/category/');
    nav.innerHTML =
      `<a class="cat-chip ${onShop && !activeSlug ? 'active' : ''}" href="/shop">🛍️ All products</a>` +
      cats.map((c) =>
        `<a class="cat-chip ${activeSlug === c.slug ? 'active' : ''}" href="/category/${c.slug}">${esc(c.name)}</a>`
      ).join('');
  } catch (e) { nav.innerHTML = ''; }
}

/* ---------------------------- product card ------------------------------ */
function productCard(p, i = 0) {
  const off = discount(p.price, p.mrp);
  const sb = stockBadge(p);
  const badge = sb
    ? `<span class="badge ${sb.cls}">${sb.text}</span>`
    : off ? `<span class="badge sale">${off}% OFF</span>`
    : p.featured ? '<span class="badge new">New</span>' : '';
  return `
    <article class="card reveal" style="animation-delay:${Math.min(i, 12) * 0.04}s">
      <div class="card-media" onclick="location.href='/product/${p.slug}'">
        ${badge}
        <img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy" ${IMG_FALLBACK}>
      </div>
      <div class="card-body">
        <span class="card-cat">${esc(p.category ? p.category.name : '')}</span>
        <h3 class="card-title" onclick="location.href='/product/${p.slug}'">${esc(p.name)}</h3>
        <div class="price-row">
          <span class="price">${money(p.price)}</span>
          ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
          ${off ? `<span class="off">${off}% off</span>` : ''}
        </div>
        <div class="card-actions">
          ${p.inStock
            ? `<button class="btn btn-sun btn-block" data-add='${esc(JSON.stringify({ id: p.id, slug: p.slug, name: p.name, price: p.price, image: imgOf(p) }))}'>Add to Cart</button>`
            : `<button class="btn btn-ghost btn-block" disabled>Out of stock</button>`}
        </div>
      </div>
    </article>`;
}

// event delegation for "Add to Cart"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  try { addToCart(JSON.parse(btn.getAttribute('data-add'))); } catch {}
});

document.addEventListener('cart:change', updateCartCount);
