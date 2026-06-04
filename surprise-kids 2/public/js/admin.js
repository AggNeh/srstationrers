/* admin.js — management dashboard
   Auth is real HTTP Basic Auth against the server; credentials are configured
   via ADMIN_USER / ADMIN_PASS env vars. */

const AUTH_KEY = 'sr_admin_creds';   // base64(user:pass) for this session only

// Wrap fetch so every /api/* call from the admin page carries the auth header.
// (Public endpoints simply ignore the header.)
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (url.startsWith('/api/') || url.startsWith('/api')) {
    const creds = sessionStorage.getItem(AUTH_KEY);
    if (creds) {
      init.headers = { ...(init.headers || {}), Authorization: 'Basic ' + creds };
    }
  }
  return _origFetch(input, init);
};

/* ------------------------------- auth gate ------------------------------ */
function showShell() {
  $('#login').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  route('dash');
}

async function verifyCreds(creds) {
  try {
    const r = await _origFetch('/api/admin/check', { headers: { Authorization: 'Basic ' + creds } });
    return r.ok;
  } catch (e) { return false; }
}

async function initAuth() {
  const saved = sessionStorage.getItem(AUTH_KEY);
  if (saved && await verifyCreds(saved)) return showShell();
  sessionStorage.removeItem(AUTH_KEY);
  $('#login-btn').onclick = tryLogin;
  const onEnter = (e) => { if (e.key === 'Enter') tryLogin(); };
  $('#user').addEventListener('keydown', onEnter);
  $('#pass').addEventListener('keydown', onEnter);
  $('#user').focus();
}

async function tryLogin() {
  const user = $('#user').value.trim();
  const pass = $('#pass').value;
  if (!user || !pass) return toast('Username and password are required');
  const creds = btoa(user + ':' + pass);
  if (await verifyCreds(creds)) {
    sessionStorage.setItem(AUTH_KEY, creds);
    $('#pass').value = '';
    showShell();
  } else {
    toast('Invalid credentials');
  }
}

/* ------------------------------- routing -------------------------------- */
function route(tab) {
  $$('.admin-nav button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'dash') viewDash();
  if (tab === 'products') viewProducts();
  if (tab === 'categories') viewCategories();
  if (tab === 'orders') viewOrders();
  if (tab === 'access') viewAccess();
}

/* ------------------------------ dashboard ------------------------------- */
async function viewDash() {
  const view = $('#view');
  view.innerHTML = '<h1>Dashboard</h1><p class="muted">Loading…</p>';
  const [prodRes, cats, orders] = await Promise.all([
    fetch(`${API}/products?limit=1000`).then(r => r.json()),
    fetch(`${API}/categories`).then(r => r.json()),
    fetch(`${API}/orders`).then(r => r.json()),
  ]);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const newOrders = orders.filter(o => o.status === 'new').length;
  view.innerHTML = `
    <h1>Dashboard</h1>
    <div class="stat-row">
      <div class="stat"><div class="n">${prodRes.total}</div><div class="l">Products</div></div>
      <div class="stat"><div class="n">${cats.length}</div><div class="l">Categories</div></div>
      <div class="stat"><div class="n">${orders.length}</div><div class="l">Orders</div></div>
      <div class="stat"><div class="n">${newOrders}</div><div class="l">New orders</div></div>
      <div class="stat"><div class="n">${money(revenue)}</div><div class="l">Order value</div></div>
    </div>
    <div class="section-head"><h2 style="font-size:1.3rem">Recent orders</h2></div>
    ${orders.length ? ordersTable(orders.slice(0, 6)) : '<p class="muted">No orders yet.</p>'}`;
  bindOrderRows();
}

/* ------------------------------- products ------------------------------- */
let CATS_CACHE = [];
async function viewProducts() {
  const view = $('#view');
  view.innerHTML = '<h1>Products</h1><p class="muted">Loading…</p>';
  const [res, cats] = await Promise.all([
    fetch(`${API}/products?limit=1000&sort=newest`).then(r => r.json()),
    fetch(`${API}/categories`).then(r => r.json()),
  ]);
  CATS_CACHE = cats;
  view.innerHTML = `
    <div class="section-head">
      <h1>Products <span class="muted" style="font-size:1rem">(${res.total})</span></h1>
      <button class="btn btn-primary" id="add-product">+ Add product</button>
    </div>
    <table class="data-table">
      <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th><th></th></tr></thead>
      <tbody>
        ${res.items.map(p => `
          <tr>
            <td><img class="thumb" src="${esc(p.image)}" alt=""></td>
            <td><strong>${esc(p.name)}</strong>${p.featured ? ' <span class="tag yellow">★</span>' : ''}</td>
            <td>${esc(p.category ? p.category.name : '—')}</td>
            <td>${money(p.price)}</td>
            <td class="muted">${p.mrp ? money(p.mrp) : '—'}</td>
            <td>${p.inStock ? '<span class="tag green">In</span>' : '<span class="tag red">Out</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-edit='${esc(JSON.stringify(p))}'>Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${p.id}">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $('#add-product').onclick = () => productForm(null);
  $$('[data-edit]').forEach(b => b.onclick = () => productForm(JSON.parse(b.getAttribute('data-edit'))));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this product?')) return;
    await fetch(`${API}/products/${b.dataset.del}`, { method: 'DELETE' });
    toast('Product deleted'); viewProducts();
  });
}

