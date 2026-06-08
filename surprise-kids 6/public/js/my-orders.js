/* my-orders.js — customer-facing order list */

const ORDERS_KEY = 'sr_orders_v1'; // array of { id, reference, token }

function getStoredOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
  catch (e) { return []; }
}

function statusTag(s) {
  const map = { new: 'yellow', confirmed: 'green', delivered: 'green', cancelled: 'red' };
  return `<span class="tag ${map[s] || ''}">${esc(s)}</span>`;
}

function orderRow(o, token) {
  // For local orders we pass the token from localStorage; for phone-lookup
  // results the token comes from the server response.
  const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
  return `
    <a class="order-row" href="/order/${esc(o.reference)}?id=${o.id}&token=${esc(token || '')}">
      <div>
        <strong>${esc(o.reference)}</strong>
        <span class="muted" style="margin-left:8px">${new Date(o.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="muted" style="font-size:.9rem">${itemCount} item${itemCount === 1 ? '' : 's'} · ${money(o.total)}</div>
      <div>${statusTag(o.status)}</div>
    </a>`;
}

async function loadLocalOrders() {
  const container = $('#local-orders');
  const stored = getStoredOrders();
  if (!stored.length) {
    container.innerHTML = '<div class="empty" style="margin:18px 0"><div class="big">📦</div><h3>No orders on this device yet</h3><p class="muted">Once you place an order from this browser, it will appear here for easy re-ordering and edits.</p><a class="btn btn-primary" href="/shop">Start shopping</a></div>';
    return;
  }

  container.innerHTML = '<h3>Orders from this device</h3><div class="orders-list" id="ll"></div>';
  const list = $('#ll');
  const rows = [];
  // Resolve each by ID using its stored token.
  for (const stub of stored) {
    try {
      const r = await fetch(`${API}/orders/${stub.id}?token=${encodeURIComponent(stub.token)}`);
      if (r.ok) {
        const data = await r.json();
        rows.push(orderRow(data.order, stub.token));
      } else {
        // Order is gone (e.g. data reset). Remove from local storage.
        const filtered = getStoredOrders().filter(o => o.id !== stub.id);
        localStorage.setItem(ORDERS_KEY, JSON.stringify(filtered));
      }
    } catch (e) { /* skip */ }
  }
  list.innerHTML = rows.length ? rows.join('') : '<p class="muted">No active orders on this device.</p>';
}

function bindLookup() {
  $('#lookup-btn').onclick = doLookup;
  $('#lookup-phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
}

async function doLookup() {
  const phone = $('#lookup-phone').value.trim();
  const out = $('#lookup-results');
  if (!phone) { out.innerHTML = '<p class="muted">Enter a phone number to search.</p>'; return; }
  out.innerHTML = '<p class="muted">Searching…</p>';
  try {
    const r = await fetch(`${API}/orders/lookup?phone=${encodeURIComponent(phone)}`);
    if (!r.ok) { out.innerHTML = '<p class="muted">Lookup failed.</p>'; return; }
    const list = await r.json();
    if (!list.length) {
      out.innerHTML = '<p class="muted">No orders found for that number.</p>';
      return;
    }
    out.innerHTML = '<div class="orders-list">' + list.map(o => orderRow(o, o.token)).join('') + '</div>';
    // While we're at it, merge any unknown orders into localStorage so they
    // appear in the "this device" list on next load.
    const known = new Set(getStoredOrders().map(o => o.id));
    const merged = getStoredOrders().concat(
      list.filter(o => !known.has(o.id)).map(o => ({ id: o.id, reference: o.reference, token: o.token }))
    );
    localStorage.setItem(ORDERS_KEY, JSON.stringify(merged));
  } catch (e) { out.innerHTML = '<p class="muted">Lookup failed.</p>'; }
}

async function init() {
  await renderChrome('');
  loadLocalOrders();
  bindLookup();
}

init();
