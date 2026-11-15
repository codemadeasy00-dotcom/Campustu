export function validMapCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

export function getCollegeMapCenter(college) {
  return validMapCoordinates(college?.center_lat, college?.center_lng)
}

export function getMapCenter(college, items = []) {
  return getCollegeMapCenter(college)
    ?? items.map((item) => validMapCoordinates(item.latitude, item.longitude)).find(Boolean)
    ?? null
}