function productForm(p) {
  const isEdit = !!p;
  const opts = CATS_CACHE.map(c => `<option value="${c.id}" ${p && p.categoryId === c.id ? 'selected' : ''}>${esc(c.emoji || '')} ${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>${isEdit ? 'Edit' : 'Add'} product</h3>
    <div class="field"><label>Name *</label><input id="f-name" value="${esc(p ? p.name : '')}"></div>
    <div class="row2">
      <div class="field"><label>Price * (₹)</label><input id="f-price" type="number" value="${p ? p.price : ''}"></div>
      <div class="field"><label>MRP (₹)</label><input id="f-mrp" type="number" value="${p && p.mrp ? p.mrp : ''}"></div>
    </div>
    <div class="field">
      <label>Category</label>
      <div style="display:flex;gap:8px">
        <select id="f-cat" style="flex:1">${opts}</select>
        <button type="button" class="btn btn-ghost btn-sm" id="f-newcat" title="Create a new category">+ New</button>
      </div>
    </div>
    <div class="field"><label>Description</label><textarea id="f-desc" rows="3">${esc(p ? p.description : '')}</textarea></div>
    <div class="field">
      <label>Images</label>
      <div class="muted" style="font-size:.85rem;margin-bottom:8px">${isEdit ? 'The first image is used as the product cover. Tap × to remove, tap "+ Add image" to upload more.' : 'Add one or more images. Leave empty to auto-generate one from the category.'}</div>
      <div class="img-list" id="f-images"></div>
      <div id="up-status" class="muted" style="font-size:.85rem;margin-top:6px"></div>
    </div>
    <div class="row2">
      <label class="checkbox"><input type="checkbox" id="f-stock" ${!p || p.inStock ? 'checked' : ''}> In stock</label>
      <label class="checkbox"><input type="checkbox" id="f-feat" ${p && p.featured ? 'checked' : ''}> Featured</label>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn btn-primary" id="f-save">${isEdit ? 'Save changes' : 'Create product'}</button>
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `);

  // Per-form mutable image list. Seed from existing product.
  const initialImages = (p && Array.isArray(p.images) && p.images.length)
    ? [...p.images]
    : (p && p.image ? [p.image] : []);
  let images = [...initialImages];

  function renderImages() {
    const wrap = $('#f-images');
    wrap.innerHTML = images.map((url, i) => `
      <div class="img-thumb" draggable="true" data-i="${i}">
        <img src="${esc(url)}" alt="">
        ${i === 0 ? '<span class="thumb-cover">Cover</span>' : ''}
        <button type="button" class="thumb-x" data-del="${i}" title="Remove">×</button>
      </div>
    `).join('') + `
      <label class="img-add" title="Upload image">
        <span>+ Add image</span>
        <input type="file" id="f-image-file" accept="image/*" hidden>
      </label>`;
    $$('#f-images [data-del]').forEach(b => b.onclick = (ev) => {
      ev.preventDefault();
      images.splice(+b.dataset.del, 1);
      renderImages();
    });
    // Click a thumb (not the × button) to make it the cover.
    $$('#f-images .img-thumb').forEach(t => t.onclick = (ev) => {
      if (ev.target.closest('.thumb-x')) return;
      const i = +t.dataset.i;
      if (i > 0) { const [img] = images.splice(i, 1); images.unshift(img); renderImages(); }
    });
    $('#f-image-file').onchange = uploadOne;
  }

  async function uploadOne(e) {
    const file = e.target.files[0];
    if (!file) return;
    $('#up-status').textContent = 'Uploading…';
    const fd = new FormData(); fd.append('image', file);
    try {
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      images.push(d.url);
      $('#up-status').textContent = '✓ Uploaded';
      renderImages();
    } catch (err) { $('#up-status').textContent = 'Upload failed: ' + err.message; }
  }

  renderImages();

  $('#f-newcat').onclick = () => {
    // Open the category form; when it saves, refresh CATS_CACHE and reselect the new one.
    categoryForm(null, async (created) => {
      const cats = await fetch(`${API}/categories`).then(r => r.json());
      CATS_CACHE = cats;
      const sel = $('#f-cat');
      sel.innerHTML = cats.map(c => `<option value="${c.id}" ${c.id === created.id ? 'selected' : ''}>${esc(c.emoji || '')} ${esc(c.name)}</option>`).join('');
    });
  };

  $('#f-cancel').onclick = closeModal;
  $('#f-save').onclick = async () => {
    const body = {
      name: $('#f-name').value.trim(),
      price: $('#f-price').value,
      mrp: $('#f-mrp').value || null,
      categoryId: $('#f-cat').value,
      description: $('#f-desc').value.trim(),
      images,
      inStock: $('#f-stock').checked,
      featured: $('#f-feat').checked,
    };
    if (!body.name) return toast('Name is required');
    if (body.price === '') return toast('Price is required');
    const url = isEdit ? `${API}/products/${p.id}` : `${API}/products`;
    const method = isEdit ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json(); return toast(d.error || 'Save failed'); }
    closeModal(); toast(isEdit ? 'Product updated' : 'Product created'); viewProducts();
  };
}

