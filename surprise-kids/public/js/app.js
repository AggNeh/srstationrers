/* =========================================================================
   app.js — shared storefront logic: config, cart, header/footer, helpers
   ========================================================================= */

const API = '/api';
const CART_KEY = 'sk_cart_v1';

/* ------------------------------- config --------------------------------- */
let STORE = {
  name: 'Surprise Kids', tagline: 'A Unit of RRL Creations',
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
    image: product.image,
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
          <a class="cart-btn" href="/cart">🛒 Cart <span class="cart-count">0</span></a>
        </div>
      </div>
      <nav class="cat-nav">
        <div class="cat-nav-scroll container" id="cat-nav"></div>
      </nav>`;
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new FormData(e.target).get('q').trim();
      location.href = q ? `/?search=${encodeURIComponent(q)}` : '/';
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
          <a href="/">Latest Arrivals</a>
          <a href="/?category=return-gifts">Return Gifts</a>
          <a href="/?category=games-toy">Games &amp; Toys</a>
          <a href="/?category=bags">Bags</a>
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
    nav.innerHTML =
      `<a class="cat-chip ${!activeSlug ? 'active' : ''}" href="/">✨ Latest Arrivals</a>` +
      cats.map((c) =>
        `<a class="cat-chip ${activeSlug === c.slug ? 'active' : ''}" href="/?category=${c.slug}">${esc(c.name)}</a>`
      ).join('');
  } catch (e) { nav.innerHTML = ''; }
}

/* ---------------------------- product card ------------------------------ */
function productCard(p, i = 0) {
  const off = discount(p.price, p.mrp);
  const badge = !p.inStock
    ? '<span class="badge oos">Sold out</span>'
    : off ? `<span class="badge sale">${off}% OFF</span>`
    : p.featured ? '<span class="badge new">New</span>' : '';
  return `
    <article class="card reveal" style="animation-delay:${Math.min(i, 12) * 0.04}s">
      <div class="card-media" onclick="location.href='/product/${p.slug}'">
        ${badge}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
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
            ? `<button class="btn btn-sun btn-block" data-add='${esc(JSON.stringify({ id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.image }))}'>Add to Cart</button>`
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
