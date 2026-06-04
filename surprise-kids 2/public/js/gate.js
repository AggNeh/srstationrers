/* gate.js — entry challenge for the storefront */

(async function () {
  const status = document.getElementById('gate-status');
  const form = document.getElementById('gate-form');
  const input = document.getElementById('gate-code');
  const submit = document.getElementById('gate-submit');
  const title = document.getElementById('gate-title');
  const sub = document.getElementById('gate-sub');
  const contact = document.getElementById('gate-contact');

  // Pull store name + WhatsApp link to personalise the gate page.
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    if (cfg && cfg.name) {
      sub.textContent = `Enter the access code shared by ${cfg.name} to view the catalog.`;
      document.title = `Access · ${cfg.name}`;
    }
    if (cfg && cfg.whatsapp) {
      const txt = encodeURIComponent(`Hi! Can I have the access code for the ${cfg.name || ''} catalog?`);
      contact.innerHTML = `<a class="btn btn-sun btn-block" href="https://wa.me/${cfg.whatsapp}?text=${txt}" target="_blank" rel="noopener">💬 Request code on WhatsApp</a>`;
    }
  } catch (e) { /* gate still works without config */ }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    const code = input.value.trim();
    if (!code) return;
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      const r = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (r.ok) {
        status.className = 'gate-status ok';
        status.textContent = '✓ Welcome — taking you in…';
        // Redirect back to wherever they were trying to go, default to /.
        const want = new URLSearchParams(location.search).get('next') || '/';
        location.href = want.startsWith('/') ? want : '/';
        return;
      }
      const data = await r.json().catch(() => ({}));
      status.className = 'gate-status err';
      status.textContent = data.error || 'Wrong access code, try again.';
      input.select();
    } catch (err) {
      status.className = 'gate-status err';
      status.textContent = 'Network error — try again.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Unlock';
    }
  });

  input.focus();
})();
