const router = require('express').Router()
const { z } = require('zod')
const { query } = require('../db')

const listQuery = z.object({ q: z.string().trim().max(100).optional() })

// GET /colleges?q=pune  -> approved colleges, for the sign-up dropdown. Public.
// (Colleges that students add themselves stay private to their members until you approve them.)
router.get('/', async (req, res) => {
  const { q } = listQuery.parse(req.query)
  const { rows } = await query(
    `SELECT id, name, city, state, email_domain
       FROM colleges
      WHERE status = 'approved'
        AND ($1::text IS NULL OR position(lower($1) in lower(name || ' ' || city)) > 0)
      ORDER BY name
      LIMIT 50`,
    [q || null]
  )
  res.json({ colleges: rows })
})

module.exports = router
