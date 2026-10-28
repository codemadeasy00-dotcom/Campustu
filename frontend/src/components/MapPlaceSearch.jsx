import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { placesApi } from '../services/api.js'

export default function MapPlaceSearch({ onSelect, id = 'map-place-search' }) {
  const map = useMap()
  const rootRef = useRef(null)
  const requestNumber = useRef(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const searchQuery = query.trim()
    if (searchQuery.length < 3) {
      setResults([])
      setActiveIndex(-1)
      setSearching(false)
      setError('')
      return undefined
    }

    const requestId = ++requestNumber.current
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setError('')
      try {
        const { results: places } = await placesApi.search(searchQuery)
        if (requestId !== requestNumber.current) return
        setResults(places || [])
        setActiveIndex(-1)
        if (!places?.length) setError('No places found. Try adding a city or country.')
      } catch (searchError) {
        if (requestId !== requestNumber.current) return
        console.error('Map place search failed:', searchError)
        setResults([])
        setError(searchError.message || 'Place search is unavailable. Please try again.')
      } finally {
        if (requestId === requestNumber.current) setSearching(false)
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setFocused(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  function choosePlace(place) {
    const coordinates = [place.lat, place.lng]
    map.flyTo(coordinates, 16, { duration: 0.8 })
    onSelect?.({ lat: place.lat, lng: place.lng, label: place.label })
    setQuery(place.label)
    setResults([])
    setActiveIndex(-1)
    setFocused(false)
    setError('')
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1))
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault()
      choosePlace(results[activeIndex >= 0 ? activeIndex : 0])
    } else if (event.key === 'Escape') {
      setResults([])
      setFocused(false)
    }
  }

  const showResults = focused && results.length > 0

  return (
    <div ref={rootRef} className="absolute left-3 right-3 top-3 z-[1000] sm:right-auto sm:w-[min(24rem,calc(100%-1.5rem))]">
      <div className="flex items-center rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/15 transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="ml-3 h-5 w-5 shrink-0 text-brand-700" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="6.5" />
          <path strokeLinecap="round" d="m16 16 4 4" />
        </svg>
        <label className="sr-only" htmlFor={id}>Search for any place or destination</label>
        <input
          id={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={`${id}-results`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-result-${activeIndex}` : undefined}
          autoComplete="off"
          value={query}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            requestNumber.current += 1
            setQuery(event.target.value)
            setResults([])
            setActiveIndex(-1)
            setSearching(false)
            setError('')
          }}
          placeholder="Search any place or destination"
          className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {searching && (
          <span role="status" aria-label="Searching" className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
        )}
        {query && !searching && (
          <button
            type="button"
            aria-label="Clear place search"
            onClick={() => {
              requestNumber.current += 1
              setQuery('')
              setResults([])
              setError('')
              setFocused(true)
            }}
            className="mr-2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        )}
      </div>
      {showResults && (
        <ul
          id={`${id}-results`}
          role="listbox"
          className="mt-1 max-h-[min(60vh,22rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {results.map((place, index) => (
            <li
              key={`${place.lat}-${place.lng}-${place.label}`}
              id={`${id}-result-${index}`}
              role="option"
              aria-selected={activeIndex === index}
            >
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choosePlace(place)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                  activeIndex === index ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
                  <circle cx="12" cy="10" r="2" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">{place.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{place.label}</span>
                </span>
              </button>
            </li>
          ))}
          <li aria-hidden="true" className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
            Place data © OpenStreetMap contributors
          </li>
        </ul>
      )}
      {focused && error && (
        <p role="status" className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-lg">
          {error}
        </p>
      )}
      {focused && searching && query.trim().length >= 3 && !results.length && !error && (
        <p role="status" className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 shadow-lg">
          Searching places…
        </p>
      )}
    </div>
  )
}
