const test = require('node:test')
const assert = require('node:assert/strict')
const { publicLostFoundDistance, publicLostFoundLocation } = require('../src/utils/lost-found-location')

test('public Lost & Found locations are approximate and omit private notes', () => {
  assert.deepEqual(publicLostFoundLocation({
    latitude: '18.1678123',
    longitude: '73.3364987',
    location_name: 'Building C, room 204',
    location_note: 'Ask for the spare key under my desk',
    dropoff_location: 'Dormitory room 204',
  }), {
    latitude: 18.168,
    longitude: 73.336,
    location_name: 'Approximate campus area',
    location_note: null,
    dropoff_location: null,
  })
})

test('public Lost & Found locations preserve missing coordinates as null', () => {
  assert.deepEqual(publicLostFoundLocation({
    latitude: null,
    longitude: undefined,
  }), {
    latitude: null,
    longitude: null,
    location_name: 'Approximate campus area',
    location_note: null,
    dropoff_location: null,
  })
})

test('public Lost & Found distances are rounded to the nearest 100 metres', () => {
  assert.equal(publicLostFoundDistance(149), 100)
  assert.equal(publicLostFoundDistance(150), 200)
  assert.equal(publicLostFoundDistance(null), null)
  assert.equal(publicLostFoundDistance('not a distance'), null)
})
