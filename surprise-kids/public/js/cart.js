/* cart.js — cart page + WhatsApp checkout (no payment gateway) */

function render() {
  const root = $('#cart-root');
  const cart = getCart();

  if (cart.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <div class="big">🛒</div>
        <h2>Your cart is empty</h2>
        <p class="muted">Add some goodies and they'll show up here.</p>
        <a class="btn btn-primary" href="/">Start shopping</a>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="cart-layout">
      <div>
        <div id="items"></div>
        <button class="btn btn-ghost btn-sm" id="clear">Clear cart</button>
      </div>
      <aside class="summary">
        <h3>Order summary</h3>
        <div class="row"><span>Items (<span id="sum-count"></span>)</span><span id="sum-sub"></span></div>
        <div class="row muted"><span>Delivery</span><span>Confirmed on WhatsApp</span></div>
        <div class="row total"><span>Total</span><span id="sum-total"></span></div>

        <h3 style="font-size:1.1rem;margin:18px 0 10px">Your details</h3>
        <div class="field"><label>Name</label><input id="c-name" placeholder="Your name"></div>
        <div class="field"><label>Phone</label><input id="c-phone" placeholder="WhatsApp number"></div>
        <div class="field"><label>Delivery address <span class="muted">(optional)</span></label><textarea id="c-address" rows="2" placeholder="Area, city, pincode"></textarea></div>
        <div class="field"><label>Note <span class="muted">(optional)</span></label><textarea id="c-note" rows="2" placeholder="Any special request?"></textarea></div>

        <button class="btn btn-primary btn-block" id="checkout">📲 Place order on WhatsApp</button>
        <div class="note-wa">No online payment — you'll confirm the order and pay directly with the shop on WhatsApp.</div>
      </aside>
    </div>`;

  renderItems();
  $('#clear').onclick = () => { if (confirm('Remove all items?')) { clearCart(); render(); } };
  $('#checkout').onclick = checkout;
}

function renderItems() {
  const cart = getCart();
  $('#items').innerHTML = cart.map((it) => `
    <div class="cart-item" data-id="${it.productId}">
      <img src="${esc(it.image)}" alt="${esc(it.name)}">
      <div>
        <a class="ci-name" href="/product/${esc(it.slug)}">${esc(it.name)}</a>
        <div class="muted">${money(it.price)} each</div>
        <button class="ci-remove" data-remove="${it.productId}">Remove</button>
      </div>
      <div style="text-align:right">
        <div class="qty" style="margin-bottom:6px">
          <button data-dec="${it.productId}">−</button>
          <span>${it.qty}</span>
          <button data-inc="${it.productId}">+</button>
        </div>
        <strong class="price" style="font-size:1.05rem">${money(it.price * it.qty)}</strong>
      </div>
    </div>`).join('');

  updateSummary();

  $$('[data-inc]').forEach(b => b.onclick = () => { const id = +b.dataset.inc; const i = getCart().find(x => x.productId === id); setQty(id, i.qty + 1); renderItems(); });
  $$('[data-dec]').forEach(b => b.onclick = () => { const id = +b.dataset.dec; const i = getCart().find(x => x.productId === id); setQty(id, i.qty - 1); if (getCart().length === 0) render(); else renderItems(); });
  $$('[data-remove]').forEach(b => b.onclick = () => { removeFromCart(+b.dataset.remove); if (getCart().length === 0) render(); else renderItems(); });
}

function updateSummary() {
  if (!$('#sum-count')) return;
  $('#sum-count').textContent = cartCount();
  $('#sum-sub').textContent = money(cartTotal());
  $('#sum-total').textContent = money(cartTotal());
}

async function checkout() {
  const cart = getCart();
  if (!cart.length) return;
  const name = $('#c-name').value.trim();
  const phone = $('#c-phone').value.trim();
  if (!name) { toast('Please add your name'); $('#c-name').focus(); return; }
  if (!phone) { toast('Please add your phone number'); $('#c-phone').focus(); return; }

  const btn = $('#checkout');
  btn.disabled = true; btn.textContent = 'Preparing your order…';
  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name, phone, address: $('#c-address').value.trim() },
        note: $('#c-note').value.trim(),
        items: cart.map(i => ({ productId: i.productId, qty: i.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    clearCart();
    // Open WhatsApp with the prefilled order, then show confirmation
    window.open(data.whatsappUrl, '_blank');
    $('#cart-root').innerHTML = `
      <div class="empty">
        <div class="big">🎉</div>
        <h2>Order ${esc(data.order.reference)} ready!</h2>
        <p class="muted">We've opened WhatsApp with your order details. Just hit send to confirm with us.<br>If it didn't open, tap the button below.</p>
        <a class="btn btn-primary" href="${esc(data.whatsappUrl)}" target="_blank" rel="noopener">Open WhatsApp</a>
        <a class="btn btn-ghost" href="/" style="margin-left:8px">Continue shopping</a>
      </div>`;
  } catch (e) {
    toast('Something went wrong. Please try again.');
    btn.disabled = false; btn.textContent = '📲 Place order on WhatsApp';
  }
}

async function init() {
  await renderChrome();
  render();
  document.addEventListener('cart:change', updateSummary);
}
init();
