/**
 * seed.js  —  run with `npm run seed`
 * Resets the data store, generates self-contained SVG product images and
 * inserts the catalog. No external image hosts required.
 */

const db = require('./db');
const { CATEGORIES, PRODUCTS } = require('./seed-data');
const { writeProductImage } = require('./imageGen');

function run() {
  db.reset();

  // Persist categories WITH emoji/color/accent so the admin and storefront
  // can use them directly. Anything added later through the admin gets the
  // same treatment.
  const catMap = {};
  CATEGORIES.forEach((c, i) => {
    const created = db.categories.create({
      name: c.name,
      position: i + 1,
      emoji: c.emoji,
      color: c.color,
      accent: c.accent,
    });
    catMap[c.name] = created;
  });

  let count = 0;
  for (const [catName, items] of Object.entries(PRODUCTS)) {
    const cat = catMap[catName];
    if (!cat) continue;
    for (const [name, price, mrp, featured] of items) {
      const tmp = db.products.create({
        name,
        price,
        mrp,
        featured: !!featured,
        categoryId: cat.id,
        description:
          `${name} from Surprise Kids. Great quality, kid-friendly and perfect for gifting, school and parties. ` +
          `Part of our ${catName} collection. Colours and patterns may vary based on availability.`,
      });
      const url = writeProductImage(tmp.slug, name, cat);
      db.products.update(tmp.id, { image: url });
      count++;
    }
  }

  console.log(`Seeded ${CATEGORIES.length} categories and ${count} products.`);
  console.log(`Product images written to public/images/products/`);
}

run();
