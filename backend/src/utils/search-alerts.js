const { query } = require('../db')
const { notifyUser } = require('./web-push')

function isWithinQuietHours(preferences, now = new Date()) {
  if (!preferences?.quiet_start || !preferences?.quiet_end) return false

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: preferences.timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  const currentMinutes = hour * 60 + minute
  const startMinutes = timeToMinutes(preferences.quiet_start)
  const endMinutes = timeToMinutes(preferences.quiet_end)

  return startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number)
  return hours * 60 + minutes
}

async function notifySearchAlertUser(userId, notification) {
  const { rows: [preferences] } = await query(
    'SELECT quiet_start, quiet_end, timezone FROM search_alert_preferences WHERE user_id = $1',
    [userId],
  )
  if (isWithinQuietHours(preferences)) return { suppressed: true }
  await notifyUser(userId, notification)
  return { suppressed: false }
}

module.exports = { isWithinQuietHours, notifySearchAlertUser }
