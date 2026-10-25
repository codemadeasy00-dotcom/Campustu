import React, { useEffect, useState, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, Marker, Popup, ZoomControl, useMapEvents, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { lostFoundApi, errorMessage } from '../services/api.js';
import { Alert, useToast } from '../components/ui.jsx';
import { processAndCompressImage } from '../utils/imageCompressor.js';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function hasValidCoordinates(item) {
  if (item.latitude == null || item.longitude == null || item.latitude === '' || item.longitude === '') return false;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// Leaflet default marker fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Pins
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY;
const standardTileUrl = cartoApiKey
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoApiKey)}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const standardTileAttribution = cartoApiKey
  ? '&copy; <a href="https://carto.com/attributions/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Search Box Component
function SearchField({ onSelect }) {
  const map = useMap();
  const provider = useMemo(() => new OpenStreetMapProvider(), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError('');
    setResults([]);
    try {
      const matches = await provider.search({ query: query.trim() });
      if (matches.length === 0) {
        setError('No places found. Try a nearby landmark.');
      } else {
        setResults(matches.slice(0, 5));
      }
    } catch (searchError) {
      console.error('Map search failed:', searchError);
      setError('Search is unavailable right now. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (result) => {
    map.setView([result.y, result.x], 17);
    onSelect?.([result.y, result.x]);
    setQuery(result.label);
    setResults([]);
  };

  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] sm:right-auto sm:w-96">
      <form
        onSubmit={handleSearch}
        className="flex items-center overflow-hidden rounded-xl border border-brand-200 bg-cream shadow-lg shadow-brand-700/15 transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-200"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="ml-3 h-4 w-4 shrink-0 text-brand-600" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="6.5" />
          <path strokeLinecap="round" d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          aria-label="Search map places"
          placeholder="Search a place or campus building"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            setError('');
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={searching}
          className="mr-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && (
        <p role="status" className="mt-1 rounded-lg bg-cream px-3 py-2 text-xs font-medium text-brand-700 shadow">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-52 overflow-y-auto rounded-xl border border-brand-200 bg-cream shadow-lg">
          {results.map((result) => (
            <li key={`${result.x}-${result.y}-${result.label}`}>
              <button
                type="button"
                onClick={() => selectResult(result)}
                className="w-full border-b border-brand-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-brand-50"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MapLayerControl({ selectedLayer, onSelectLayer }) {
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
            selectedLayer === layer.id
              ? 'bg-brand-700 text-white shadow-sm'
              : 'text-brand-700 hover:bg-brand-50'
          }`}
        >
          {layer.label}
        </button>
      ))}
    </div>
  );
}

// Click to Pinpoint Location
function LocationPinPicker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  const eventHandlers = useMemo(
    () => ({
      dragend(e) {
        const marker = e.target;
        if (marker != null) {
          const latLng = marker.getLatLng();
          setPosition([latLng.lat, latLng.lng]);
        }
      },
    }),
    [setPosition],
  );

  if (!position) return null;

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
    />
  );
}

function RadiusCenterPicker({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

// Auto-Locate Button
function LocateUserButton({ onLocationFound }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [position, setPosition] = useState(null);

  const handleLocate = () => {
    setLocating(true);
    setLocationError('');
    map.locate({ setView: true, maxZoom: 17 });
  };

  useMapEvents({
    locationfound(e) {
      setLocating(false);
      const coords = [e.latlng.lat, e.latlng.lng];
      setPosition(coords);
      if (onLocationFound) onLocationFound(coords);
    },
    locationerror() {
      setLocating(false);
      setLocationError('Could not detect your location. Check browser permissions.');
    }
  });

  return (
    <>
      {position && <CircleMarker center={position} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />}
      {locationError && (
        <p role="status" className="absolute bottom-16 right-3 z-[1000] max-w-56 rounded-xl border border-brand-200 bg-cream px-3 py-2 text-xs font-medium text-brand-700 shadow-lg">
          {locationError}
        </p>
      )}
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        className="absolute bottom-4 right-3 z-[1000] flex items-center gap-2 rounded-xl border border-brand-200 bg-cream px-4 py-2.5 text-xs font-bold text-brand-700 shadow-lg shadow-brand-700/15 transition hover:bg-brand-50 disabled:cursor-wait disabled:opacity-70"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2" />
        </svg>
        {locating ? 'Locating...' : 'Recenter me'}
      </button>
    </>
  );
}

function FullscreenButton() {
  const map = useMap();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === map.getContainer().parentElement);
      requestAnimationFrame(() => map.invalidateSize());
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, [map]);

  const toggleFullscreen = async () => {
    const container = map.getContainer().parentElement;
    if (!container) return;

    setFullscreenError('');
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error('Could not toggle lost-and-found map fullscreen:', error);
      setFullscreenError('Fullscreen is unavailable in this browser.');
    }
  };

  return (
    <>
      {fullscreenError && <p role="status" className="absolute bottom-[7.25rem] right-3 z-[1000] max-w-56 rounded-xl border border-brand-200 bg-cream px-3 py-2 text-xs font-medium text-brand-700 shadow-lg">{fullscreenError}</p>}
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
  );
}

export default function LostFound() {
  const showToast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [nearbyCenter, setNearbyCenter] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [nearbyItems, setNearbyItems] = useState(null);
  const [nearbyHasMore, setNearbyHasMore] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  
  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [claimModalItem, setClaimModalItem] = useState(null);
  const [potentialMatches, setPotentialMatches] = useState([]);
  const [claimAnswer, setClaimAnswer] = useState('');
  const [claimResult, setClaimResult] = useState(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [postError, setPostError] = useState('');
  const [postingItem, setPostingItem] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const photoPreviewsRef = React.useRef([]);

  // Default Campus Coordinates (DBATU Lonere)
  const defaultCenter = [18.1678, 73.3364];
  const [modalPin, setModalPin] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState('standard');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Electronics & Gadgets',
    status: 'lost',
    location_name: '',
    latitude: null,
    longitude: null,
    security_question: '',
    security_answer: '',
    dropoff_location: 'Main Security Gate',
  });

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      latitude: modalPin?.[0] ?? null,
      longitude: modalPin?.[1] ?? null
    }));
  }, [modalPin]);

  useEffect(() => () => photoPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const clearPhotos = () => {
    photoPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoPreviewsRef.current = [];
    setPhotoPreviews([]);
    setPhotos([]);
  };

  const handlePhotoSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setPostError('');
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (selectedFiles.length > remainingSlots) {
      setPostError(`You can add up to ${MAX_PHOTOS} photos.`);
    }

    const validFiles = selectedFiles.slice(0, remainingSlots).filter((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setPostError(`${file.name} must be a JPEG, PNG, or WebP image.`);
        return false;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPostError(`${file.name} is larger than 8 MB.`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    setProcessingPhotos(true);
    try {
      const processedFiles = await Promise.all(validFiles.map((file) => processAndCompressImage(file)));
      const oversized = processedFiles.find((file) => file.size > MAX_PHOTO_BYTES);
      if (oversized) throw new Error(`${oversized.name} is still larger than 8 MB after compression.`);
      const urls = processedFiles.map((file) => URL.createObjectURL(file));
      photoPreviewsRef.current = [...photoPreviewsRef.current, ...urls];
      setPhotos((current) => [...current, ...processedFiles]);
      setPhotoPreviews((current) => [...current, ...urls]);
    } catch (err) {
      setPostError(errorMessage(err));
    } finally {
      setProcessingPhotos(false);
    }
  };

  const removePhoto = (index) => {
    URL.revokeObjectURL(photoPreviews[index]);
    photoPreviewsRef.current = photoPreviewsRef.current.filter((_, photoIndex) => photoIndex !== index);
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setPhotoPreviews((current) => current.filter((_, photoIndex) => photoIndex !== index));
  };

  const fetchItems = async () => {
    setLoading(true);
    setItemsError('');
    try {
      const data = await lostFoundApi.list({ status: statusFilter, search });
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to fetch items:", err);
      setItemsError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNearbyItems(null);
    setNearbyHasMore(false);
    setNearbyError('');
    fetchItems();
  }, [statusFilter, search]);

  const selectNearbyCenter = (coords) => {
    setNearbyCenter(coords);
    setNearbyItems(null);
    setNearbyHasMore(false);
    setNearbyError('');
  };

  const searchNearby = async () => {
    if (!nearbyCenter) {
      setNearbyError('Choose a search center by using Recenter me, searching for a place, or clicking the map.');
      return;
    }

    setNearbyLoading(true);
    setNearbyItems(null);
    setNearbyHasMore(false);
    setNearbyError('');
    try {
      const result = await lostFoundApi.nearby({
        lat: nearbyCenter[0],
        lng: nearbyCenter[1],
        radius: radiusMeters,
        status: statusFilter,
        search: search.trim(),
      });
      setNearbyItems(result.items);
      setNearbyHasMore(result.has_more);
    } catch (err) {
      console.error('Nearby lost-and-found search failed:', err);
      setNearbyError(errorMessage(err));
    } finally {
      setNearbyLoading(false);
    }
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    setPostError('');
    if (processingPhotos) {
      setPostError('Wait for photo processing to finish.');
      return;
    }
    setPostingItem(true);
    let embeddingWarning = '';
    try {
      let embedding = null;
      if (photoPreviews.length > 0) {
        try {
          const { getImageEmbedding } = await import('../utils/embedder.js');
          embedding = await getImageEmbedding(photoPreviews[0]);
        } catch (embeddingError) {
          console.error('Could not create a visual embedding:', embeddingError);
          embeddingWarning = errorMessage(embeddingError);
        }
      }

      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          payload.append(key, String(value));
        }
      });
      if (embedding) payload.append('embedding', JSON.stringify(embedding));
      photos.forEach((photo) => payload.append('photos', photo));
      const result = await lostFoundApi.create(payload);
      clearPhotos();
      setShowPostModal(false);
      setPotentialMatches(result.potential_matches || []);
      setFormData({
        title: '',
        description: '',
        category: 'Electronics & Gadgets',
        status: 'lost',
        location_name: '',
        latitude: modalPin?.[0] ?? null,
        longitude: modalPin?.[1] ?? null,
        security_question: '',
        security_answer: '',
        dropoff_location: 'Main Security Gate',
      });
      setModalPin(null);
      if (embeddingWarning) {
        showToast(`Item published, but visual matching could not run: ${embeddingWarning}`);
      } else if (result.potential_matches?.length) {
        showToast('Item published. Potential visual matches are shown below.');
      } else if (embedding) {
        showToast('Item published. No matching image-enabled opposite-status posts were found.');
      } else {
        showToast('Lost & found item published.');
      }
      await fetchItems();
    } catch (err) {
      console.error("Post error:", err);
      setPostError(embeddingWarning
        ? `${errorMessage(err)} Visual matching also failed: ${embeddingWarning}`
        : errorMessage(err));
    } finally {
      setPostingItem(false);
    }
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimModalItem) return;
    setSubmittingClaim(true);
    setClaimResult(null);

    try {
      const data = await lostFoundApi.claim(claimModalItem.id, claimAnswer);
      setClaimResult(data);
    } catch (err) {
      setClaimResult({ success: false, message: errorMessage(err) });
    } finally {
      setSubmittingClaim(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-800 to-slate-900 rounded-3xl p-8 mb-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="bg-teal-500/20 text-teal-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Campus Safety & Recovery
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold mt-2">Lost & Found Portal</h1>
          <p className="text-teal-100/80 text-sm max-w-xl mt-1">
            Pinpoint lost items on the campus map and submit answers to claim your belongings safely.
          </p>
        </div>
        <button
          onClick={() => {
            setModalPin(null);
            setShowPostModal(true);
          }}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95"
        >
          + Report Lost / Found Item
        </button>
      </div>

      {potentialMatches.length > 0 && (
        <section aria-labelledby="potential-matches-title" className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="potential-matches-title" className="font-bold text-amber-950">Potential visual matches</h2>
              <p className="mt-1 text-xs text-amber-900">These are image-enabled opposite-status posts from your college, ranked by visual similarity. Scores are not proof of a match; verify the details before contacting the poster.</p>
            </div>
            <button
              type="button"
              onClick={() => setPotentialMatches([])}
              aria-label="Dismiss potential matches"
              className="rounded-lg px-2 py-1 text-sm font-bold text-amber-900 hover:bg-amber-100"
            >
              ×
            </button>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {potentialMatches.map((match) => (
              <li key={match.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white">
                {match.photo && <img src={match.photo} alt="" className="h-36 w-full object-cover" />}
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      match.status === 'found' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}>{match.status}</span>
                    <span className="text-xs font-semibold text-slate-500">
                      {Math.round(Math.max(0, Math.min(1, match.similarity_score)) * 100)}% image similarity
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-slate-900">{match.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{match.description}</p>
                  <p className="mt-2 truncate text-xs text-slate-500">{match.location_name}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setClaimModalItem(match);
                      setClaimAnswer('');
                      setClaimResult(null);
                    }}
                    className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Review match
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Main Interactive Map with Standard/Satellite Switcher */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mb-8 z-0 relative">
        <div className="mb-3 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-500">Interactive Campus Pin Map (Standard / Satellite)</h3>
            <p className="mt-1 text-[11px] text-slate-400">Search or click the map to choose a radius center. Recenter me uses your location.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="lost-found-radius" className="text-xs font-semibold text-slate-600">Radius</label>
            <select
              id="lost-found-radius"
              value={radiusMeters}
              onChange={(event) => {
                setRadiusMeters(Number(event.target.value));
                setNearbyItems(null);
                setNearbyHasMore(false);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value={500}>500 m</option>
              <option value={1000}>1 km</option>
              <option value={2000}>2 km</option>
            </select>
            <button
              type="button"
              onClick={searchNearby}
              disabled={nearbyLoading || !nearbyCenter}
              className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {nearbyLoading ? 'Searching…' : 'Search nearby'}
            </button>
            {nearbyItems && (
              <button
                type="button"
                onClick={() => {
                  setNearbyItems(null);
                  setNearbyHasMore(false);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {nearbyError && <div className="mb-3"><Alert>{nearbyError}</Alert></div>}
        {nearbyItems && (
          <p role="status" className="mb-3 px-2 text-xs text-slate-600">
            Showing {nearbyItems.length} located {nearbyItems.length === 1 ? 'post' : 'posts'} within {radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`}.
            {nearbyHasMore && ' Showing the nearest 200 posts.'}
          </p>
        )}
        
        <div className="map-fullscreen-container relative w-full h-[450px] rounded-xl overflow-hidden z-0">
          <MapContainer center={defaultCenter} zoom={16} zoomControl={false} scrollWheelZoom={true} className="lost-found-map w-full h-full z-0">
            <TileLayer
              key={selectedLayer}
              attribution={selectedLayer === 'standard'
                ? standardTileAttribution
                : 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGIS, and the GIS User Community'}
              url={selectedLayer === 'standard'
                ? standardTileUrl
                : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'}
            />
            <ZoomControl position="bottomleft" />
            <SearchField onSelect={selectNearbyCenter} />
            <MapLayerControl selectedLayer={selectedLayer} onSelectLayer={setSelectedLayer} />
            <FullscreenButton />
            <LocateUserButton onLocationFound={selectNearbyCenter} />
            <RadiusCenterPicker onSelect={selectNearbyCenter} />
            {nearbyCenter && (
              <>
                <Circle
                  center={nearbyCenter}
                  radius={radiusMeters}
                  interactive={false}
                  pathOptions={{ color: '#175a6d', weight: 2, fillColor: '#4fa8b3', fillOpacity: 0.12 }}
                />
                <CircleMarker
                  center={nearbyCenter}
                  radius={6}
                  interactive={false}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: '#175a6d', fillOpacity: 1 }}
                />
              </>
            )}
            
            <MarkerClusterGroup chunkedLoading>
              {(nearbyItems ?? items).map((item) => (
                hasValidCoordinates(item) ? (
                  <Marker
                    key={item.id}
                    position={[Number(item.latitude), Number(item.longitude)]}
                    icon={item.status === 'lost' ? redIcon : greenIcon}
                  >
                    <Popup>
                      <div className="p-1 max-w-[180px]">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${item.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.status}
                        </span>
                        <h4 className="font-bold text-sm mt-1 mb-0.5">{item.title}</h4>
                        <p className="text-xs text-slate-600 m-0">📍 {item.location_name}</p>
                        {item.distance_meters != null && (
                          <p className="mt-1 text-xs font-semibold text-brand-700">{Number(item.distance_meters)} m away</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ) : null
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input
          type="text"
          placeholder="Search listings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-96 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <div className="flex bg-slate-100 p-1 rounded-lg">
          {['all', 'lost', 'found'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold capitalize transition-all ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Item List */}
      {itemsError && <div className="mb-6"><Alert>{itemsError}</Alert></div>}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading lost & found items...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-500 font-medium">No items reported yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              {item.photo && (
                <img
                  src={item.photo}
                  alt={item.title}
                  className="mb-4 h-40 w-full rounded-xl bg-slate-100 object-cover"
                />
              )}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    item.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-slate-400 truncate max-w-[120px]">📍 {item.location_name}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-1 line-clamp-1">{item.title}</h3>
                <p className="text-xs text-slate-600 line-clamp-2 mb-4">{item.description}</p>
              </div>

              <button
                onClick={() => {
                  setClaimModalItem(item);
                  setClaimAnswer('');
                  setClaimResult(null);
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 rounded-xl transition-all"
              >
                Claim Item
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Claim Modal */}
      {claimModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Claim Item: {claimModalItem.title}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {claimModalItem.security_question 
                ? `Answer the security question to verify ownership.`
                : `Submit proof details to verify ownership.`}
            </p>

            {claimResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl text-sm font-medium ${claimResult.success && claimResult.claim?.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {claimResult.message}
                </div>

                {claimResult.claim?.handover_pass_code && (
                  <div className="bg-teal-50 border border-teal-200 p-4 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-bold text-teal-700 tracking-wider">Campus Security Handover Pass</span>
                    <div className="text-2xl font-mono font-extrabold text-teal-900 my-1">
                      {claimResult.claim.handover_pass_code}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setClaimModalItem(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                {claimModalItem.security_question && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700">
                    ❓ <strong>Question:</strong> {claimModalItem.security_question}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Your Answer / Proof</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter answer..."
                    value={claimAnswer}
                    onChange={(e) => setClaimAnswer(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClaimModalItem(null)}
                    className="flex-1 bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingClaim}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-xl"
                  >
                    {submittingClaim ? 'Verifying...' : 'Submit Claim'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Post Modal */}
      {showPostModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Report Lost / Found Item</h3>
            <form onSubmit={handlePostSubmit} className="space-y-4">
              {postError && <Alert>{postError}</Alert>}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                >
                  <option value="lost">Lost Item</option>
                  <option value="found">Found Item</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                >
                  <option>Electronics &amp; Gadgets</option>
                  <option>Books &amp; Study Materials</option>
                  <option>Clothing &amp; Accessories</option>
                  <option>Keys &amp; ID Cards</option>
                  <option>Bags &amp; Personal Items</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  placeholder="e.g., Casio Scientific Calculator"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  placeholder="Describe the item and any identifying details."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full resize-y px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Photos <span className="font-normal text-slate-400">(optional, up to {MAX_PHOTOS}; JPEG, PNG, WebP; 8 MB each)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {photoPreviews.map((url, index) => (
                    <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                      <img src={url} alt={`Selected item photo ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/75 px-1.5 text-xs text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className={`flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-brand-200 text-center text-xs text-brand-700 ${processingPhotos ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-brand-50'}`}>
                      {processingPhotos ? 'Preparing…' : '+ Add photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="sr-only"
                        onChange={handlePhotoSelect}
                        disabled={processingPhotos}
                      />
                    </label>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Photos are resized and location metadata is removed before upload.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Spot Name</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  placeholder="e.g., Central Library 2nd Floor"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Click on Map to Pinpoint Location
                </label>
                <div className="map-fullscreen-container relative w-full h-[300px] rounded-xl overflow-hidden border border-slate-200">
                  <MapContainer center={modalPin ?? defaultCenter} zoom={16} zoomControl={false} scrollWheelZoom={false} className="lost-found-map w-full h-full">
                    <TileLayer
                      attribution={standardTileAttribution}
                      url={standardTileUrl}
                    />
                    <ZoomControl position="bottomleft" />
                    <SearchField onSelect={setModalPin} />
                    <FullscreenButton />
                    <LocateUserButton onLocationFound={(coords) => setModalPin(coords)} />
                    <LocationPinPicker position={modalPin} setPosition={setModalPin} />
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {modalPin
                    ? `Selected pin: Lat ${modalPin[0].toFixed(5)}, Lon ${modalPin[1].toFixed(5)}`
                    : 'No map location selected. Click the map, search for a place, or use Recenter me; otherwise this post will have no map pin.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Question</label>
                <input
                  type="text"
                  placeholder="e.g., What color is the cover?"
                  value={formData.security_question}
                  onChange={(e) => setFormData({ ...formData, security_question: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Answer</label>
                <input
                  type="text"
                  placeholder="Expected answer"
                  value={formData.security_answer}
                  onChange={(e) => setFormData({ ...formData, security_answer: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    clearPhotos();
                    setPostError('');
                    setModalPin(null);
                    setShowPostModal(false);
                  }}
                  disabled={postingItem || processingPhotos}
                  className="flex-1 bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingItem || processingPhotos}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-xl disabled:cursor-wait disabled:opacity-60"
                >
                  {postingItem ? 'Analyzing photo & publishing…' : 'Publish Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}