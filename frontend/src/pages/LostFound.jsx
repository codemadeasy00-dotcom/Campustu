import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';

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

// 1. Search Box Component inside Leaflet
function SearchField() {
  const map = useMap();

  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({
      provider: provider,
      style: 'bar',
      showMarker: false,
      showPopup: false,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: true,
      searchLabel: 'Search campus buildings or places...',
    });

    map.addControl(searchControl);
    return () => map.removeControl(searchControl);
  }, [map]);

  return null;
}

// 2. Click to Pinpoint Location & Center
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

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
    />
  );
}

// 3. Auto-Locate User Button Component
function LocateUserButton({ onLocationFound }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    setLocating(true);
    map.locate({ setView: true, maxZoom: 17 });
  };

  useMapEvents({
    locationfound(e) {
      setLocating(false);
      if (onLocationFound) onLocationFound([e.latlng.lat, e.latlng.lng]);
    },
    locationerror(e) {
      setLocating(false);
      alert("Could not retrieve location. Please check browser permissions.");
    }
  });

  return (
    <button
      type="button"
      onClick={handleLocate}
      className="absolute bottom-4 right-4 z-[1000] bg-white text-slate-800 font-bold px-3 py-2 rounded-xl shadow-md border border-slate-200 text-xs flex items-center gap-1.5 hover:bg-slate-50 transition-all"
    >
      🎯 {locating ? 'Detecting Location...' : 'Locate Me'}
    </button>
  );
}

export default function LostFound() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [claimModalItem, setClaimModalItem] = useState(null);
  const [claimAnswer, setClaimAnswer] = useState('');
  const [claimResult, setClaimResult] = useState(null);

  // Default Campus Coordinates (DBATU Lonere)
  const defaultCenter = [18.1678, 73.3364];
  const [modalPin, setModalPin] = useState(defaultCenter);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Electronics & Gadgets',
    status: 'lost',
    location_name: '',
    latitude: defaultCenter[0],
    longitude: defaultCenter[1],
    security_question: '',
    security_answer: '',
    dropoff_location: 'Main Security Gate',
  });

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      latitude: modalPin[0],
      longitude: modalPin[1]
    }));
  }, [modalPin]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://campustu-backend.onrender.com';
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`${apiUrl}/lost-found?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [statusFilter, search]);

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://campustu-backend.onrender.com';
      const res = await fetch(`${apiUrl}/lost-found`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setShowPostModal(false);
        fetchItems();
      }
    } catch (err) {
      console.error("Post error:", err);
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
          onClick={() => setShowPostModal(true)}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95"
        >
          + Report Lost / Found Item
        </button>
      </div>

      {/* Main Interactive Map */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mb-8 z-0 relative">
        <div className="flex justify-between items-center mb-2 px-2">
          <h3 className="text-xs font-bold uppercase text-slate-500">Interactive Campus Pin Map</h3>
          <span className="text-[11px] text-slate-400">Search location or click "Locate Me"</span>
        </div>
        
        <div className="relative w-full h-96 rounded-xl overflow-hidden z-0">
          <MapContainer center={defaultCenter} zoom={16} scrollWheelZoom={true} className="w-full h-full z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <SearchField />
            <LocateUserButton />
            
            {items.map((item) => (
              item.latitude && item.longitude ? (
                <Marker
                  key={item.id}
                  position={[parseFloat(item.latitude), parseFloat(item.longitude)]}
                  icon={item.status === 'lost' ? redIcon : greenIcon}
                >
                  <Popup>
                    <div className="p-1 max-w-[180px]">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${item.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {item.status}
                      </span>
                      <h4 className="font-bold text-sm mt-1 mb-0.5">{item.title}</h4>
                      <p className="text-xs text-slate-600 m-0">📍 {item.location_name}</p>
                    </div>
                  </Popup>
                </Marker>
              ) : null
            ))}
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

      {/* Post Modal with Click/Drag Pin Selection */}
      {showPostModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Report Lost / Found Item</h3>
            <form onSubmit={handlePostSubmit} className="space-y-4">
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Blue Casio Scientific Calculator"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Spot Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Central Library 2nd Floor"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Click Anywhere on Map to Pinpoint Location
                </label>
                <div className="relative w-full h-56 rounded-xl overflow-hidden border border-slate-200">
                  <MapContainer center={modalPin} zoom={16} scrollWheelZoom={false} className="w-full h-full">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <SearchField />
                    <LocateUserButton onLocationFound={(coords) => setModalPin(coords)} />
                    <LocationPinPicker position={modalPin} setPosition={setModalPin} />
                  </MapContainer>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Selected Pin: Lat {modalPin[0].toFixed(5)}, Lon {modalPin[1].toFixed(5)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Question</label>
                <input
                  type="text"
                  placeholder="e.g., What sticker is on the laptop?"
                  value={formData.security_question}
                  onChange={(e) => setFormData({ ...formData, security_question: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Security Answer</label>
                <input
                  type="text"
                  placeholder="Expected verification answer"
                  value={formData.security_answer}
                  onChange={(e) => setFormData({ ...formData, security_answer: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-xl"
                >
                  Publish Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}