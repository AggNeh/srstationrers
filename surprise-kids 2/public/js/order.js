/* order.js — view, edit and cancel a single customer order */

const ORDERS_KEY = 'sr_orders_v1';
const idParam = qs('id');
const tokenParam = qs('token') || '';
const refFromPath = (location.pathname.match(/^\/order\/([^/]+)/) || [])[1] || '';

let CURRENT = null;       // last loaded order
let CURRENT_TOKEN = tokenParam || '';
let LATEST_WHATSAPP = ''; // most recent WhatsApp link for this order

function statusTag(s) {
  const map = { new: 'yellow', confirmed: 'green', delivered: 'green', cancelled: 'red' };
  return `<span class="tag ${map[s] || ''}">${esc(s)}</span>`;
}

function tokenFromStorage(orderId) {
  try {
    const arr = JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
    const found = arr.find(o => Number(o.id) === Number(orderId));
    return found ? found.token : '';
  } catch (e) { return ''; }
}

async function loadOrder() {
  const view = $('#order-view');
  view.innerHTML = '<p class="muted">Loading…</p>';

  // Resolve token from URL or localStorage if not present.
  if (!CURRENT_TOKEN && idParam) CURRENT_TOKEN = tokenFromStorage(idParam);

  if (!idParam || !CURRENT_TOKEN) {
    view.innerHTML = `
      <div class="empty">
        <div class="big">🔒</div>
        <h2>Order link is incomplete</h2>
        <p class="muted">Open this order from your <a href="/orders">My Orders</a> page.</p>
      </div>`;
    return;
  }

  try {
    const r = await fetch(`${API}/orders/${idParam}?token=${encodeURIComponent(CURRENT_TOKEN)}`);
    if (!r.ok) {
      view.innerHTML = `
        <div class="empty">
          <div class="big">🚫</div>
          <h2>Can't open this order</h2>
          <p class="muted">It might have been removed, or the link is invalid.</p>
          <a class="btn btn-primary" href="/orders">Back to my orders</a>
        </div>`;
      return;
    }
    const data = await r.json();
    CURRENT = data.order;
    LATEST_WHATSAPP = data.whatsappUrl;
    document.title = `${CURRENT.reference} · SR Stationers`;
    render();
  } catch (e) {
    view.innerHTML = '<p class="muted">Failed to load order.</p>';
  }
}

function render() {
  const o = CURRENT;
  const editable = o.status === 'new';
  const view = $('#order-view');

  view.innerHTML = `
    <a class="back-link" href="/orders">← Back to my orders</a>

    <div class="section-head">
      <div>
        <div class="kicker">Order ${esc(o.reference)} · ${new Date(o.createdAt).toLocaleString()}</div>
        <h2>${editable ? 'Your order' : 'Order details'} ${statusTag(o.status)}</h2>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-sun" id="wa-link" href="${esc(LATEST_WHATSAPP)}" target="_blank" rel="noopener">💬 Open in WhatsApp</a>
        ${editable ? '<button class="btn btn-ghost" id="cancel-btn">Cancel order</button>' : ''}
      </div>
    </div>

    ${!editable ? `<div class="banner muted">This order is ${o.status}. Edits are locked — please <a href="${esc(LATEST_WHATSAPP)}" target="_blank" rel="noopener">message us on WhatsApp</a> for any changes.</div>` : ''}

    <div class="order-grid">
      <div>
        <h3>Items</h3>
        <div id="items"></div>
        ${editable ? '<button class="btn btn-ghost btn-sm" id="add-more">+ Add more items from the shop</button>' : ''}
      </div>
      <aside class="order-summary">
        <h3>Customer details</h3>
        <div class="field"><label>Name</label><input id="c-name" value="${esc(o.customer.name || '')}" ${editable ? '' : 'disabled'}></div>
        <div class="field"><label>Phone</label><input id="c-phone" value="${esc(o.customer.phone || '')}" ${editable ? '' : 'disabled'}></div>
        <div class="field"><label>Delivery address</label><textarea id="c-addr" rows="3" ${editable ? '' : 'disabled'}>${esc(o.customer.address || '')}</textarea></div>
        <div class="field"><label>Note</label><textarea id="c-note" rows="2" ${editable ? '' : 'disabled'}>${esc(o.note || '')}</textarea></div>

        <div class="totals">
          <div class="line"><span>Subtotal</span><strong id="subtotal">${money(o.total)}</strong></div>
          <div class="line total"><span>Total</span><strong id="total">${money(o.total)}</strong></div>
        </div>

        ${editable ? `
          <button class="btn btn-primary btn-block" id="save-btn">Save & re-send on WhatsApp</button>
          <p class="muted" style="font-size:.85rem;margin-top:10px">Saving will reopen WhatsApp with the updated order — send it to confirm the changes.</p>
        ` : ''}
      </aside>
    </div>
  `;

  renderItems();

  if (editable) {
    $('#cancel-btn').onclick = doCancel;
    $('#save-btn').onclick = doSave;
    const addMore = $('#add-more');
    if (addMore) addMore.onclick = () => { location.href = '/shop'; };
  }
}

