/**
 * seed.js  —  run with `npm run seed`
 * Resets the database, generates self-contained SVG images per product
 * (none, since the catalog ships empty), and inserts the categories so
 * the admin/storefront has something to start with.
 */

const db = require('./db');
const { CATEGORIES, PRODUCTS } = require('./seed-data');
const { writeProductImage } = require('./imageGen');

async function run() {
  try {
    await db.connect();
    await db.reset();

    const catMap = {};
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const created = await db.categories.create({
        name: c.name,
        position: i + 1,
        emoji: c.emoji,
        color: c.color,
        accent: c.accent,
      });
      catMap[c.name] = created;
    }

    let count = 0;
    for (const [catName, items] of Object.entries(PRODUCTS)) {
      const cat = catMap[catName];
      if (!cat) continue;
      for (const [name, price, mrp, featured] of items) {
        const tmp = await db.products.create({
          name, price, mrp,
          featured: !!featured,
          categoryId: cat.id,
          description:
            `${name} from SR Stationers. Great quality, kid-friendly and perfect for gifting, school and parties. ` +
            `Part of our ${catName} collection. Colours and patterns may vary based on availability.`,
        });
        const url = await writeProductImage(tmp.slug, name, cat);
        await db.products.update(tmp.id, { image: url });
        count++;
      }
    }

    console.log(`Seeded ${CATEGORIES.length} categories and ${count} products.`);
    console.log(`Product images written to public/images/products/`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await db.disconnect();
  }
}

run();
