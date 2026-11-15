import L from 'leaflet'

function pinIcon(type) {
  return L.divIcon({
    className: `campus-map-marker campus-map-marker--${type}`,
    html: '<span></span>',
    iconSize: [24, 32],
    iconAnchor: [12, 30],
  })
}

export const campusMapIcons = {
  marketplace: pinIcon('marketplace'),
  lost: pinIcon('lost'),
  found: pinIcon('found'),
  selected: pinIcon('selected'),
}
