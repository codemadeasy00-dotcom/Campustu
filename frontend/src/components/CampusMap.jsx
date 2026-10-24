import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [18.1678, 73.3364]

const markerIcons = {
  marketplace: L.divIcon({
    className: 'campus-map-marker campus-map-marker--marketplace',
    html: '<span></span>',
    iconSize: [24, 32],
    iconAnchor: [12, 30],
  }),
  lost: L.divIcon({
    className: 'campus-map-marker campus-map-marker--lost',
    html: '<span></span>',
    iconSize: [24, 32],
    iconAnchor: [12, 30],
  }),
  found: L.divIcon({
    className: 'campus-map-marker campus-map-marker--found',
    html: '<span></span>',
    iconSize: [24, 32],
    iconAnchor: [12, 30],
  }),
}

function coordinatesFor(item) {
  if (item.latitude == null || item.longitude == null) return null
  const latitude = Number(item.latitude)
  const longitude = Number(item.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [latitude, longitude]
}

function FitPins({ items }) {
  const map = useMap()
  const positions = items.map(coordinatesFor).filter(Boolean)

  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 16)
    } else if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 16 })
    }
  }, [map, items])

  return null
}

export default function CampusMap({ items = [], center = DEFAULT_CENTER, className = '' }) {
  const [filter, setFilter] = useState('all')
  const mapItems = useMemo(() => items.filter((item) => coordinatesFor(item)), [items])
  const visibleItems = useMemo(
    () => mapItems.filter((item) => filter === 'all' || item.type === filter),
    [filter, mapItems],
  )
  const marketplaceCount = mapItems.filter((item) => item.type === 'marketplace').length
  const lostFoundCount = mapItems.filter((item) => item.type === 'lost-found').length
  const startCenter = useMemo(
    () => (mapItems.length > 0 ? coordinatesFor(mapItems[0]) : center),
    [center, mapItems],
  )

  return (
    <section className={`overflow-hidden rounded-3xl border border-brand-100 bg-white/95 shadow-md ${className}`}>
      <div className="flex flex-col gap-4 border-b border-brand-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-brand-700">Campus map</h2>
          <p className="mt-1 text-xs text-slate-500">Explore listings with a saved campus location.</p>
        </div>
        <div className="flex gap-2" aria-label="Filter map pins">
          {[
            { id: 'all', label: 'All', count: mapItems.length },
            { id: 'marketplace', label: 'Marketplace', count: marketplaceCount },
            { id: 'lost-found', label: 'Lost & found', count: lostFoundCount },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                filter === option.id
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'border border-brand-100 bg-cream text-brand-700 hover:bg-brand-50'
              }`}
            >
              {option.label}<span className="ml-1 opacity-75">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="campus-map-container relative h-[340px] w-full sm:h-[400px]">
        <MapContainer
          center={startCenter}
          zoom={14}
          scrollWheelZoom={false}
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />
          <FitPins items={visibleItems} />
          {visibleItems.map((item) => {
            const position = coordinatesFor(item)
            const icon = item.type === 'marketplace'
              ? markerIcons.marketplace
              : item.status === 'found' ? markerIcons.found : markerIcons.lost

            return (
              <Marker key={`${item.type}-${item.id}`} position={position} icon={icon}>
                <Popup>
                  <div className="max-w-56">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      item.type === 'marketplace'
                        ? 'bg-brand-50 text-brand-700'
                        : item.status === 'found'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                    }`}>
                      {item.type === 'marketplace' ? 'Marketplace' : item.status}
                    </span>
                    <h3 className="mb-1 mt-2 font-bold text-slate-900">{item.title}</h3>
                    {item.description && <p className="text-xs text-slate-600">{item.description}</p>}
                    {item.price != null && <p className="mt-2 text-sm font-bold text-brand-700">₹{item.price}</p>}
                    {item.locationName && <p className="mt-2 text-xs text-slate-500">{item.locationName}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
        {visibleItems.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-1/2 z-[400] -translate-y-1/2 text-center">
            <p className="mx-auto max-w-sm rounded-2xl border border-brand-100 bg-cream/95 px-4 py-3 text-sm text-slate-600 shadow">
              {mapItems.length === 0
                ? 'No posts with map locations yet. Lost & found posts appear here when a location pin is added.'
                : 'No located posts in this category yet.'}
            </p>
          </div>
        )}
      </div>
      <p className="border-t border-brand-100 px-5 py-3 text-[11px] text-slate-500">
        Marketplace posts only appear on the map when they include coordinates. OpenStreetMap contributors.
      </p>
    </section>
  )
}
