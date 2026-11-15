import { useState } from 'react'
import { PlaceSearchInput } from './MapPlaceSearch.jsx'

export default function MapLocationBootstrap({ id, onSelect }) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location detection is unavailable in this browser. Search for a place instead.')
      return
    }

    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        onSelect({ lat: coords.latitude, lng: coords.longitude })
      },
      () => {
        setLocating(false)
        setError('Could not detect your location. Check browser permissions or search for a place.')
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4">
      <p className="text-sm text-slate-700">
        A verified campus center is unavailable. Search for a real place or choose your current location to open the map.
      </p>
      <PlaceSearchInput
        id={id}
        className="relative w-full"
        onSelect={({ lat, lng }) => onSelect({ lat, lng })}
      />
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-70"
      >
        {locating ? 'Locating…' : 'Use my current location'}
      </button>
      {error && <p role="status" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