/* ------------------------------ categories ------------------------------ */
async function viewCategories() {
  const view = $('#view');
  const cats = await fetch(`${API}/categories`).then(r => r.json());
  view.innerHTML = `
    <div class="section-head">
      <h1>Categories <span class="muted" style="font-size:1rem">(${cats.length})</span></h1>
      <button class="btn btn-primary" id="add-cat">+ Add category</button>
    </div>
    <p class="muted" style="margin-top:-6px">Customise the look of each section. Emoji and colour are used on the storefront tiles and for auto-generated product images.</p>
    <table class="data-table">
      <thead><tr><th>#</th><th>Preview</th><th>Name</th><th>Slug</th><th>Products</th><th></th></tr></thead>
      <tbody>
        ${cats.map(c => `
          <tr>
            <td class="muted">${c.position}</td>
            <td>
              <div class="cat-chip" style="background:${esc(c.accent || '#eee')};border-color:${esc(c.color || '#ccc')}">
                ${c.image
                  ? `<img class="cat-chip-img" src="${esc(c.image)}" alt="">`
                  : `<span class="cat-chip-emoji">${esc(c.emoji || '🧷')}</span>`}
                <span class="cat-chip-dot" style="background:${esc(c.color || '#ccc')}"></span>
              </div>
            </td>
            <td><strong>${esc(c.name)}</strong></td>
            <td class="muted">${esc(c.slug)}</td>
            <td>${c.count}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-editcat='${esc(JSON.stringify(c))}'>Edit</button>
              <button class="btn btn-ghost btn-sm" data-delcat="${c.id}" data-delname="${esc(c.name)}" data-delcount="${c.count}">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $('#add-cat').onclick = () => categoryForm(null);
  $$('[data-editcat]').forEach(b => b.onclick = () => categoryForm(JSON.parse(b.getAttribute('data-editcat'))));
  $$('[data-delcat]').forEach(b => b.onclick = async () => {
    const count = +b.dataset.delcount;
    const warn = count > 0
      ? `Delete "${b.dataset.delname}"? ${count} product${count === 1 ? '' : 's'} will keep their data but lose this category.`
      : `Delete "${b.dataset.delname}"?`;
    if (!confirm(warn)) return;
    await fetch(`${API}/categories/${b.dataset.delcat}`, { method: 'DELETE' });
    toast('Category deleted'); viewCategories();
  });
}

