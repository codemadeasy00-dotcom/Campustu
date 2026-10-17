// Loads YOUR REAL reference data (branches, categories, item types, campus spots)
// from db/reference-data.json. Usage:  npm run db:seed   or   node scripts/seed-reference.js other.json
// Safe to re-run: existing rows are left alone.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const file = process.argv[2] || path.join(__dirname, '..', '..', 'db', 'reference-data.json');

(async () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const client = new Client(require('../src/dbConfig')());
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const b of data.branches || []) {
      await client.query('INSERT INTO branches (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [b.code, b.name]);
    }
    for (const c of data.categories || []) {
      await client.query(
        'INSERT INTO categories (slug, name, scope) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
        [c.slug, c.name, c.scope || 'both']
      );
    }
    for (const t of data.item_types || []) {
      const cat = await client.query('SELECT id FROM categories WHERE slug = $1', [t.category_slug]);
      if (!cat.rows[0]) throw new Error(`item_type "${t.name}": unknown category_slug "${t.category_slug}"`);
      await client.query(
        'INSERT INTO item_types (category_id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [cat.rows[0].id, t.name, t.description || null]
      );
    }
    for (const s of data.campus_spots || []) {
      await client.query(
        `INSERT INTO campus_spots (name, description, lat, lng, safe_for_handover)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
        [s.name, s.description || null, s.lat, s.lng, s.safe_for_handover !== false]
      );
    }
    await client.query('COMMIT');
    console.log('Reference data loaded from', file);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
