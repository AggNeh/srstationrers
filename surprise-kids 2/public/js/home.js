/* home.js — landing page: trending products, category tiles, WhatsApp CTA */

async function loadTrending() {
  const grid = $('#trending-grid');
  const empty = $('#trending-empty');
  // Skeletons while loading
  grid.innerHTML = Array.from({ length: 4 }).map(() =>
    `<div class="skeleton"><div class="sk-media"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');

  try {
    // Featured first; if there are fewer than 4, top up with newest.
    const featured = await fetch(`${API}/products?featured=true&limit=8&sort=newest`).then(r => r.json());
    let items = featured.items || [];
    if (items.length === 0) {
      // No featured items yet — fall back to newest.
      const newest = await fetch(`${API}/products?limit=8&sort=newest`).then(r => r.json());
      items = newest.items || [];
      if (items.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      $('#trending-title').textContent = 'Latest arrivals';
    }
    grid.innerHTML = items.map((p, i) => productCard(p, i)).join('');
  } catch (e) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  }
}

async function loadCategoryTiles() {
  const tiles = $('#cat-tiles');
  try {
    const cats = await fetch(`${API}/categories`).then(r => r.json());
    if (!cats.length) { tiles.innerHTML = '<p class="muted">No categories yet — add some from the admin panel.</p>'; return; }
    tiles.innerHTML = cats.map((c, i) => {
      const emoji = c.emoji || '🧷';
      const accent = c.accent || '#FFF1D6';
      const color = c.color || '#FF5A6A';
      const visual = c.image
        ? `<div class="emoji" style="padding:0"><img src="${esc(c.image)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:14px"></div>`
        : `<div class="emoji">${esc(emoji)}</div>`;
      return `
      <a class="cat-tile reveal" style="animation-delay:${i * 0.03}s; background:linear-gradient(135deg, ${accent} 0%, #fff 100%); border:2px solid ${color}33" href="/category/${c.slug}">
        ${visual}
        <div class="name" style="color:${color}">${esc(c.name)}</div>
        <div class="count">${c.count} item${c.count === 1 ? '' : 's'}</div>
      </a>`;
    }).join('');
  } catch (e) { tiles.innerHTML = ''; }
}

function wireWhatsappCta() {
  if (!STORE || !STORE.whatsapp) return;
  const text = encodeURIComponent(`Hi ${STORE.name}! I'd like some help with my order.`);
  $('#cta-whatsapp').href = `https://wa.me/${STORE.whatsapp}?text=${text}`;
}

async function init() {
  await renderChrome('');
  wireWhatsappCta();
  loadTrending();
  loadCategoryTiles();
}

init();