// 12 vivid presets that play well with the candy theme.
const COLOR_PRESETS = [
  '#FF5A6A', '#FF9F1C', '#FFC93C', '#06D6A0', '#2EC4B6', '#118AB2',
  '#4D96FF', '#3A86FF', '#8338EC', '#9B5DE5', '#FF70A6', '#E63946',
];
// Quick-pick emoji set covering most kids-catalog categories.
const EMOJI_PICKS = [
  '🧼','🔑','✏️','🎁','🃏','🛍️','💄','🎒','🥤','👝','🧸','🖍️',
  '🧻','🍴','🎀','🎊','🖊️','🍱','📚','🎨','⚽','🎮','🧩','🪀',
  '🎂','🎈','🌈','⭐','🦄','🐻','🐱','🐶',
];

/**
 * Modal form for create/edit category.
 * @param {object|null} c - existing category or null for create
 * @param {function=} onSaved - optional callback (created/updated category)
 */
function categoryForm(c, onSaved) {
  const isEdit = !!c;
  const initial = c || { name: '', emoji: '🎁', color: '#FF5A6A', accent: '', position: '', image: '' };

  openModal(`
    <h3>${isEdit ? 'Edit' : 'Add'} category</h3>

    <div class="field"><label>Name *</label>
      <input id="c-name" value="${esc(initial.name)}" placeholder="e.g. Birthday Specials">
    </div>

    <div class="field"><label>Image (optional)</label>
      <input id="c-image" value="${esc(initial.image || '')}" placeholder="/images/... or upload below">
      <input type="file" id="c-image-file" accept="image/*" style="margin-top:8px">
      <div id="c-up-status" class="muted" style="font-size:.85rem">If set, the image replaces the emoji on the storefront tile.</div>
    </div>

    <div class="field"><label>Emoji (fallback when no image)</label>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <input id="c-emoji" value="${esc(initial.emoji)}" maxlength="6" style="width:80px;text-align:center;font-size:1.4rem">
        <span class="muted" style="font-size:.85rem">Tap a suggestion or type any emoji</span>
      </div>
      <div class="emoji-picks" id="emoji-picks">
        ${EMOJI_PICKS.map(e => `<button type="button" class="emoji-pick" data-e="${esc(e)}">${e}</button>`).join('')}
      </div>
    </div>

    <div class="row2">
      <div class="field"><label>Main color</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input id="c-color" type="color" value="${esc(initial.color || '#FF5A6A')}">
          <input id="c-color-hex" value="${esc(initial.color || '#FF5A6A')}" style="flex:1;font-family:monospace;text-transform:uppercase">
        </div>
        <div class="color-presets" id="color-presets" style="margin-top:8px">
          ${COLOR_PRESETS.map(p => `<button type="button" class="color-preset" data-c="${p}" style="background:${p}"></button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Accent (background tint)</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input id="c-accent" type="color" value="${esc(initial.accent || lightenJs(initial.color || '#FF5A6A'))}">
          <input id="c-accent-hex" value="${esc(initial.accent || lightenJs(initial.color || '#FF5A6A'))}" style="flex:1;font-family:monospace;text-transform:uppercase">
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="c-accent-auto" style="margin-top:8px">Auto from main color</button>
      </div>
    </div>

    ${isEdit ? `<div class="field"><label>Position (display order)</label><input id="c-position" type="number" value="${esc(String(initial.position ?? ''))}" style="max-width:120px"></div>` : ''}

    <div class="field"><label>Preview</label>
      <div class="cat-preview" id="cat-preview"></div>
    </div>

    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn btn-primary" id="c-save">${isEdit ? 'Save changes' : 'Create category'}</button>
      <button class="btn btn-ghost" id="c-cancel">Cancel</button>
    </div>
  `);

  $('#c-image-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#c-up-status').textContent = 'Uploading…';
    const fd = new FormData(); fd.append('image', file);
    try {
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      $('#c-image').value = d.url;
      $('#c-up-status').textContent = '✓ Uploaded';
      updatePreview();
    } catch (err) { $('#c-up-status').textContent = 'Upload failed: ' + err.message; }
  };

  function updatePreview() {
    const name = $('#c-name').value.trim() || 'New category';
    const emoji = $('#c-emoji').value || '🎁';
    const color = $('#c-color-hex').value || '#FF5A6A';
    const accent = $('#c-accent-hex').value || lightenJs(color);
    const image = $('#c-image').value.trim();
    const visual = image
      ? `<div class="emoji" style="padding:0"><img src="${esc(image)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px"></div>`
      : `<div class="emoji">${esc(emoji)}</div>`;
    $('#cat-preview').innerHTML = `
      <a class="cat-tile" style="background:linear-gradient(135deg, ${accent} 0%, #fff 100%);border:2px solid ${color}33">
        ${visual}
        <div class="name" style="color:${color}">${esc(name)}</div>
        <div class="count">0 items</div>
      </a>`;
  }

  // Sync color picker <-> hex text
  function bindColorPair(pickerId, hexId) {
    const picker = $(pickerId), hex = $(hexId);
    picker.oninput = () => { hex.value = picker.value.toUpperCase(); updatePreview(); };
    hex.oninput = () => {
      const v = hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
      updatePreview();
    };
  }
  bindColorPair('#c-color', '#c-color-hex');
  bindColorPair('#c-accent', '#c-accent-hex');

  // Color preset buttons set main color (and update accent only if user hasn't customised it)
  $$('#color-presets .color-preset').forEach(b => b.onclick = () => {
    const c = b.dataset.c;
    $('#c-color').value = c; $('#c-color-hex').value = c.toUpperCase();
    // refresh accent from new main color
    const a = lightenJs(c);
    $('#c-accent').value = a; $('#c-accent-hex').value = a;
    updatePreview();
  });

  $('#c-accent-auto').onclick = () => {
    const a = lightenJs($('#c-color-hex').value || '#FF5A6A');
    $('#c-accent').value = a; $('#c-accent-hex').value = a;
    updatePreview();
  };

  $$('#emoji-picks .emoji-pick').forEach(b => b.onclick = () => {
    $('#c-emoji').value = b.dataset.e; updatePreview();
  });

  $('#c-name').oninput = updatePreview;
  $('#c-emoji').oninput = updatePreview;
  $('#c-image').oninput = updatePreview;

  updatePreview();

  $('#c-cancel').onclick = closeModal;
  $('#c-save').onclick = async () => {
    const body = {
      name: $('#c-name').value.trim(),
      emoji: $('#c-emoji').value.trim() || '🎁',
      color: ($('#c-color-hex').value || '#FF5A6A').toUpperCase(),
      accent: ($('#c-accent-hex').value || lightenJs($('#c-color-hex').value)).toUpperCase(),
      image: $('#c-image').value.trim() || null,
    };
    if (isEdit) {
      const pos = $('#c-position');
      if (pos && pos.value !== '') body.position = Number(pos.value);
    }
    if (!body.name) return toast('Name is required');
    const url = isEdit ? `${API}/categories/${c.id}` : `${API}/categories`;
    const method = isEdit ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); return toast(d.error || 'Save failed'); }
    const saved = await r.json();
    closeModal();
    toast(isEdit ? 'Category updated' : 'Category created');
    if (typeof onSaved === 'function') onSaved(saved);
    else viewCategories();
  };
}

// JS mirror of the server's lightenColor — keeps the preview accurate
// without an extra round trip to the API.
function lightenJs(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#FFE2E5';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * 0.75);
  const hx = (c) => mix(c).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`.toUpperCase();
}

/* -------------------------------- orders -------------------------------- */
function ordersTable(orders) {
  return `
    <table class="data-table">
      <thead><tr><th>Ref</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr></thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td><strong>${esc(o.reference)}</strong></td>
            <td>${esc(o.customer && o.customer.name ? o.customer.name : '—')}<br><span class="muted">${esc(o.customer && o.customer.phone ? o.customer.phone : '')}</span></td>
            <td>${o.items.reduce((s, i) => s + i.qty, 0)}</td>
            <td>${money(o.total)}</td>
            <td>${statusTag(o.status)}</td>
            <td class="muted">${new Date(o.createdAt).toLocaleDateString()}</td>
            <td><button class="btn btn-ghost btn-sm" data-order="${o.id}">View</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
function statusTag(s) {
  const map = { new: 'yellow', confirmed: 'green', delivered: 'green', cancelled: 'red' };
  return `<span class="tag ${map[s] || ''}">${esc(s)}</span>`;
}
async function viewOrders() {
  const view = $('#view');
  const orders = await fetch(`${API}/orders`).then(r => r.json());
  view.innerHTML = `<h1>Orders <span class="muted" style="font-size:1rem">(${orders.length})</span></h1>` +
    (orders.length ? ordersTable(orders) : '<p class="muted">No orders yet. Orders placed from the store will appear here.</p>');
  bindOrderRows();
}
function bindOrderRows() {
  $$('[data-order]').forEach(b => b.onclick = () => openOrder(b.dataset.order));
}
async function openOrder(id) {
  const data = await fetch(`${API}/orders/${id}`).then(r => r.json());
  const o = data.order;
  openModal(`
    <h3>Order ${esc(o.reference)}</h3>
    <p class="muted">${new Date(o.createdAt).toLocaleString()}</p>
    <p><strong>${esc(o.customer.name || '—')}</strong> · ${esc(o.customer.phone || '')}<br>${esc(o.customer.address || '')}</p>
    ${o.note ? `<p class="muted">Note: ${esc(o.note)}</p>` : ''}
    <table class="data-table" style="margin:12px 0">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}</tbody>
      <tbody><tr><td><strong>Total</strong></td><td></td><td><strong>${money(o.total)}</strong></td></tr></tbody>
    </table>
    <div class="field"><label>Status</label>
      <select id="o-status">
        ${['new', 'confirmed', 'delivered', 'cancelled'].map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
      <a class="btn btn-sun" href="${esc(data.whatsappUrl)}" target="_blank" rel="noopener">Open in WhatsApp</a>
      <button class="btn btn-primary" id="o-save">Save status</button>
      <button class="btn btn-ghost" id="o-close">Close</button>
    </div>
  `);
  $('#o-close').onclick = closeModal;
  $('#o-save').onclick = async () => {
    await fetch(`${API}/orders/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: $('#o-status').value }) });
    closeModal(); toast('Status updated'); route('orders');
  };
}

