import { useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import MapPlaceSearch from './MapPlaceSearch.jsx'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'

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
  if (item.latitude == null || item.longitude == null || item.latitude === '' || item.longitude === '') return null
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

function SearchControl({ onSelectLocation }) {
  return (
    <MapPlaceSearch
      id="campus-map-search"
      onSelect={(place) => onSelectLocation?.({ lat: place.lat, lng: place.lng })}
    />
  )
}

function LayerControl({ selectedLayer, onSelectLayer }) {
  return (
    <div className="absolute right-3 top-16 z-[1000] flex rounded-xl border border-brand-200 bg-cream p-1 shadow-lg shadow-brand-700/15 sm:top-3">
      {[
        { id: 'standard', label: 'Standard' },
        { id: 'satellite', label: 'Satellite' },
      ].map((layer) => (
        <button
          key={layer.id}
          type="button"
          aria-pressed={selectedLayer === layer.id}
          onClick={() => onSelectLayer(layer.id)}
          className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
            selectedLayer === layer.id ? 'bg-brand-700 text-white shadow-sm' : 'text-brand-700 hover:bg-brand-50'
          }`}
        >
          {layer.label}
        </button>
      ))}
    </div>
  )
}

function FullscreenControl() {
  const map = useMap()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === map.getContainer().parentElement)
      requestAnimationFrame(() => map.invalidateSize())
    }
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [map])

  const toggleFullscreen = async () => {
    const container = map.getContainer().parentElement
    if (!container) return

    setError('')
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
      } else {
        await container.requestFullscreen()
      }
    } catch (fullscreenError) {
      console.error('Could not toggle campus map fullscreen:', fullscreenError)
      setError('Fullscreen is unavailable in this browser.')
    }
  }

  return (
    <>
      {error && <p role="status" className="absolute bottom-[7.25rem] right-3 z-[1000] max-w-56 rounded-xl border border-brand-200 bg-cream px-3 py-2 text-xs font-medium text-brand-700 shadow-lg">{error}</p>}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen map' : 'View map fullscreen'}
        title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        className="absolute bottom-[4.5rem] right-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-cream text-brand-700 shadow-lg hover:bg-brand-50"
      >
        {isFullscreen ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 10V4h6M20 14v6h-6M4 4l6 6m10 10-6-6" />
          </svg>
        )}
      </button>
    </>
  )
}

function LocateControl({ onSelectLocation }) {
  const map = useMap()
  const [locating, setLocating] = useState(false)
  const [position, setPosition] = useState(null)
  const [error, setError] = useState('')

  useMapEvents({
    locationfound(event) {
      setLocating(false)
      const coords = [event.latlng.lat, event.latlng.lng]
      setPosition(coords)
      onSelectLocation?.({ lat: coords[0], lng: coords[1] })
      setError('')
    },
    locationerror() {
      setLocating(false)
      setError('Could not detect your location. Check browser permissions.')
    },
  })

  return (
    <>
      {position && <CircleMarker center={position} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />}
      {error && <p role="status" className="absolute bottom-[7.25rem] right-3 z-[1000] max-w-56 rounded-xl border border-brand-200 bg-cream px-3 py-2 text-xs font-medium text-brand-700 shadow-lg">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setLocating(true)
          setError('')
          map.locate({ setView: true, maxZoom: 17 })
        }}
        disabled={locating}
        className="absolute bottom-3 right-3 z-[1000] flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-cream px-3 text-xs font-bold text-brand-700 shadow-lg hover:bg-brand-50 disabled:cursor-wait disabled:opacity-70"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2" />
        </svg>
        {locating ? 'Locating…' : 'Recenter me'}
      </button>
    </>
  )
}

function LocationPicker({ onSelectLocation }) {
  useMapEvents({
    click(event) {
      onSelectLocation({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function SelectedLocation({ coords, radiusMeters }) {
  if (!coords) return null
  const position = [coords.lat, coords.lng]

  return (
    <>
      <Marker position={position} />
      {radiusMeters > 0 && (
        <Circle
          center={position}
          radius={radiusMeters}
          pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.16, weight: 2 }}
        />
      )}
    </>
  )
}

function MapCenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, map, zoom])
  return null
}

export default function CampusMap({
  items = [],
  center = DEFAULT_CENTER,
  className = '',
  onSelectLocation,
  selectedCoords = null,
  radiusMeters = 0,
}) {
  const [filter, setFilter] = useState('all')
  const [selectedLayer, setSelectedLayer] = useState('standard')
  const pickerCenter = useMemo(
    () => selectedCoords ? [selectedCoords.lat, selectedCoords.lng] : center,
    [center, selectedCoords?.lat, selectedCoords?.lng],
  )
  const mapItems = useMemo(() => items.filter((item) => coordinatesFor(item)), [items])
  const visibleItems = useMemo(
    () => mapItems.filter((item) => filter === 'all' || item.type === filter),
    [filter, mapItems],
  )
  const marketplaceCount = mapItems.filter((item) => item.type === 'marketplace').length
  const lostFoundCount = mapItems.filter((item) => item.type === 'lost-found').length
  return (
    <section className={`overflow-hidden rounded-3xl border border-brand-100 bg-white/95 shadow-md ${className}`}>
      <div className="flex flex-col gap-4 border-b border-brand-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-brand-700">Campus map</h2>
          <p className="mt-1 text-xs text-slate-500">Explore listings with a saved campus location.</p>
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Filter map pins">
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
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
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

      <div className="campus-map-container map-fullscreen-container relative h-[min(60vh,400px)] min-h-[300px] w-full sm:h-[400px]">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          zoomControl={false}
          className="h-full w-full"
        >
          {onSelectLocation && <MapCenter center={pickerCenter} zoom={selectedCoords ? 17 : 14} />}
          <TileLayer
            key={selectedLayer}
            attribution={selectedLayer === 'standard'
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              : 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}
            url={selectedLayer === 'standard'
              ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'}
          />
          <ZoomControl position="bottomleft" />
          <SearchControl onSelectLocation={onSelectLocation} />
          <LayerControl selectedLayer={selectedLayer} onSelectLayer={setSelectedLayer} />
          <FullscreenControl />
          <LocateControl onSelectLocation={onSelectLocation} />
          {onSelectLocation && <LocationPicker onSelectLocation={onSelectLocation} />}
          {onSelectLocation && <SelectedLocation coords={selectedCoords} radiusMeters={radiusMeters} />}
          <FitPins items={visibleItems} />
          {visibleItems.map((item) => {
            const position = coordinatesFor(item)
            const radius = Number(item.radius_meters)
            if (item.type !== 'lost-found' || item.status !== 'lost' || !position || !Number.isFinite(radius) || radius <= 0) return null
            return (
              <Circle
                key={`radius-${item.id}`}
                center={position}
                radius={radius}
                pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }}
              />
            )
          })}
          <MarkerClusterGroup chunkedLoading>
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
          </MarkerClusterGroup>
        </MapContainer>
        {visibleItems.length === 0 && !onSelectLocation && (
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
        Only posts with real saved coordinates appear as pins. OpenStreetMap and Esri map data.
      </p>
    </section>
  )
}
