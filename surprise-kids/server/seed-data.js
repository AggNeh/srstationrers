/**
 * seed-data.js
 * Catalog definitions for Surprise Kids. Categories mirror the reference store.
 * Each category has a colour + emoji used to generate self-contained SVG images.
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
const PRODUCTS = {
  'Erasers': [
    ['Fruit Shape Eraser Set', 35, 50, true],
    ['Animal Erasers Pack of 6', 60, 80],
    ['Scented Dust-Free Eraser', 25, 35],
    ['Ice Cream Erasers Combo', 45, 60, true],
    ['Robot Mini Erasers', 40, 55],
    ['Glitter Heart Eraser', 30, 45],
  ],
  'Keychains': [
    ['Cartoon LED Keychain', 90, 120, true],
    ['Acrylic Name Keychain', 70, 99],
    ['Soft Plush Animal Keychain', 110, 149],
    ['Spinner Metal Keychain', 130, 180],
    ['Glow-in-Dark Star Keychain', 85, 110],
  ],
  'Sharpeners': [
    ['Double Hole Sharpener', 30, 45, true],
    ['Animal Shape Sharpener', 45, 60],
    ['Auto-Lock Canister Sharpener', 55, 75],
    ['Cute Bear Sharpener', 40, 55],
  ],
  'Return Gifts': [
    ['Birthday Return Gift Combo', 199, 299, true],
    ['Mini Stationery Gift Box', 149, 199],
    ['Party Favour Pack of 12', 360, 450],
    ['Themed Goodie Bag Set', 250, 320, true],
    ['Assorted Toy Surprise Pack', 299, 399],
  ],
  'Playing Cards': [
    ['Premium Poker Playing Cards', 99, 149],
    ['Kids UNO Style Card Game', 120, 160, true],
    ['Animal Memory Match Cards', 110, 140],
    ['Waterproof Playing Cards', 130, 175],
  ],
  'Carry Bags': [
    ['Printed Paper Carry Bag (10pc)', 80, 110],
    ['Birthday Theme Carry Bags', 90, 120, true],
    ['Non-Woven Reusable Bag', 60, 85],
    ['Cartoon Gift Carry Bag', 70, 95],
  ],
  'Cosmetics': [
    ['Kids Play Makeup Kit', 299, 399, true],
    ['Nail Art Sticker Set', 99, 140],
    ['Lip Balm Trio for Kids', 149, 199],
    ['Glitter Tattoo Pack', 120, 160],
  ],
  'Bags': [
    ['Cartoon School Backpack', 499, 699, true],
    ['Trolley School Bag', 1199, 1499],
    ['Mini Sling Bag for Kids', 299, 399],
    ['Dinosaur Print Backpack', 549, 749, true],
  ],
  'Bottles & Sippers': [
    ['Insulated Steel Sipper 500ml', 349, 449, true],
    ['Cartoon Spout Water Bottle', 199, 269],
    ['Flip-Top Sports Bottle', 179, 240],
    ['Unicorn Glitter Sipper', 299, 380],
  ],
  'Pouches': [
    ['Transparent Pencil Pouch', 99, 140, true],
    ['Zip Cosmetic Pouch', 149, 199],
    ['Cartoon Coin Pouch', 60, 85],
    ['Mesh Travel Pouch Set', 199, 260],
  ],
  'Games/Toy': [
    ['Building Blocks 100 pcs', 399, 549, true],
    ['Remote Control Mini Car', 599, 799],
    ['Magnetic Fishing Game', 249, 320],
    ['Spinning Top Combo', 149, 199],
    ['Soft Plush Teddy Bear', 349, 450, true],
  ],
  'DOMS': [
    ['DOMS Wax Crayons 24 Shades', 70, 90, true],
    ['DOMS Oil Pastels 25 Shades', 99, 130],
    ['DOMS Pencil Pack of 10', 60, 80],
    ['DOMS Sketch Pens 24 Shades', 120, 160],
  ],
  'Wipes': [
    ['Baby Soft Wet Wipes 80pc', 99, 140, true],
    ['Fragrance-Free Wipes Pack', 110, 150],
    ['Travel Pack Wipes (3x30)', 149, 199],
  ],
  'Home & Kitchen': [
    ['Kids Melamine Dinner Set', 399, 549, true],
    ['Cartoon Steel Tiffin Plate', 199, 260],
    ['Mini Storage Containers Set', 249, 320],
    ['Fun Shape Silicone Moulds', 180, 240],
  ],
  'Hair Accessories': [
    ['Hair Clip Set of 12', 99, 140, true],
    ['Scrunchie Combo Pack', 79, 110],
    ['Beaded Hair Bands', 60, 85],
    ['Bow Hairpins Assorted', 89, 120],
  ],
  'Gift Wrap Sheet': [
    ['Birthday Gift Wrap (5 Sheets)', 60, 90, true],
    ['Glossy Cartoon Wrap Roll', 99, 140],
    ['Metallic Wrap Sheet Pack', 110, 150],
  ],
  'Pen & Pencils': [
    ['Cartoon Gel Pen Set of 6', 99, 140, true],
    ['HB Pencil Pack of 12', 60, 80],
    ['Scented Fineliner Pens', 149, 199],
    ['Mechanical Pencil Combo', 120, 160],
    ['Fancy Pencil with Eraser Top', 45, 60],
  ],
  'Lunch Box': [
    ['Insulated 3-Compartment Lunch Box', 449, 599, true],
    ['Cartoon Steel Lunch Box', 299, 399],
    ['Bento Style Kids Lunch Box', 399, 520, true],
    ['Leak-Proof Tiffin with Spoon', 349, 449],
  ],
};

module.exports = { CATEGORIES, PRODUCTS };
