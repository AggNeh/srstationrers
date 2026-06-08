/* coming-soon.js — preview list of upcoming products (not orderable) */

function csCard(p, i) {
  const cover = imgOf(p);
  const hasVideo = Array.isArray(p.images) && p.images.some(isVideo);
  return `
    <article class="cs-card reveal" style="animation-delay:${Math.min(i, 12) * 0.04}s">
      <div class="cs-media">
        <span class="cs-badge">Coming soon</span>
        <img src="${esc(cover)}" alt="${esc(p.name)}" loading="lazy" ${IMG_FALLBACK}>
        ${hasVideo ? '<span class="cs-play">▶</span>' : ''}
      </div>
      <div class="cs-body">
        ${p.category ? `<span class="card-cat">${esc(p.category.name)}</span>` : ''}
        <h3 class="cs-title">${esc(p.name)}</h3>
        ${p.description ? `<p class="muted cs-desc">${esc(p.description)}</p>` : ''}
        <a class="btn btn-sun btn-block" id="cs-notify-${p.id}" target="_blank" rel="noopener">💬 Notify me on WhatsApp</a>
      </div>
    </article>`;
}

async function load() {
  const grid = $('#cs-grid');
  const empty = $('#cs-empty');
  grid.innerHTML = Array.from({ length: 4 }).map(() =>
    `<div class="skeleton"><div class="sk-media"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');

  try {
    const data = await fetch(`${API}/products?comingSoon=true&limit=100&sort=newest`).then(r => r.json());
    const items = data.items || [];
    if (!items.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    grid.innerHTML = items.map((p, i) => csCard(p, i)).join('');

    // Wire each "Notify me" button to a prefilled WhatsApp message.
    items.forEach(p => {
      const el = document.getElementById(`cs-notify-${p.id}`);
      if (el && STORE.whatsapp) {
        const text = encodeURIComponent(`Hi ${STORE.name}! Please let me know when "${p.name}" is available. 😊`);
        el.href = `https://wa.me/${STORE.whatsapp}?text=${text}`;
      }
    });
  } catch (e) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  }
}

async function init() {
  await renderChrome('');
  load();
}
init();
