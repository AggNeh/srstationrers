/**
 * imageGen.js — shared product-image SVG generator
 * Used by `seed.js` AND by the products API to auto-generate a placeholder
 * image when a new product is created without uploading one.
 */

const fs = require('fs');
const path = require('path');

const IMG_DIR = path.join(__dirname, '..', 'public', 'images', 'products');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap a product name onto up to 3 lines for the image.
function wrap(text, max = 16) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.slice(0, 3);
}

/**
 * Generate an SVG for a product, themed by its category.
 * @param {string} name - product name
 * @param {{ name, emoji, color, accent }} cat - category-like object
 */
function productSvg(name, cat) {
  const safe = {
    name: cat && cat.name ? cat.name : 'Item',
    emoji: cat && cat.emoji ? cat.emoji : '🎁',
    color: cat && cat.color ? cat.color : '#FF5A6A',
    accent: cat && cat.accent ? cat.accent : '#FFD6D6',
  };
  const lines = wrap(name);
  const startY = 250 - (lines.length - 1) * 18;
  const textEls = lines
    .map((l, i) => `<text x="200" y="${startY + i * 36}" text-anchor="middle" font-family="'Nunito', sans-serif" font-size="26" font-weight="800" fill="#1b1b2f">${esc(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${safe.accent}"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="blob" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="${safe.color}"/>
      <stop offset="1" stop-color="${safe.color}" stop-opacity="0.75"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="160" r="96" fill="url(#blob)"/>
  <circle cx="200" cy="160" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4"/>
  <text x="200" y="190" text-anchor="middle" font-size="92">${safe.emoji}</text>
  ${textEls}
  <text x="200" y="350" text-anchor="middle" font-family="'Nunito', sans-serif" font-size="15" font-weight="700" fill="${safe.color}" letter-spacing="1.5">${esc(safe.name.toUpperCase())}</text>
</svg>`;
}

/**
 * Write the SVG file to /public/images/products/<slug>.svg and return the public URL.
 */
function writeProductImage(slug, name, cat) {
  ensureDir(IMG_DIR);
  const file = `${slug}.svg`;
  fs.writeFileSync(path.join(IMG_DIR, file), productSvg(name, cat));
  return `/images/products/${file}`;
}

module.exports = { productSvg, writeProductImage, IMG_DIR };
