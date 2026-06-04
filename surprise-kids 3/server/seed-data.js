/**
 * seed-data.js
 * Categories for SR Stationers. Products start empty — add through the admin panel.
 * Each category has a colour + emoji used for storefront tiles and auto-generated images.
 */

const CATEGORIES = [
  { name: 'Erasers',          emoji: '🧼', color: '#FF6B6B', accent: '#FFD6D6' },
  { name: 'Keychains',        emoji: '🔑', color: '#4D96FF', accent: '#D6E6FF' },
  { name: 'Sharpeners',       emoji: '✏️', color: '#FF9F1C', accent: '#FFE8C7' },
  { name: 'Return Gifts',     emoji: '🎁', color: '#9B5DE5', accent: '#EADCFB' },
  { name: 'Playing Cards',    emoji: '🃏', color: '#1B1B2F', accent: '#D9D9E3' },
  { name: 'Carry Bags',       emoji: '🛍️', color: '#06D6A0', accent: '#C9F7EC' },
  { name: 'Cosmetics',        emoji: '💄', color: '#EF476F', accent: '#FBD3DE' },
  { name: 'Bags',             emoji: '🎒', color: '#118AB2', accent: '#CDEAF3' },
  { name: 'Bottles & Sippers', emoji: '🥤', color: '#2EC4B6', accent: '#CBF1EC' },
  { name: 'Pouches',          emoji: '👝', color: '#F15BB5', accent: '#FBD6EE' },
  { name: 'Games/Toy',        emoji: '🧸', color: '#FB8500', accent: '#FFE3C2' },
  { name: 'DOMS',             emoji: '🖍️', color: '#E63946', accent: '#F8D2D6' },
  { name: 'Wipes',            emoji: '🧻', color: '#43AA8B', accent: '#CDEBE1' },
  { name: 'Home & Kitchen',   emoji: '🍴', color: '#577590', accent: '#D5DEE6' },
  { name: 'Hair Accessories', emoji: '🎀', color: '#FF70A6', accent: '#FFD9E8' },
  { name: 'Gift Wrap Sheet',  emoji: '🎊', color: '#8338EC', accent: '#E2D2FB' },
  { name: 'Pen & Pencils',    emoji: '🖊️', color: '#3A86FF', accent: '#D3E3FF' },
  { name: 'Lunch Box',        emoji: '🍱', color: '#FFBE0B', accent: '#FFEFC2' },
];

// Product name pieces per category to generate believable, varied products.
// Catalog starts empty — add products via the admin panel at /admin.
const PRODUCTS = {};

module.exports = { CATEGORIES, PRODUCTS };
