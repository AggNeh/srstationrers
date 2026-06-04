/* shop.js — catalog browse: filter by category, search, sort, paginate */

// Read category slug from either /category/:slug path or ?category=
function categoryFromPath() {
  const m = location.pathname.match(/^\/category\/([^/]+)/);
  return m ? m[1] : '';
}

const state = {
  category: categoryFromPath() || qs('category') || '',
  search: qs('search') || '',
  sort: qs('sort') || 'newest',
  page: 1,
  limit: 12,
  total: 0,
};

const grid = $('#grid');

function skeletons(n = 8) {
  grid.innerHTML = Array.from({ length: n }).map(() =>
    `<div class="skeleton"><div class="sk-media"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');
}

async function fetchPage(reset = false) {
  if (reset) { state.page = 1; grid.innerHTML = ''; skeletons(8); }
  const params = new URLSearchParams({
    sort: state.sort, page: state.page, limit: state.limit,
  });
  if (state.category) params.set('category', state.category);
  if (state.search) params.set('search', state.search);

  const res = await fetch(`${API}/products?${params}`).then(r => r.json());
  state.total = res.total;

  if (reset) grid.innerHTML = '';
  const startIndex = (state.page - 1) * state.limit;
  if (res.items.length === 0 && state.page === 1) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="big">🔍</div>
        <h2>Nothing here yet</h2>
        <p class="muted">${state.search ? 'No products match that search.' : state.category ? 'No products in this category yet.' : 'No products yet. Check back soon!'}</p>
        <a class="btn btn-primary" href="/shop">Show all products</a>
      </div>`;
  } else {
    grid.insertAdjacentHTML('beforeend', res.items.map((p, i) => productCard(p, startIndex + i)).join(''));
  }

  const more = $('#load-more');
  if (startIndex + res.items.length < res.total) more.classList.remove('hidden');
  else more.classList.add('hidden');
}

async function applyView() {
  if (state.search) {
    $('#list-kicker').textContent = 'Search results';
    $('#list-title').textContent = `“${state.search}”`;
  } else if (state.category) {
    const cat = await fetch(`${API}/categories/${state.category}`).then(r => r.ok ? r.json() : null).catch(() => null);
    $('#list-kicker').textContent = 'Category';
    $('#list-title').textContent = cat ? cat.name : 'Products';
    document.title = (cat ? cat.name : 'Shop') + ' · SR Stationers';
  } else {
    $('#list-kicker').textContent = 'Catalog';
    $('#list-title').textContent = 'All products';
  }
  await fetchPage(true);
}

async function init() {
  await renderChrome(state.category);

  $('#sort').value = state.sort;
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; fetchPage(true); });
  $('#load-more').addEventListener('click', () => { state.page++; fetchPage(false); });

  await applyView();
}

init();
