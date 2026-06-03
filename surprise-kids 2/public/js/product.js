/* product.js — product detail page */

function slugFromPath() {
  const m = location.pathname.match(/\/product\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : qs('slug');
}

let current = null;
let qty = 1;

function renderProduct(p) {
  document.title = `${p.name} · ${STORE.name}`;
  const off = discount(p.price, p.mrp);
  const root = $('#pdp-root');

  // Image gallery: prefer images[] when present, fall back to single image.
  const imgs = (Array.isArray(p.images) && p.images.length)
    ? p.images
    : (p.image ? [p.image] : []);
  const main = imgs[0] || '';
  const thumbs = imgs.length > 1
    ? `<div class="pdp-thumbs">
         ${imgs.map((u, i) => `<img class="pdp-thumb${i === 0 ? ' active' : ''}" src="${esc(u)}" data-i="${i}" alt="View ${i + 1}">`).join('')}
       </div>`
    : '';

  root.innerHTML = `
    <div class="pdp">
      <div class="pdp-media reveal">
        <img id="pdp-main" src="${esc(main)}" alt="${esc(p.name)}">
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

  // Wire thumbnail swap
  $$('.pdp-thumb').forEach(t => t.onclick = () => {
    $('#pdp-main').src = t.src;
    $$('.pdp-thumb').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
  });

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
