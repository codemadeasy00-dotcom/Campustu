const router = require('express').Router()
const { z } = require('zod')
const { query } = require('../db')
const { requireAuth, requireCollege } = require('../middleware/auth')
const { notBlockedSql } = require('../utils/user-blocks')

router.use(requireAuth, requireCollege)

const searchSchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

router.get('/', async (req, res) => {
  const { q, limit } = searchSchema.parse(req.query)
  const { rows } = await query(
    `WITH input AS (
       SELECT plainto_tsquery('simple', $1) AS terms,
              $2::integer AS college_id,
              $3::uuid AS viewer_id,
              $4::text AS viewer_role
     ), matches AS (
       SELECT 'listing'::text AS result_type, i.id, i.title, i.description,
              c.name AS category_name, b.name AS branch_name,
              u.display_name AS owner_name, i.created_at,
              i.price::text AS price,
              '/items/' || i.id::text AS href
         FROM items i
         JOIN input ON true
         JOIN users u ON u.id = i.seller_id
         LEFT JOIN categories c ON c.id = i.category_id
         LEFT JOIN branches b ON b.id = i.branch_id
        WHERE i.college_id = input.college_id
          AND i.status = 'available'
          AND (input.viewer_role IN ('admin', 'super_admin') OR ${notBlockedSql('input.viewer_id', 'i.seller_id')})
          AND to_tsvector('simple', concat_ws(' ', i.title, i.description)) @@ input.terms
          AND (
            i.seller_id = input.viewer_id OR input.viewer_role IN ('admin', 'super_admin')
            OR (
              NOT EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
              )
              AND NOT EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.marketplace_item_id = i.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              )
            )
          )
       UNION ALL
       SELECT 'lost_found'::text, lif.id, lif.title, lif.description,
              lif.category, user_branch.name, u.display_name, lif.created_at,
              NULL::text, '/lost-found'
         FROM lost_found_items lif
         JOIN input ON true
         JOIN users u ON u.id = lif.user_id
         LEFT JOIN branches user_branch ON user_branch.id = u.branch_id
        WHERE lif.college_id = input.college_id
          AND lif.lifecycle_status = 'active'
          AND (input.viewer_role IN ('admin', 'super_admin') OR ${notBlockedSql('input.viewer_id', 'lif.user_id')})
          AND to_tsvector('simple', concat_ws(' ', lif.title, lif.description)) @@ input.terms
          AND (
            lif.user_id = input.viewer_id OR input.viewer_role IN ('admin', 'super_admin')
            OR (
              NOT lif.flagged_for_review
              AND NOT EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.lost_found_item_id = lif.id AND ir.status = 'pending'
              )
              AND NOT EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.lost_found_item_id = lif.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              )
            )
          )
       UNION ALL
       SELECT 'need'::text, request.id, request.title, request.description,
              category.name, branch.name, owner.display_name, request.created_at,
              NULL::text, '/needs/' || request.id::text
         FROM need_board_requests request
         JOIN input ON true
         JOIN users owner ON owner.id = request.user_id
         LEFT JOIN categories category ON category.id = request.category_id
         LEFT JOIN branches branch ON branch.id = request.branch_id
        WHERE request.college_id = input.college_id
          AND request.status = 'open'
          AND request.expires_at > now()
          AND (input.viewer_role IN ('admin', 'super_admin') OR ${notBlockedSql('input.viewer_id', 'request.user_id')})
          AND to_tsvector('simple', concat_ws(' ', request.title, request.description)) @@ input.terms
     )
     SELECT result_type, id, title, left(description, 240) AS description,
            category_name, branch_name, owner_name, created_at, price, href
       FROM matches
      ORDER BY created_at DESC, title
      LIMIT $5`,
    [q, req.user.college_id, req.user.id, req.user.role, limit],
  )
  res.json({ query: q, results: rows })
})

module.exports = router
