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

function buildUserBadges(user) {
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
  return badges
}

module.exports = { buildUserBadges, isCollegeVerified }