function renderItems() {
  const editable = CURRENT.status === 'new';
  const wrap = $('#items');
  if (!CURRENT.items.length) {
    wrap.innerHTML = '<p class="muted">No items left in this order.</p>';
    recomputeTotal();
    return;
  }
  wrap.innerHTML = CURRENT.items.map((it, i) => `
    <div class="order-item">
      <div class="oi-name">
        <strong>${esc(it.name)}</strong>
        <div class="muted" style="font-size:.85rem">${money(it.price)} each</div>
      </div>
      <div class="oi-qty">
        ${editable ? `
          <button class="qty-btn" data-act="dec" data-i="${i}">−</button>
          <span class="qty-val">${it.qty}</span>
          <button class="qty-btn" data-act="inc" data-i="${i}">+</button>
        ` : `× ${it.qty}`}
      </div>
      <div class="oi-line"><strong>${money(it.qty * it.price)}</strong></div>
      ${editable ? `<button class="btn btn-ghost btn-sm" data-act="del" data-i="${i}">🗑</button>` : ''}
    </div>
  `).join('');

  if (editable) {
    wrap.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.i);
      const act = b.dataset.act;
      if (act === 'inc') CURRENT.items[i].qty++;
      if (act === 'dec') CURRENT.items[i].qty = Math.max(1, CURRENT.items[i].qty - 1);
      if (act === 'del') CURRENT.items.splice(i, 1);
      renderItems();
    });
  }
  recomputeTotal();
}

function recomputeTotal() {
  const t = CURRENT.items.reduce((s, it) => s + (it.price || 0) * (it.qty || 0), 0);
  $('#subtotal').textContent = money(t);
  $('#total').textContent = money(t);
}

async function doSave() {
  const body = {
    customer: {
      name: $('#c-name').value.trim(),
      phone: $('#c-phone').value.trim(),
      address: $('#c-addr').value.trim(),
    },
    items: CURRENT.items.map(it => ({ productId: it.productId, qty: it.qty })),
    note: $('#c-note').value.trim(),
  };
  if (!body.customer.name || !body.customer.phone) {
    return toast('Name and phone are required');
  }
  if (!CURRENT.items.length) {
    return toast('Add at least one item, or cancel the order instead.');
  }

  try {
    const r = await fetch(`${API}/orders/${CURRENT.id}?token=${encodeURIComponent(CURRENT_TOKEN)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return toast(data.error || 'Save failed');

    CURRENT = data.order;
    LATEST_WHATSAPP = data.whatsappUrl;
    toast('Order updated');
    // Re-open WhatsApp with the new order text so the customer can re-confirm.
    window.open(data.whatsappUrl, '_blank', 'noopener');
    render();
  } catch (e) { toast('Save failed: ' + e.message); }
}

async function doCancel() {
  if (!confirm('Cancel this order? You can re-order any time.')) return;
  try {
    const r = await fetch(`${API}/orders/${CURRENT.id}/cancel?token=${encodeURIComponent(CURRENT_TOKEN)}`, { method: 'POST' });
    const data = await r.json();
    if (!r.ok) return toast(data.error || 'Cancel failed');
    CURRENT = data.order;
    LATEST_WHATSAPP = data.whatsappUrl;
    toast('Order cancelled');
    render();
  } catch (e) { toast('Cancel failed: ' + e.message); }
}

async function init() {
  await renderChrome('');
  await loadOrder();
}

init();
