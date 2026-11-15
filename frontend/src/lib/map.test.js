import test from 'node:test'
import assert from 'node:assert/strict'
import { getMapCenter, validMapCoordinates } from './map.js'

test('uses a verified college center before post coordinates', () => {
  assert.deepEqual(
    getMapCenter(
      { center_lat: '43.123456', center_lng: '-72.123456' },
      [{ latitude: 10, longitude: 20 }],
    ),
    [43.123456, -72.123456],
  )
})

test('uses a real post coordinate when no valid college center exists', () => {
  assert.deepEqual(
    getMapCenter(
      { center_lat: null, center_lng: null },
      [{ latitude: null, longitude: null }, { latitude: '18.5', longitude: '73.8' }],
    ),
    [18.5, 73.8],
  )
})

test('does not invent a center when the college and posts have no valid coordinates', () => {
  assert.equal(getMapCenter(null, [{ latitude: 91, longitude: 181 }]), null)
  assert.equal(validMapCoordinates('', ''), null)
})