/* -------------------------------- modal --------------------------------- */
function openModal(html) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${html}</div></div>`;
  $('#backdrop').onclick = (e) => { if (e.target.id === 'backdrop') closeModal(); };
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* --------------------------------- boot --------------------------------- */
(async function () {
  await loadConfig();
  $$('.admin-nav button[data-tab]').forEach(b => b.onclick = () => route(b.dataset.tab));
  $('#logout').onclick = () => { sessionStorage.removeItem(AUTH_KEY); location.reload(); };
  initAuth();
})();

/* ------------------------------ access code ----------------------------- */
async function viewAccess() {
  const view = $('#view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const cur = await fetch(`${API}/access/code`).then(r => r.json());
    renderAccess(cur);
  } catch (e) {
    view.innerHTML = '<p class="muted">Failed to load access code.</p>';
  }
}

function renderAccess(cur) {
  const view = $('#view');
  const code = cur.code || '';
  const gated = !!cur.gated;
  const updated = cur.updatedAt ? new Date(cur.updatedAt).toLocaleString() : 'never';

  view.innerHTML = `
    <div class="section-head">
      <div>
        <div class="kicker">Storefront gate</div>
        <h1>Access code</h1>
      </div>
      <span class="tag ${gated ? 'green' : ''}">${gated ? 'Gate ON' : 'Gate OFF'}</span>
    </div>
    <p class="muted">Visitors must enter this code before they can see the catalog. Rotate it daily and share with intended customers.</p>

    <div class="access-card">
      <div class="access-current">
        <div class="muted" style="font-size:.85rem">Current code</div>
        <div class="access-code" id="ac-code">${code ? esc(code) : '— gate disabled —'}</div>
        <div class="muted" style="font-size:.8rem;margin-top:6px">Last changed: ${updated}</div>
      </div>
      <div class="access-actions">
        <button class="btn btn-ghost btn-sm" id="ac-copy" ${code ? '' : 'disabled'}>📋 Copy code</button>
        <button class="btn btn-ghost btn-sm" id="ac-wa" ${code ? '' : 'disabled'}>💬 Share on WhatsApp</button>
      </div>
    </div>

    <div class="access-card">
      <h3 style="margin-top:0">Set a new code</h3>
      <p class="muted" style="font-size:.9rem">Pick any code — short numeric codes are easy to share over WhatsApp.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="ac-new" placeholder="e.g. 4821 or SR-MON" style="flex:1;min-width:200px;font-family:var(--display);letter-spacing:2px;text-transform:uppercase">
        <button class="btn btn-ghost btn-sm" id="ac-random4">🎲 Random 4-digit</button>
        <button class="btn btn-ghost btn-sm" id="ac-random6">🎲 Random 6-char</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-primary" id="ac-save">Save new code</button>
        <button class="btn btn-ghost" id="ac-disable">Disable gate</button>
      </div>
      <p class="muted" style="font-size:.85rem;margin-top:10px">Heads up: changing the code instantly logs out every visitor who had the old one. They will need the new code to come back in.</p>
    </div>
  `;

  $('#ac-copy').onclick = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => toast('Code copied to clipboard'));
  };
  $('#ac-wa').onclick = () => {
    if (!code || !STORE.whatsapp) return;
    const msg = encodeURIComponent(`${STORE.name || 'Catalog'} access code for today: ${code}\n\nOpen: https://${location.host}/`);
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
  };
  $('#ac-random4').onclick = () => {
    $('#ac-new').value = Math.floor(1000 + Math.random() * 9000);
  };
  $('#ac-random6').onclick = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
    let s = ''; for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    $('#ac-new').value = s;
  };
  $('#ac-save').onclick = () => saveAccessCode($('#ac-new').value.trim());
  $('#ac-disable').onclick = () => {
    if (!confirm('Turn off the access gate? The storefront will be visible to anyone with the URL.')) return;
    saveAccessCode('');
  };
  $('#ac-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveAccessCode($('#ac-new').value.trim()); });
}

async function saveAccessCode(newCode) {
  try {
    const r = await fetch(`${API}/access/code`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode }),
    });
    const data = await r.json();
    if (!r.ok) return toast(data.error || 'Save failed');
    toast(newCode ? 'Access code updated' : 'Access gate disabled');
    renderAccess(data);
  } catch (e) { toast('Save failed: ' + e.message); }
}
