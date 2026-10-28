import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, TileLayer, Marker, Popup, ZoomControl, useMapEvents, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { lostFoundApi, errorMessage } from '../services/api.js';
import { Alert, useToast } from '../components/ui.jsx';
import { processAndCompressImage } from '../utils/imageCompressor.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHero from '../components/PageHero.jsx';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const DELETE_WINDOW_MS = 8 * 60 * 60 * 1000;

function deleteTimeRemaining(item, now) {
  const remaining = DELETE_WINDOW_MS - (now - new Date(item.created_at).getTime());
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function hasValidCoordinates(item) {
  if (item.latitude == null || item.longitude == null || item.latitude === '' || item.longitude === '') return false;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function LostFoundSkeleton() {
  return (
    <ul aria-label="Loading lost and found reports" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} aria-hidden="true" className="surface-card overflow-hidden p-4">
          <div className="skeleton-shimmer mb-4 h-40 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton-shimmer h-4 w-2/5 rounded" />
            <div className="skeleton-shimmer h-4 w-3/4 rounded" />
            <div className="skeleton-shimmer h-3 w-full rounded" />
            <div className="skeleton-shimmer h-3 w-4/5 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
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
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showMine, setShowMine] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
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
  const [claimsModalItem, setClaimsModalItem] = useState(null);
  const [managedClaims, setManagedClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState('');
  const [reviewingClaimId, setReviewingClaimId] = useState(null);
  const [handoverCodes, setHandoverCodes] = useState({});
  const [redeemingClaimId, setRedeemingClaimId] = useState(null);
  const [myClaimsOpen, setMyClaimsOpen] = useState(false);
  const [myClaims, setMyClaims] = useState([]);
  const [myClaimsLoading, setMyClaimsLoading] = useState(false);
  const [myClaimsError, setMyClaimsError] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editFields, setEditFields] = useState(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
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
      const data = showMine
        ? await lostFoundApi.mine()
        : await lostFoundApi.list({ status: statusFilter, search });
      const receivedItems = data.items || [];
      setItems(showMine
        ? receivedItems.filter((item) => {
          const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
          const term = search.trim().toLowerCase();
          return matchesStatus && (!term || `${item.title} ${item.description}`.toLowerCase().includes(term));
        })
        : receivedItems);
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
  }, [statusFilter, search, showMine]);

  useEffect(() => {
    if (!showMine) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showMine]);

  useEffect(() => {
    if (!showMine) return undefined;
    let cancelled = false;
    let previousPendingCount = null;
    const refreshMyReports = async () => {
      try {
        const result = await lostFoundApi.mine();
        if (cancelled) return;
        const reports = result.items || [];
        const pendingCount = reports.reduce(
          (total, item) => total + (Number(item.pending_claim_count) || 0),
          0,
        );
        if (previousPendingCount !== null && pendingCount > previousPendingCount) {
          const newClaims = pendingCount - previousPendingCount;
          showToast(`${newClaims} new claim${newClaims === 1 ? '' : 's'} received. Review it in My reports.`);
        }
        previousPendingCount = pendingCount;
        const term = search.trim().toLowerCase();
        setItems(reports.filter((item) =>
          (statusFilter === 'all' || item.status === statusFilter)
          && (!term || `${item.title} ${item.description}`.toLowerCase().includes(term)),
        ));
        setItemsError('');
      } catch (err) {
        if (cancelled) return;
        console.error('Could not refresh pending lost-and-found claims:', err);
        setItemsError(errorMessage(err));
      }
    };

    refreshMyReports();
    const timer = window.setInterval(refreshMyReports, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showMine, statusFilter, search, showToast]);

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

  const openManagedClaims = async (item) => {
    setClaimsModalItem(item);
    setManagedClaims([]);
    setClaimsError('');
    setClaimsLoading(true);
    try {
      const result = await lostFoundApi.claims(item.id);
      setManagedClaims(result.claims || []);
    } catch (err) {
      console.error('Could not load report claims:', err);
      setClaimsError(errorMessage(err));
    } finally {
      setClaimsLoading(false);
    }
  };

  const handleClaimReview = async (claim, action) => {
    if (!claimsModalItem) return;
    setReviewingClaimId(claim.id);
    setClaimsError('');
    try {
      await lostFoundApi.reviewClaim(claimsModalItem.id, claim.id, action);
      showToast(action === 'approve'
        ? 'Claim approved. The claimant can now view their handover code.'
        : 'Claim rejected.');
      const [claimsResult] = await Promise.all([
        lostFoundApi.claims(claimsModalItem.id),
        fetchItems(),
      ]);
      setManagedClaims(claimsResult.claims || []);
    } catch (err) {
      console.error('Could not review lost-and-found claim:', err);
      setClaimsError(errorMessage(err));
    } finally {
      setReviewingClaimId(null);
    }
  };

  const redeemHandoverCode = async (claim) => {
    const code = handoverCodes[claim.id] || '';
    setRedeemingClaimId(claim.id);
    setClaimsError('');
    try {
      await lostFoundApi.redeemClaim(claim.id, code);
      setHandoverCodes((current) => ({ ...current, [claim.id]: '' }));
      showToast('Handover verified. The report is resolved.');
      const [claimsResult] = await Promise.all([
        lostFoundApi.claims(claimsModalItem.id),
        fetchItems(),
      ]);
      setManagedClaims(claimsResult.claims || []);
    } catch (err) {
      console.error('Could not verify the handover code:', err);
      setClaimsError(errorMessage(err));
    } finally {
      setRedeemingClaimId(null);
    }
  };

  const openMyClaims = async () => {
    setMyClaimsOpen(true);
    setMyClaims([]);
    setMyClaimsError('');
    setMyClaimsLoading(true);
    try {
      const result = await lostFoundApi.myClaims();
      setMyClaims(result.claims || []);
    } catch (err) {
      console.error('Could not load your claims:', err);
      setMyClaimsError(errorMessage(err));
    } finally {
      setMyClaimsLoading(false);
    }
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setEditFields({
      title: item.title,
      description: item.description,
      category: item.category,
      brand: item.brand || '',
      colour: item.colour || '',
      radius_meters: Number(item.radius_meters) || 0,
      location_name: item.location_name,
      location_note: item.location_note || '',
    });
    setEditError('');
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingItem || !editFields) return;
    setSavingEdit(true);
    setEditError('');
    try {
      await lostFoundApi.update(editingItem.id, {
        ...editFields,
        radius_meters: Number(editFields.radius_meters),
      });
      setEditingItem(null);
      showToast('Lost-and-found report updated.');
      await fetchItems();
    } catch (err) {
      console.error('Could not update lost-and-found report:', err);
      setEditError(errorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLifecycleAction = async (item, action) => {
    const message = action === 'resolve'
      ? 'Mark this report as returned? It will leave active search and its photos will be removed.'
      : 'Close this report? It will leave active search and its photos will be removed.';
    if (!window.confirm(message)) return;
    try {
      const result = await lostFoundApi.setLifecycle(item.id, action);
      showToast(result.media_cleanup_pending
        ? 'Report updated. Photo cleanup is queued and will retry automatically.'
        : action === 'resolve' ? 'Report marked returned.' : 'Report closed.');
      setNearbyItems(null);
      await fetchItems();
    } catch (err) {
      console.error('Could not update lost-and-found lifecycle:', err);
      setItemsError(errorMessage(err));
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    try {
      const result = await lostFoundApi.remove(item.id);
      showToast(result.media_cleanup_pending
        ? 'Report deleted. Photo cleanup is queued and will retry automatically.'
        : 'Report permanently deleted.');
      setNearbyItems(null);
      await fetchItems();
    } catch (err) {
      console.error('Could not delete lost-and-found report:', err);
      setItemsError(errorMessage(err));
    }
  };

  const pendingReviewCount = items.reduce(
    (total, item) => total + (Number(item.pending_claim_count) || 0),
    0,
  );

  return (
    <div className="page-enter mx-auto max-w-7xl space-y-6">
      <PageHero
        eyebrow="Campus safety & recovery"
        title="Lost & Found Portal"
        description="Pinpoint lost items on the campus map and submit answers to claim your belongings safely."
      >
          <button
            type="button"
            aria-pressed={showMine}
            onClick={() => setShowMine((value) => !value)}
            className="rounded-xl border border-white/35 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20"
          >
            {showMine ? 'Browse active reports' : 'My reports'}
          </button>
          <button
            type="button"
            onClick={openMyClaims}
            className="rounded-xl border border-white/35 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20"
          >
            My claims
          </button>
          <Link
            to="/lost-found/report"
            className="rounded-xl bg-teal-300 px-5 py-3 text-sm font-bold text-teal-950 shadow-lg shadow-teal-950/15 hover:bg-teal-200 active:scale-95"
          >
            + Report Lost / Found Item
          </Link>
      </PageHero>

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
      <div className="surface-panel relative z-0 p-3 sm:p-4">
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
        
        <div className="map-fullscreen-container relative z-0 h-[min(60vh,450px)] min-h-[260px] w-full overflow-hidden rounded-xl sm:h-[450px]">
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
              {(nearbyItems ?? items).filter((item) => item.lifecycle_status === 'active' && ['lost', 'found'].includes(item.status)).map((item) => (
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
      <div className="surface-panel flex flex-col items-center justify-between gap-4 p-4 md:flex-row">
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

      {showMine && pendingReviewCount > 0 && (
        <div className="mb-6">
          <Alert kind="warn">
            You have {pendingReviewCount} pending {pendingReviewCount === 1 ? 'claim' : 'claims'} to review. Open Manage claims on the relevant report.
          </Alert>
        </div>
      )}

      {/* Item List */}
      {itemsError && <div className="mb-6"><Alert>{itemsError}</Alert></div>}
      {loading ? (
        <LostFoundSkeleton />
      ) : items.length === 0 ? (
        <div className="surface-panel py-16 text-center">
          <p className="text-slate-500 font-medium">{showMine ? 'You have not reported any items yet.' : 'No active items reported yet.'}</p>
        </div>
      ) : (
        <div className="stagger-list grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const isOwner = item.user_id === user?.id;
            const isAdmin = user?.role === 'admin';
            const remainingDeleteTime = deleteTimeRemaining(item, clockNow);
            const claimCount = Number(item.claim_count) || 0;
            const canDelete = isAdmin || (isOwner && remainingDeleteTime && claimCount === 0);

            return (
              <div key={item.id} className="surface-card interactive-card flex flex-col justify-between p-4 sm:p-5">
                {item.photo && (
                  <img
                    src={item.photo}
                    alt={item.title}
                    className="mb-4 h-40 w-full rounded-xl bg-slate-100 object-cover"
                  />
                )}
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      item.status === 'lost' ? 'bg-red-100 text-red-700' : item.status === 'found' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.lifecycle_status !== 'active' && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">
                        {item.lifecycle_status.replace('_', ' ')}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 truncate max-w-[120px]">📍 {item.location_name}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2 mb-4">{item.description}</p>
                </div>

                {showMine && isOwner ? (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => openManagedClaims(item)}
                      className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-xs font-bold text-brand-800 hover:bg-brand-100"
                    >
                      Manage claims ({Number(item.pending_claim_count) || 0} pending)
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className="w-full rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit report
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item)}
                        className="w-full rounded-xl border border-red-200 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        {isAdmin ? 'Admin: purge report' : `Delete permanently · ${remainingDeleteTime} left`}
                      </button>
                    ) : (
                      <p className="text-center text-[11px] text-slate-500">
                        {claimCount > 0 ? 'Permanent deletion is locked because claims exist.' : 'Permanent deletion is locked after 8 hours.'}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleLifecycleAction(item, 'close')}
                        className="rounded-xl bg-slate-700 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Close post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLifecycleAction(item, 'resolve')}
                        className="rounded-xl bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        Mark returned
                      </button>
                    </div>
                  </div>
                ) : isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item)}
                    className="w-full rounded-xl border border-red-200 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Admin: purge report
                  </button>
                ) : isOwner ? (
                  <button
                    type="button"
                    onClick={() => setShowMine(true)}
                    className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-xs font-bold text-brand-800 hover:bg-brand-100"
                  >
                    Manage your report
                  </button>
                ) : item.lifecycle_status === 'active' && ['lost', 'found'].includes(item.status) ? (
                  <div className="space-y-2">
                    <Link
                      to={`/messages?lost_found_item_id=${encodeURIComponent(item.id)}`}
                      className="block w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-center text-xs font-bold text-brand-800 transition hover:bg-brand-100"
                    >
                      Message poster
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setClaimModalItem(item);
                        setClaimAnswer('');
                        setClaimResult(null);
                      }}
                      className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white transition-all hover:bg-slate-800"
                    >
                      Claim Item
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-500">This report is not accepting claims.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Claim Modal */}
      {claimModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4">
          <div className="animate-fade-in max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Claim Item: {claimModalItem.title}</h3>
            <p className="text-xs text-slate-500 mb-4">
              Submitting creates a verification request. The report owner reviews it; no handover code is issued until they approve.
            </p>

            {claimResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl text-sm font-medium ${claimResult.success ? 'bg-sky-50 text-sky-800 border border-sky-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {claimResult.message}
                </div>
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
                    <strong>Owner's security question:</strong> {claimModalItem.security_question}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {claimModalItem.security_question ? 'Your answer' : 'Describe proof of ownership'}
                  </label>
                  <textarea
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
                    placeholder={claimModalItem.security_question ? 'Answer the owner’s question' : 'Describe where and when you lost it, or a detail that helps identify it'}
                    value={claimAnswer}
                    onChange={(e) => setClaimAnswer(e.target.value)}
                    className="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
                    {submittingClaim ? 'Sending…' : 'Send for review'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {claimsModalItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="manage-claims-title" className="animate-fade-in max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="manage-claims-title" className="text-xl font-bold text-slate-900">Claims for {claimsModalItem.title}</h2>
                <p className="mt-1 text-xs text-slate-500">Review each answer or proof privately. Approval creates one handover code and rejects other pending claims.</p>
              </div>
              <button type="button" onClick={() => setClaimsModalItem(null)} className="rounded-lg px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100" aria-label="Close claims">×</button>
            </div>
            {claimsError && <div className="mt-4"><Alert>{claimsError}</Alert></div>}
            {claimsLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading claims…</p>
            ) : managedClaims.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No claims have been submitted for this report.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {managedClaims.map((claim) => (
                  <li key={claim.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{claim.claimant_name}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        claim.status === 'pending' ? 'bg-amber-100 text-amber-900' : claim.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'
                      }`}>{claim.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(claim.created_at).toLocaleString()}</p>
                    <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{claim.claim_text}</p>
                    {['pending', 'approved'].includes(claim.status) && (
                      <Link
                        to={`/messages?claim_id=${encodeURIComponent(claim.id)}`}
                        className="mt-3 inline-flex text-xs font-semibold text-brand-700 underline hover:text-brand-600"
                      >
                        Message claimant
                      </Link>
                    )}
                    {claim.status === 'pending' && claimsModalItem.lifecycle_status === 'active' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleClaimReview(claim, 'approve')}
                          disabled={reviewingClaimId !== null}
                          className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {reviewingClaimId === claim.id ? 'Saving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClaimReview(claim, 'reject')}
                          disabled={reviewingClaimId !== null}
                          className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {claim.status === 'approved' && (
                      <form
                        className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row"
                        onSubmit={(event) => {
                          event.preventDefault();
                          redeemHandoverCode(claim);
                        }}
                      >
                        <label className="sr-only" htmlFor={`handover-code-${claim.id}`}>Claimant's handover code</label>
                        <input
                          id={`handover-code-${claim.id}`}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          value={handoverCodes[claim.id] || ''}
                          onChange={(event) => setHandoverCodes((current) => ({
                            ...current,
                            [claim.id]: event.target.value.replace(/\D/g, '').slice(0, 6),
                          }))}
                          placeholder="Enter claimant's 6-digit code"
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          type="submit"
                          disabled={redeemingClaimId !== null || (handoverCodes[claim.id] || '').length !== 6}
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {redeemingClaimId === claim.id ? 'Verifying…' : 'Verify handover'}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setClaimsModalItem(null)} className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">Close</button>
          </section>
        </div>
      )}

      {myClaimsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="my-claims-title" className="animate-fade-in max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="my-claims-title" className="text-xl font-bold text-slate-900">My claims</h2>
                <p className="mt-1 text-xs text-slate-500">Only you can see your submitted proof and approved handover codes.</p>
              </div>
              <button type="button" onClick={() => setMyClaimsOpen(false)} className="rounded-lg px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100" aria-label="Close my claims">×</button>
            </div>
            {myClaimsError && <div className="mt-4"><Alert>{myClaimsError}</Alert></div>}
            {myClaimsLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading your claims…</p>
            ) : myClaims.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">You have not submitted any claims yet.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {myClaims.map((claim) => (
                  <li key={claim.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-900">{claim.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        claim.status === 'pending' ? 'bg-amber-100 text-amber-900' : claim.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'
                      }`}>{claim.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{claim.location_name} · {new Date(claim.created_at).toLocaleString()}</p>
                    {claim.status === 'pending' && <p className="mt-3 text-sm text-amber-800">Waiting for the report owner to review your proof.</p>}
                    {claim.status === 'approved' && claim.handover_code && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                        <p className="text-xs font-semibold text-emerald-900">Show this code at the handover</p>
                        <p className="mt-1 font-mono text-2xl font-extrabold tracking-widest text-emerald-950">{claim.handover_code}</p>
                      </div>
                    )}
                    {claim.status === 'rejected' && <p className="mt-3 text-sm text-slate-600">The report owner did not approve this claim.</p>}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setMyClaimsOpen(false)} className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">Close</button>
          </section>
        </div>
      )}

      {editingItem && editFields && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleEditSubmit} className="animate-fade-in max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Edit report</h2>
                <p className="mt-1 text-xs text-slate-500">You can edit your report even after it is closed or resolved.</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="rounded-lg px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100" aria-label="Close edit form">×</button>
            </div>
            {editError && <Alert>{editError}</Alert>}
            <label className="block text-sm font-semibold text-slate-700">
              Title
              <input required minLength={3} maxLength={255} value={editFields.title} onChange={(event) => setEditFields({ ...editFields, title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Description
              <textarea required minLength={5} maxLength={2000} rows={4} value={editFields.description} onChange={(event) => setEditFields({ ...editFields, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Category
                <select value={editFields.category} onChange={(event) => setEditFields({ ...editFields, category: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  {['Electronics & Gadgets', 'Books & Study Materials', 'Clothing & Accessories', 'Keys & ID Cards', 'Bags & Personal Items', 'Other'].map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Search radius (metres)
                <input type="number" min={0} max={5000} value={editFields.radius_meters} onChange={(event) => setEditFields({ ...editFields, radius_meters: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Brand
                <input maxLength={100} value={editFields.brand} onChange={(event) => setEditFields({ ...editFields, brand: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Colour
                <input maxLength={100} value={editFields.colour} onChange={(event) => setEditFields({ ...editFields, colour: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Spot name
              <input required minLength={2} maxLength={255} value={editFields.location_name} onChange={(event) => setEditFields({ ...editFields, location_name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Location note
              <input maxLength={255} value={editFields.location_note} onChange={(event) => setEditFields({ ...editFields, location_note: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <button type="button" onClick={() => setEditingItem(null)} disabled={savingEdit} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={savingEdit} className="flex-1 rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">{savingEdit ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Post Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4">
          <div className="animate-fade-in max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
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
                <div className="map-fullscreen-container relative h-[min(55vh,360px)] min-h-[260px] w-full overflow-hidden rounded-xl border border-slate-200 sm:h-[300px]">
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