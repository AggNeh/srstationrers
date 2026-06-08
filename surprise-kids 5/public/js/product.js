/* product.js — product detail page */

function slugFromPath() {
  const m = location.pathname.match(/\/product\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : qs('slug');
}

let current = null;
let qty = 1;

/**
 * Wire up the swipe gallery: paging dots, prev/next arrows, thumbnail
 * clicks, and keyboard arrows. The gallery itself is a horizontal-scroll
 * container with CSS scroll-snap, so native touch-swipe just works.
 */
function wireGallery(n) {
  const gallery = $('#pdp-gallery');
  if (!gallery) return;
  const dots = $$('.pdp-dot');
  const thumbs = $$('.pdp-thumb');
  const counter = $('#pdp-counter');
  const prev = $('#pdp-prev');
  const next = $('#pdp-next');
  let current = 0;

  function slideWidth() { return gallery.clientWidth; }
  function go(i) {
    const target = Math.max(0, Math.min(n - 1, i));
    gallery.scrollTo({ left: target * slideWidth(), behavior: 'smooth' });
  }
  function setActive(i) {
    if (i === current) return;
    current = i;
    dots.forEach((d, j) => d.classList.toggle('active', j === i));
    thumbs.forEach((t, j) => t.classList.toggle('active', j === i));
    if (counter) counter.textContent = `${i + 1} / ${n}`;
  }

  // Update active slide as user scrolls (debounced).
  let scrollTimer;
  gallery.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const i = Math.round(gallery.scrollLeft / slideWidth());
      setActive(i);
    }, 60);
  }, { passive: true });

  // Dots / thumbs jump.
  dots.forEach(d => d.onclick = () => go(+d.dataset.i));
  thumbs.forEach(t => t.onclick = () => go(+t.dataset.i));

  // Arrows (desktop).
  if (prev) prev.onclick = () => go(current - 1);
  if (next) next.onclick = () => go(current + 1);

  // Keyboard navigation when the gallery is focused.
  gallery.tabIndex = 0;
  gallery.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); go(current - 1); }
  });

  // Recalculate position on viewport resize so we stay snapped.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      gallery.scrollLeft = current * slideWidth();
    }, 100);
  });
}

function renderProduct(p) {
  document.title = `${p.name} · ${STORE.name}`;
  const off = discount(p.price, p.mrp);
  const root = $('#pdp-root');

  // Image gallery: prefer images[] when present, fall back to single image.
  const imgs = (Array.isArray(p.images) && p.images.length)
    ? p.images
    : (p.image ? [p.image] : []);
  const multi = imgs.length > 1;

  // Each slide is a full-width image with scroll-snap. The container is a
  // horizontal scroller, so native touch-swipe + trackpad scrolling works.
  const slides = imgs.length
    ? imgs.map((u, i) => `<img class="pdp-slide" src="${esc(u)}" data-i="${i}" alt="${esc(p.name)} — view ${i + 1}" draggable="false">`).join('')
    : `<div class="pdp-slide pdp-empty">No image</div>`;

  const dots = multi
    ? `<div class="pdp-dots" id="pdp-dots">
         ${imgs.map((_, i) => `<button class="pdp-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Show image ${i + 1}"></button>`).join('')}
       </div>`
    : '';

  const arrows = multi
    ? `<button class="pdp-nav prev" id="pdp-prev" aria-label="Previous image">‹</button>
       <button class="pdp-nav next" id="pdp-next" aria-label="Next image">›</button>
       <div class="pdp-counter" id="pdp-counter">1 / ${imgs.length}</div>`
    : '';

  const thumbs = multi
    ? `<div class="pdp-thumbs">
         ${imgs.map((u, i) => `<img class="pdp-thumb${i === 0 ? ' active' : ''}" src="${esc(u)}" data-i="${i}" alt="" draggable="false">`).join('')}
       </div>`
    : '';

  root.innerHTML = `
    <div class="pdp">
      <div class="pdp-media reveal">
        <div class="pdp-gallery-wrap">
          ${arrows}
          <div class="pdp-gallery" id="pdp-gallery">${slides}</div>
        </div>
        ${dots}
        ${thumbs}
      </div>
      <div class="pdp-info reveal" style="animation-delay:.08s">
        <div class="crumb"><a href="/">Home</a> ${p.category ? `· <a href="/category/${p.category.slug}">${esc(p.category.name)}</a>` : ''}</div>
        ${p.category ? `<span class="card-cat">${esc(p.category.name)}</span>` : ''}
        <h1>${esc(p.name)}</h1>
        <div class="pdp-price">
          <span class="price">${money(p.price)}</span>
          ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
          ${off ? `<span class="off">${off}% off</span>` : ''}
        </div>
        <p>${p.inStock ? '<span class="tag green">In stock</span>' : '<span class="tag red">Out of stock</span>'}</p>

        <div class="pdp-buy">
          <div class="qty" ${!p.inStock ? 'style="opacity:.5;pointer-events:none"' : ''}>
            <button id="dec" aria-label="decrease">−</button>
            <span id="qv">1</span>
            <button id="inc" aria-label="increase">+</button>
          </div>
          ${p.inStock
            ? `<button class="btn btn-primary" id="add">🛒 Add to Cart</button>
               <button class="btn btn-sun" id="buy">Order on WhatsApp</button>`
            : `<button class="btn btn-ghost" disabled>Currently unavailable</button>`}
        </div>

        <div class="pdp-desc">
          <h3 style="font-size:1.1rem;margin-bottom:6px">About this product</h3>
          <p class="muted" style="margin:0">${esc(p.description)}</p>
        </div>
      </div>
    </div>`;

  if (multi) wireGallery(imgs.length);

  if (p.inStock) {
    $('#inc').onclick = () => { qty++; $('#qv').textContent = qty; };
    $('#dec').onclick = () => { if (qty > 1) qty--; $('#qv').textContent = qty; };
    $('#add').onclick = () => addToCart(p, qty);
    $('#buy').onclick = () => orderNow(p);
  }
}

async function orderNow(p) {
  // Single-item express order straight to WhatsApp (no payment)
  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: p.id, qty }] }),
    });
    const data = await res.json();
    window.open(data.whatsappUrl, '_blank');
  } catch (e) { toast('Could not start order, please try again'); }
}

async function loadRelated(p) {
  if (!p.category) return;
  const res = await fetch(`${API}/products?category=${p.category.slug}&limit=5`).then(r => r.json());
  const items = res.items.filter((x) => x.id !== p.id).slice(0, 4);
  if (!items.length) return;
  $('#related-section').style.display = '';
  $('#related').innerHTML = items.map((x, i) => productCard(x, i)).join('');
}

async function init() {
  const slug = slugFromPath();
  await renderChrome();
  try {
    const res = await fetch(`${API}/products/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error('not found');
    current = await res.json();
    renderProduct(current);
    renderCatNav(current.category ? current.category.slug : '');
    loadRelated(current);
  } catch (e) {
    $('#pdp-root').innerHTML = `
      <div class="empty">
        <div class="big">🧸</div>
        <h2>Product not found</h2>
        <p class="muted">This item may have been removed.</p>
        <a class="btn btn-primary" href="/shop">Back to shop</a>
      </div>`;
  }
}

init();
