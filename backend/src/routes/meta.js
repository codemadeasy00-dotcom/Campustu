const router = require('express').Router();
const { query } = require('../db');

// Reference data the forms need (dropdowns, map spots). Public, read-only.
router.get('/', async (_req, res) => {
  const [branches, categories, itemTypes, spots] = await Promise.all([
    query('SELECT id, code, name FROM branches ORDER BY name'),
    query('SELECT id, slug, name, scope FROM categories ORDER BY name'),
    query('SELECT id, category_id, name, description FROM item_types ORDER BY name'),
    query('SELECT id, name, description, lat, lng, safe_for_handover FROM campus_spots ORDER BY name'),
  ]);
  res.json({
    branches: branches.rows,
    categories: categories.rows,
    item_types: itemTypes.rows,
    campus_spots: spots.rows.map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) })),
  });
});

module.exports = router;
