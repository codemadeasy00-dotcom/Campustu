const { notBlockedSql } = require('./user-blocks')

function itemSearchAlertQuery() {
  return `INSERT INTO in_app_notifications (user_id, search_id, item_id, title, message, match_reasons)
         SELECT ss.user_id, ss.id, $2, 'A saved search has a new match',
                format('A new item, "%s", matches your saved search "%s".', $3::text, ss.keyword),
                to_jsonb(array_remove(ARRAY[
                  format('Keyword: %s', ss.keyword),
                  CASE WHEN ss.category_id IS NOT NULL THEN format('Category: %s', search_category.name) END,
                  CASE WHEN ss.branch_id IS NOT NULL THEN format('Branch: %s', search_branch.name) END,
                  'Same campus'
                ]::text[], NULL))
           FROM saved_searches ss
           JOIN users recipient ON recipient.id = ss.user_id
           LEFT JOIN search_alert_preferences alert_preferences ON alert_preferences.user_id = ss.user_id
           LEFT JOIN categories search_category ON search_category.id = ss.category_id
           LEFT JOIN branches search_branch ON search_branch.id = ss.branch_id
          WHERE ss.college_id = $1
            AND ss.user_id <> $4
            AND ${notBlockedSql('ss.user_id', '$4')}
            AND recipient.status = 'active'
            AND recipient.deleted_at IS NULL
            AND recipient.college_id = ss.college_id
            AND (NOT ss.auto_tracked OR COALESCE(alert_preferences.auto_track_searches, true))
            AND (ss.category_id IS NULL OR ss.category_id = $6)
            AND (ss.branch_id IS NULL OR $7::smallint IS NULL OR ss.branch_id = $7::smallint)
            AND to_tsvector('simple', concat_ws(' ', $3::text, $5::text))
                @@ plainto_tsquery('simple', ss.keyword)
         ON CONFLICT (search_id, item_id)
           WHERE search_id IS NOT NULL AND item_id IS NOT NULL
         DO NOTHING
         RETURNING user_id, title, message`
}

module.exports = { itemSearchAlertQuery }
