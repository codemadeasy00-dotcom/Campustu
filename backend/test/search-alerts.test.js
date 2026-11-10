const test = require('node:test')
const assert = require('node:assert/strict')
const { isWithinQuietHours } = require('../src/utils/search-alerts')

test('quiet hours are disabled when either endpoint is missing', () => {
  assert.equal(isWithinQuietHours({ quiet_start: null, quiet_end: null }, new Date()), false)
  assert.equal(isWithinQuietHours({ quiet_start: '22:00', quiet_end: null }, new Date()), false)
})

test('quiet hours support overnight ranges in the configured time zone', () => {
  const preferences = { quiet_start: '22:00', quiet_end: '07:00', timezone: 'America/Los_Angeles' }

  assert.equal(isWithinQuietHours(preferences, new Date('2025-01-15T07:30:00Z')), true)
  assert.equal(isWithinQuietHours(preferences, new Date('2025-01-15T15:00:00Z')), false)
})

test('quiet-hour start is inclusive and end is exclusive', () => {
  const preferences = { quiet_start: '13:00', quiet_end: '14:00', timezone: 'UTC' }

  assert.equal(isWithinQuietHours(preferences, new Date('2025-05-01T13:00:00Z')), true)
  assert.equal(isWithinQuietHours(preferences, new Date('2025-05-01T13:59:00Z')), true)
  assert.equal(isWithinQuietHours(preferences, new Date('2025-05-01T14:00:00Z')), false)
})

test('quiet hours honor a midnight boundary', () => {
  const preferences = { quiet_start: '00:00', quiet_end: '00:01', timezone: 'UTC' }

  assert.equal(isWithinQuietHours(preferences, new Date('2025-05-01T00:00:00Z')), true)
  assert.equal(isWithinQuietHours(preferences, new Date('2025-05-01T00:01:00Z')), false)
})
