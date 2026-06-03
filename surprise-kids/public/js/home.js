/* home.js — catalog home: categories, filtering, search, sort, load-more */

const state = {
  category: qs('category') || '',
  search: qs('search') || '',
  sort: 'newest',
  page: 1,
  limit: 12,
  total: 0,
  loadedFeatured: false,
};

const grid = $('#grid');

function skeletons(n = 8) {
  grid.innerHTML = Array.from({ length: n }).map(() =>
    `<div class="skeleton"><div class="sk-media"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');
}

async function loadCategoryTiles() {
  const tiles = $('#cat-tiles');
  try {
    const cats = await fetch(`${API}/categories`).then(r => r.json());
    tiles.innerHTML = cats.map((c, i) => {
      const emoji = c.emoji || '🧷';
      const accent = c.accent || '#FFF1D6';
      const color = c.color || '#FF5A6A';
      return `
      <a class="cat-tile reveal" style="animation-delay:${i * 0.03}s; background:linear-gradient(135deg, ${accent} 0%, #fff 100%); border:2px solid ${color}33" href="/?category=${c.slug}">
        <div class="emoji">${esc(emoji)}</div>
        <div class="name" style="color:${color}">${esc(c.name)}</div>
        <div class="count">${c.count} item${c.count === 1 ? '' : 's'}</div>
      </a>`;
    }).join('');
  } catch (e) { tiles.innerHTML = ''; }
}

async function fetchPage(reset = false) {
  if (reset) { state.page = 1; grid.innerHTML = ''; skeletons(8); }
  const params = new URLSearchParams({
    sort: state.sort, page: state.page, limit: state.limit,
  });
  if (state.category) params.set('category', state.category);
  if (state.search) params.set('search', state.search);

  // Default home view (no filter/search): show featured "Latest Arrivals"
  const res = await fetch(`${API}/products?${params}`).then(r => r.json());
  state.total = res.total;

  if (reset) grid.innerHTML = '';
  const startIndex = (state.page - 1) * state.limit;
  if (res.items.length === 0 && state.page === 1) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="big">🔍</div>
        <h2>Nothing here yet</h2>
        <p class="muted">We couldn't find products matching that. Try another category or search.</p>
        <a class="btn btn-primary" href="/">Back to all products</a>
      </div>`;
  } else {
    grid.insertAdjacentHTML('beforeend', res.items.map((p, i) => productCard(p, startIndex + i)).join(''));
  }

  const more = $('#load-more');
  if (startIndex + res.items.length < res.total) more.classList.remove('hidden');
  else more.classList.add('hidden');
}

async function applyView() {
  const hero = $('#hero');
  const catSection = $('#cat-section');
  const isHome = !state.category && !state.search;

  hero.classList.toggle('hidden', !isHome);
  catSection.classList.toggle('hidden', !isHome);

  // title
  if (state.search) {
    $('#list-kicker').textContent = 'Search results';
    $('#list-title').textContent = `“${state.search}”`;
  } else if (state.category) {
    const cat = await fetch(`${API}/categories/${state.category}`).then(r => r.ok ? r.json() : null).catch(() => null);
    $('#list-kicker').textContent = 'Category';
    $('#list-title').textContent = cat ? cat.name : 'Products';
  } else {
    $('#list-kicker').textContent = 'Fresh picks';
    $('#list-title').textContent = 'Latest Arrivals';
  }

  await fetchPage(true);
}

async function init() {
  await renderChrome(state.category);
  if (!state.category && !state.search) loadCategoryTiles();

  $('#sort').value = state.sort;
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; fetchPage(true); });
  $('#load-more').addEventListener('click', () => { state.page++; fetchPage(false); });

  await applyView();
}

init();
