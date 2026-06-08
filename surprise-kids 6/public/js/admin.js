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
  const [prodRes, cats, orders, top] = await Promise.all([
    fetch(`${API}/products?limit=1000&comingSoon=all`).then(r => r.json()),
    fetch(`${API}/categories`).then(r => r.json()),
    fetch(`${API}/orders`).then(r => r.json()),
    fetch(`${API}/products/top?limit=8`).then(r => r.json()).catch(() => ({ items: [] })),
  ]);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const newOrders = orders.filter(o => o.status === 'new').length;
  const lowStock = (prodRes.items || []).filter(p => p.stock != null && p.stock > 0 && p.stock <= 5);
  const topItems = (top && top.items) || [];
  view.innerHTML = `
    <h1>Dashboard</h1>
    <div class="stat-row">
      <div class="stat"><div class="n">${prodRes.total}</div><div class="l">Products</div></div>
      <div class="stat"><div class="n">${cats.length}</div><div class="l">Categories</div></div>
      <div class="stat"><div class="n">${orders.length}</div><div class="l">Orders</div></div>
      <div class="stat"><div class="n">${newOrders}</div><div class="l">New orders</div></div>
      <div class="stat"><div class="n">${money(revenue)}</div><div class="l">Order value</div></div>
    </div>

    <div class="dash-cols">
      <div>
        <div class="section-head"><h2 style="font-size:1.3rem">Recent orders</h2></div>
        ${orders.length ? ordersTable(orders.slice(0, 6)) : '<p class="muted">No orders yet.</p>'}
      </div>
      <div>
        <div class="section-head"><h2 style="font-size:1.3rem">🔥 Most viewed</h2></div>
        ${topItems.length ? `
          <div class="top-list">
            ${topItems.map((p, i) => `
              <div class="top-row">
                <span class="top-rank">${i + 1}</span>
                <img src="${esc(imgOf(p))}" alt="" ${IMG_FALLBACK}>
                <span class="top-name">${esc(p.name)}</span>
                <span class="top-views">${p.views || 0} views</span>
              </div>`).join('')}
          </div>` : '<p class="muted">No views tracked yet. Views are counted when customers open a product page.</p>'}

        ${lowStock.length ? `
          <div class="section-head" style="margin-top:18px"><h2 style="font-size:1.3rem">⚠️ Low stock</h2></div>
          <div class="top-list">
            ${lowStock.slice(0, 8).map(p => `
              <div class="top-row">
                <img src="${esc(imgOf(p))}" alt="" ${IMG_FALLBACK}>
                <span class="top-name">${esc(p.name)}</span>
                <span class="top-views" style="color:var(--coral)">${p.stock} left</span>
              </div>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
  bindOrderRows();
}

/* ------------------------------- products ------------------------------- */
let CATS_CACHE = [];
async function viewProducts() {
  const view = $('#view');
  view.innerHTML = '<h1>Products</h1><p class="muted">Loading…</p>';
  const [res, cats] = await Promise.all([
    fetch(`${API}/products?limit=1000&sort=newest&comingSoon=all`).then(r => r.json()),
    fetch(`${API}/categories`).then(r => r.json()),
  ]);
  CATS_CACHE = cats;
  view.innerHTML = `
    <div class="section-head">
      <h1>Products <span class="muted" style="font-size:1rem">(${res.total})</span></h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="import-csv">⬆ Import CSV</button>
        <button class="btn btn-primary" id="add-product">+ Add product</button>
      </div>
    </div>
    <table class="data-table">
      <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th><th>Views</th><th></th></tr></thead>
      <tbody>
        ${res.items.map(p => `
          <tr>
            <td><img class="thumb" src="${esc(imgOf(p))}" alt="" ${IMG_FALLBACK}></td>
            <td><strong>${esc(p.name)}</strong>${p.featured ? ' <span class="tag yellow">★</span>' : ''}${p.comingSoon ? ' <span class="tag" style="background:#e9d5ff;color:#6b21a8">Coming soon</span>' : ''}</td>
            <td>${esc(p.category ? p.category.name : '—')}</td>
            <td>${p.comingSoon && !p.price ? '<span class="muted">—</span>' : money(p.price)}</td>
            <td class="muted">${p.mrp ? money(p.mrp) : '—'}</td>
            <td>${stockCell(p)}</td>
            <td class="muted">${p.views || 0}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-edit='${esc(JSON.stringify(p))}'>Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${p.id}">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $('#add-product').onclick = () => productForm(null);
  $('#import-csv').onclick = () => importCsvForm();
  $$('[data-edit]').forEach(b => b.onclick = () => productForm(JSON.parse(b.getAttribute('data-edit'))));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this product?')) return;
    await fetch(`${API}/products/${b.dataset.del}`, { method: 'DELETE' });
    toast('Product deleted'); viewProducts();
  });
}

// Stock cell for the admin table: count when tracked, else In/Out.
function stockCell(p) {
  if (p.stock === null || p.stock === undefined) {
    return p.inStock ? '<span class="tag green">In</span>' : '<span class="tag red">Out</span>';
  }
  if (p.stock <= 0) return '<span class="tag red">0</span>';
  if (p.stock <= 5) return `<span class="tag yellow">${p.stock} left</span>`;
  return `<span class="tag green">${p.stock}</span>`;
}

/* ------------------------------ CSV import ------------------------------ */
// Minimal CSV parser that handles quoted fields, commas and newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

const CSV_TEMPLATE =
`name,price,mrp,category,description,stock,featured,comingSoon,image
Glitter Gel Pens,120,150,Pen & Pencils,Pack of 10 sparkly gel pens,40,true,false,
Unicorn Eraser Set,60,,Erasers,Cute unicorn-shaped erasers,100,false,false,
Mystery Box (Soon),,,Return Gifts,A surprise bundle launching next month,,false,true,`;

function importCsvForm() {
  openModal(`
    <h3>Import products from CSV</h3>
    <p class="muted" style="font-size:.9rem">Upload a CSV with a header row. Recognised columns:
      <code>name, price, mrp, category, description, stock, featured, comingSoon, image</code>.
      <code>category</code> matches by name or slug (created if it doesn't exist). <code>image</code> is an optional URL.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
      <button class="btn btn-ghost btn-sm" id="csv-template">⬇ Download template</button>
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">📄 Choose CSV file
        <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
      </label>
    </div>
    <div id="csv-preview" class="muted" style="font-size:.85rem"></div>
    <div id="csv-result" style="margin-top:10px"></div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-primary" id="csv-import" disabled>Import</button>
      <button class="btn btn-ghost" id="csv-cancel">Close</button>
    </div>
  `);

  let parsedRows = [];

  $('#csv-cancel').onclick = closeModal;
  $('#csv-template').onclick = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sr-stationers-products-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('#csv-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const matrix = parseCsv(text);
    if (matrix.length < 2) { $('#csv-preview').textContent = 'CSV needs a header row and at least one product.'; return; }
    const header = matrix[0].map(h => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const truthy = (v) => /^(1|true|yes|y)$/i.test(String(v || '').trim());

    parsedRows = matrix.slice(1).map(cols => {
      const get = (n) => { const i = idx(n); return i >= 0 ? (cols[i] || '').trim() : ''; };
      return {
        name: get('name'),
        price: get('price') === '' ? '' : Number(get('price')),
        mrp: get('mrp') === '' ? null : Number(get('mrp')),
        categoryName: get('category'),
        description: get('description'),
        stock: get('stock') === '' ? null : Number(get('stock')),
        featured: truthy(get('featured')),
        comingSoon: truthy(get('comingsoon')),
        image: get('image'),
      };
    }).filter(r => r.name);

    $('#csv-preview').innerHTML = `Parsed <strong>${parsedRows.length}</strong> product(s). Ready to import.`;
    $('#csv-import').disabled = parsedRows.length === 0;
  };

  $('#csv-import').onclick = async () => {
    if (!parsedRows.length) return;
    $('#csv-import').disabled = true;
    $('#csv-result').innerHTML = '<p class="muted">Importing… resolving categories…</p>';

    // Resolve category names -> ids, creating any that don't exist.
    const cats = await fetch(`${API}/categories`).then(r => r.json());
    const bySlug = {}; const byName = {};
    cats.forEach(c => { bySlug[c.slug] = c.id; byName[c.name.toLowerCase()] = c.id; });

    async function ensureCategory(nameOrSlug) {
      if (!nameOrSlug) return null;
      const key = nameOrSlug.toLowerCase();
      if (byName[key] != null) return byName[key];
      if (bySlug[key] != null) return bySlug[key];
      // create it
      const created = await fetch(`${API}/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameOrSlug }),
      }).then(r => r.json());
      byName[created.name.toLowerCase()] = created.id;
      bySlug[created.slug] = created.id;
      return created.id;
    }

    const products = [];
    for (const r of parsedRows) {
      const categoryId = await ensureCategory(r.categoryName);
      products.push({
        name: r.name,
        price: r.price === '' ? (r.comingSoon ? 0 : '') : r.price,
        mrp: r.mrp,
        categoryId,
        description: r.description,
        stock: r.stock,
        featured: r.featured,
        comingSoon: r.comingSoon,
        images: r.image ? [r.image] : [],
      });
    }

    const res = await fetch(`${API}/products/bulk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products }),
    });
    const data = await res.json();
    if (!res.ok) { $('#csv-result').innerHTML = `<p style="color:var(--coral)">${esc(data.error || 'Import failed')}</p>`; $('#csv-import').disabled = false; return; }

    const failures = (data.results || []).filter(x => !x.ok);
    $('#csv-result').innerHTML = `
      <p><strong>✓ Imported ${data.created}</strong>${data.failed ? `, <span style="color:var(--coral)">${data.failed} failed</span>` : ''}.</p>
      ${failures.length ? `<ul class="muted" style="font-size:.85rem">${failures.slice(0, 10).map(f => `<li>${esc(f.name)}: ${esc(f.error)}</li>`).join('')}</ul>` : ''}
      <p class="muted">You can close this and refresh the product list.</p>`;
    toast(`Imported ${data.created} product(s)`);
    // Auto-refresh the products list behind the modal.
    viewProducts();
  };
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
      <label>Stock quantity <span class="muted">(optional — leave blank for unlimited)</span></label>
      <input id="f-stockqty" type="number" min="0" placeholder="e.g. 25" value="${p && p.stock != null ? p.stock : ''}">
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
      <label>Photos &amp; videos</label>
      <div class="muted" style="font-size:.85rem;margin-bottom:8px">${isEdit ? 'The first photo is the cover. Tap × to remove, tap a photo to make it the cover. Videos can be added too.' : 'Add photos and/or videos. Leave empty to auto-generate a cover from the category.'}</div>
      <div class="img-list" id="f-images"></div>
      <div id="up-status" class="muted" style="font-size:.85rem;margin-top:6px"></div>
    </div>
    <div class="row2">
      <label class="checkbox"><input type="checkbox" id="f-stock" ${!p || p.inStock ? 'checked' : ''}> In stock</label>
      <label class="checkbox"><input type="checkbox" id="f-feat" ${p && p.featured ? 'checked' : ''}> Featured</label>
    </div>
    <div class="field" style="margin-top:6px">
      <label class="checkbox"><input type="checkbox" id="f-coming" ${p && p.comingSoon ? 'checked' : ''}> 🔮 Coming soon (shown in the Coming Soon section, not for sale yet — price optional)</label>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn btn-primary" id="f-save">${isEdit ? 'Save changes' : 'Create product'}</button>
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `);

  // Per-form mutable image list + poster map. Seed from existing product.
  const initialImages = (p && Array.isArray(p.images) && p.images.length)
    ? [...p.images]
    : (p && p.image ? [p.image] : []);
  let images = [...initialImages];
  let posters = { ...(p && p.posters ? p.posters : {}) };

  function renderImages() {
    const wrap = $('#f-images');
    wrap.innerHTML = images.map((url, i) => `
      <div class="img-thumb" draggable="true" data-i="${i}">
        ${isVideo(url)
          ? (posters[url]
              ? `<img src="${esc(posters[url])}" alt="" ${IMG_FALLBACK}><span class="thumb-vid">▶</span>`
              : `<video src="${esc(url)}" muted playsinline preload="metadata"></video><span class="thumb-vid">▶</span>`)
          : `<img src="${esc(url)}" alt="" ${IMG_FALLBACK}>`}
        ${i === 0 && !isVideo(url) ? '<span class="thumb-cover">Cover</span>' : ''}
        <button type="button" class="thumb-x" data-del="${i}" title="Remove">×</button>
      </div>
    `).join('') + `
      <label class="img-add" title="Upload photo or video">
        <span>+ Add media</span>
        <input type="file" id="f-image-file" accept="image/*,video/*" hidden>
      </label>`;
    $$('#f-images [data-del]').forEach(b => b.onclick = (ev) => {
      ev.preventDefault();
      const url = images[+b.dataset.del];
      delete posters[url];
      images.splice(+b.dataset.del, 1);
      renderImages();
    });
    // Click a thumb (not the × button) to make it the cover (images only).
    $$('#f-images .img-thumb').forEach(t => t.onclick = (ev) => {
      if (ev.target.closest('.thumb-x')) return;
      const i = +t.dataset.i;
      if (i > 0 && !isVideo(images[i])) { const [img] = images.splice(i, 1); images.unshift(img); renderImages(); }
    });
    $('#f-image-file').onchange = uploadOne;
  }

  // Capture a poster frame from a video File using a hidden <video> + canvas.
  function grabVideoPoster(file) {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata'; video.muted = true; video.playsInline = true;
        const url = URL.createObjectURL(file);
        video.src = url;
        let done = false;
        const finish = (blob) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(blob); };
        video.onloadeddata = () => { try { video.currentTime = Math.min(1, (video.duration || 2) / 2); } catch (e) {} };
        video.onseeked = () => {
          try {
            const w = video.videoWidth || 640, h = video.videoHeight || 480;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            canvas.toBlob(b => finish(b), 'image/jpeg', 0.82);
          } catch (e) { finish(null); }
        };
        video.onerror = () => finish(null);
        setTimeout(() => finish(null), 8000);
      } catch (e) { resolve(null); }
    });
  }

  async function uploadOne(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isVid = file.type.startsWith('video/');
    $('#up-status').textContent = isVid ? 'Uploading video… (this can take a moment)' : 'Uploading…';
    try {
      const fd = new FormData(); fd.append('image', file);
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      images.push(d.url);
      // For videos, grab a poster frame in the browser and upload it too.
      if (isVid) {
        $('#up-status').textContent = 'Creating video thumbnail…';
        const posterBlob = await grabVideoPoster(file);
        if (posterBlob) {
          const pfd = new FormData();
          pfd.append('image', new File([posterBlob], 'poster.jpg', { type: 'image/jpeg' }));
          const pr = await fetch(`${API}/upload`, { method: 'POST', body: pfd });
          const pd = await pr.json();
          if (pr.ok && pd.url) posters[d.url] = pd.url;
        }
      }
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
    const comingSoon = $('#f-coming').checked;
    const stockRaw = $('#f-stockqty').value.trim();
    const body = {
      name: $('#f-name').value.trim(),
      price: $('#f-price').value,
      mrp: $('#f-mrp').value || null,
      categoryId: $('#f-cat').value,
      description: $('#f-desc').value.trim(),
      images,
      posters,
      stock: stockRaw === '' ? null : stockRaw,
      inStock: $('#f-stock').checked,
      featured: $('#f-feat').checked,
      comingSoon,
    };
    if (!body.name) return toast('Name is required');
    if (!comingSoon && body.price === '') return toast('Price is required (or tick “Coming soon”)');
    if (comingSoon && body.price === '') body.price = 0;
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
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-order="${o.id}">View</button>
              <button class="btn btn-ghost btn-sm" data-delorder="${o.id}" data-ref="${esc(o.reference)}" title="Delete order">🗑</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
function statusTag(s) {
  const map = { new: 'yellow', confirmed: 'green', delivered: 'green', cancelled: 'red' };
  return `<span class="tag ${map[s] || ''}">${esc(s)}</span>`;
}
let ORDERS_CACHE = [];
async function viewOrders() {
  const view = $('#view');
  view.innerHTML = '<h1>Orders</h1><p class="muted">Loading…</p>';
  ORDERS_CACHE = await fetch(`${API}/orders`).then(r => r.json());
  view.innerHTML = `
    <div class="section-head">
      <h1>Orders <span class="muted" style="font-size:1rem">(${ORDERS_CACHE.length})</span></h1>
    </div>
    <div class="order-filters">
      <input id="o-search" placeholder="Search reference, name or phone…" autocomplete="off">
      <select id="o-status">
        <option value="">All statuses</option>
        <option value="new">New</option>
        <option value="confirmed">Confirmed</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
    <div id="orders-table-wrap"></div>`;

  const render = () => {
    const q = $('#o-search').value.trim().toLowerCase();
    const st = $('#o-status').value;
    let list = ORDERS_CACHE;
    if (st) list = list.filter(o => o.status === st);
    if (q) list = list.filter(o => {
      const hay = `${o.reference} ${o.customer && o.customer.name || ''} ${o.customer && o.customer.phone || ''}`.toLowerCase();
      return hay.includes(q);
    });
    $('#orders-table-wrap').innerHTML = list.length
      ? ordersTable(list)
      : '<p class="muted">No orders match your filters.</p>';
    bindOrderRows();
  };

  if (ORDERS_CACHE.length) {
    $('#o-search').addEventListener('input', render);
    $('#o-status').addEventListener('change', render);
    render();
  } else {
    $('#orders-table-wrap').innerHTML = '<p class="muted">No orders yet. Orders placed from the store will appear here.</p>';
  }
}
function bindOrderRows() {
  $$('[data-order]').forEach(b => b.onclick = () => openOrder(b.dataset.order));
  $$('[data-delorder]').forEach(b => b.onclick = () => deleteOrder(b.dataset.delorder, b.dataset.ref));
}

async function deleteOrder(id, ref) {
  if (!confirm(`Delete order ${ref || ''}? This permanently removes it and cannot be undone.`)) return;
  const r = await fetch(`${API}/orders/${id}`, { method: 'DELETE' });
  if (!r.ok) { const d = await r.json().catch(() => ({})); return toast(d.error || 'Delete failed'); }
  toast('Order deleted');
  closeModal();
  route('orders');
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
      <button class="btn btn-ghost" id="o-del">🗑 Delete</button>
      <button class="btn btn-ghost" id="o-close">Close</button>
    </div>
  `);
  $('#o-close').onclick = closeModal;
  $('#o-del').onclick = () => deleteOrder(id, o.reference);
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
