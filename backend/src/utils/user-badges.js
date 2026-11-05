function isCollegeVerified({ email, email_verified_at: emailVerifiedAt, email_domain: emailDomain, college_status: collegeStatus }) {
  const emailHost = String(email || '').split('@').at(-1)?.toLowerCase() || ''
  const domain = String(emailDomain || '').toLowerCase()
  return Boolean(
    emailVerifiedAt
    && collegeStatus === 'approved'
    && domain
    && (emailHost === domain || emailHost.endsWith(`.${domain}`)),
  )
}

const USER_BADGES = [
  { id: 'college_verified', label: 'College Verified' },
  { id: 'admin', label: 'ADMIN' },
  { id: 'power_trader', label: 'POWER TRADER' },
  { id: 'trusted_member', label: 'Trusted Member' },
  { id: 'lost_found_hero', label: 'Lost & Found Hero' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'banned', label: 'Banned' },
]

const ITEM_BADGES = {
  marketplace_item: [
    { id: 'under_review', label: 'Under Moderation Review' },
    { id: 'claimed_resolved', label: 'Claimed / Resolved' },
  ],
  lost_found_item: [
    { id: 'under_review', label: 'Under Moderation Review' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'verified_match', label: 'Verified Match' },
    { id: 'claimed_resolved', label: 'Claimed / Resolved' },
  ],
}

function applyBadgeOverrides(badges, overrides = [], definitions = USER_BADGES) {
  const allowedIds = new Set(definitions.map(({ id }) => id))
  const enabled = new Map(
    overrides
      .filter(({ badge_id: id }) => allowedIds.has(id))
      .map(({ badge_id: id, enabled: isEnabled }) => [id, isEnabled]),
  )
  const current = new Map(badges.map((badge) => [badge.id, badge]))
  for (const badge of definitions) {
    if (!enabled.has(badge.id)) continue
    if (enabled.get(badge.id)) current.set(badge.id, badge)
    else current.delete(badge.id)
  }
  return definitions.filter(({ id }) => current.has(id))
}

function buildUserBadges(user, overrides = []) {
  const badges = []
  if (isCollegeVerified(user)) badges.push({ id: 'college_verified', label: 'College Verified' })
  if (user.role === 'admin') badges.push({ id: 'admin', label: 'ADMIN' })
  if (Number(user.completed_handovers) >= 2 && Number(user.pending_reports_received) === 0) {
    badges.push({ id: 'power_trader', label: 'POWER TRADER' })
  }
  if (user.is_trusted) badges.push({ id: 'trusted_member', label: 'Trusted Member' })
  if (Number(user.completed_returns) > 0) badges.push({ id: 'lost_found_hero', label: 'Lost & Found Hero' })
  if (user.status === 'frozen') badges.push({ id: 'suspended', label: 'Suspended' })
  if (user.status === 'banned') badges.push({ id: 'banned', label: 'Banned' })
  return applyBadgeOverrides(badges, overrides)
}

module.exports = { USER_BADGES, ITEM_BADGES, applyBadgeOverrides, buildUserBadges, isCollegeVerified }
