const router = require('express').Router()
const { query } = require('../db')
const config = require('../config')

// Reference data the forms need (dropdowns). Public, read-only.
// Branches and categories are the same for every college.
router.get('/', async (_req, res) => {
  const [branches, categories, itemTypes] = await Promise.all([
    query('SELECT id, code, name FROM branches ORDER BY name'),
    query('SELECT id, slug, name, scope FROM categories ORDER BY name'),
    query('SELECT id, category_id, name, description FROM item_types ORDER BY name'),
  ])
  res.json({
    branches: branches.rows,
    categories: categories.rows,
    item_types: itemTypes.rows,
    seller_limits: {
      new_user_max_price: config.newUserMaxPrice,
      new_user_max_active_listings: config.newUserMaxActiveListings,
    },
  })
})

module.exports = router
