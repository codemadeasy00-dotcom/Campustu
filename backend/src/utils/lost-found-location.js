const PUBLIC_COORDINATE_DECIMALS = 3

function roundedCoordinate(value) {
  if (value === null || value === undefined || value === '') return null
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) return null
  return Number(coordinate.toFixed(PUBLIC_COORDINATE_DECIMALS))
}

function publicLostFoundLocation(item) {
  return {
    latitude: roundedCoordinate(item.latitude),
    longitude: roundedCoordinate(item.longitude),
    location_name: 'Approximate campus area',
    location_note: null,
    dropoff_location: null,
  }
}

function publicLostFoundDistance(distance) {
  if (distance === null || distance === undefined || distance === '') return null
  const meters = Number(distance)
  if (!Number.isFinite(meters) || meters < 0) return null
  return Math.round(meters / 100) * 100
}

module.exports = { publicLostFoundLocation, publicLostFoundDistance }
