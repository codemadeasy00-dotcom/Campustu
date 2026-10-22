import React, { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export default function LostFound() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'lost', 'found'
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [search, setSearch] = useState('');
  
  // Modal States
  const [showPostModal, setShowPostModal] = useState(false);
  const [claimModalItem, setClaimModalItem] = useState(null);
  const [claimAnswer, setClaimAnswer] = useState('');
  const [claimResult, setClaimResult] = useState(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);

  // New Listing Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Electronics & Gadgets',
    status: 'lost',
    location_name: '',
    latitude: 18.2831, // DBATU Default Coordinates
    longitude: 75.7196,
    security_question: '',
    security_answer: '',
    dropoff_location: 'Main Security Gate',
  });

  const mapRef = useRef(null);
  const postMapRef = useRef(null);
  const [googleMaps, setGoogleMaps] = useState(null);

  // Initialize Google Maps API
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("Google Maps API key is missing");
      return;
    }

    let active = true;
    try {
      setOptions({ key: apiKey, v: 'weekly' });
      importLibrary('maps')
        .then((maps) => {
          if (active) setGoogleMaps({ maps });
        })
        .catch((err) => {
          console.error("Google Maps failed to load:", err);
        });
    } catch (err) {
      console.error("Google Maps failed to load:", err);
    }

    return () => {
      active = false;
    };
  }, []);

  // Fetch Lost & Found Items
  const fetchItems = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://campustu-backend.onrender.com';
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (categoryFilter !== 'All') params.append('category', categoryFilter);
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
      console.error("Failed to load Lost & Found items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [statusFilter, categoryFilter, search]);

  // Render Map with Markers when items or googleMaps change
  useEffect(() => {
    if (!googleMaps || !mapRef.current || items.length === 0) return;

    const defaultCenter = { lat: 18.2831, lng: 75.7196 }; // DBATU Campus Center
    const map = new googleMaps.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 16,
      mapTypeId: 'roadmap',
      disableDefaultUI: false,
    });

    items.forEach((item) => {
      if (item.latitude && item.longitude) {
        const marker = new googleMaps.maps.Marker({
          position: { lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) },
          map,
          title: item.title,
          icon: item.status === 'lost' 
            ? 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' 
            : 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
        });

        const infoWindow = new googleMaps.maps.InfoWindow({
          content: `
            <div style="padding: 6px; max-width: 200px;">
              <span style="font-size:10px; font-weight:bold; text-transform:uppercase; color:${item.status === 'lost' ? '#dc2626' : '#16a34a'};">
                ${item.status}
              </span>
              <h4 style="font-weight:bold; margin:2px 0;">${item.title}</h4>
              <p style="font-size:12px; color:#4b5563; margin:0;">📍 ${item.location_name}</p>
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
      }
    });
  }, [googleMaps, items]);

  // Interactive Pin Picker for Posting Modal
  useEffect(() => {
    if (!showPostModal || !googleMaps || !postMapRef.current) return;

    const defaultCenter = { lat: formData.latitude, lng: formData.longitude };
    const map = new googleMaps.maps.Map(postMapRef.current, {
      center: defaultCenter,
      zoom: 16,
    });

    const marker = new googleMaps.maps.Marker({
      position: defaultCenter,
      map,
      draggable: true,
      title: 'Drag me to exact campus location',
    });

    marker.addListener('dragend', (e) => {
      const newLat = e.latLng.lat();
      const newLng = e.latLng.lng();
      setFormData(prev => ({ ...prev, latitude: newLat, longitude: newLng }));
    });
  }, [showPostModal, googleMaps]);

  // Handle Post Form Submit
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
      console.error("Error creating post:", err);
    }
  };

  // Handle Submit Claim (Option 3A & 3B Workflow)
  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimModalItem) return;
    setSubmittingClaim(true);
    setClaimResult(null);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://campustu-backend.onrender.com';
      const res = await fetch(`${apiUrl}/lost-found/${claimModalItem.id}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answer_attempt: claimAnswer }),
      });
      const data = await res.json();
      setClaimResult(data);
    } catch (err) {
      setClaimResult({ success: false, message: 'Failed to process claim.' });
    } finally {
      setSubmittingClaim(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-teal-800 to-slate-900 rounded-3xl p-8 mb-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="bg-teal-500/20 text-teal-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Campus Safety & Recovery
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold mt-2">Lost & Found Portal</h1>
          <p className="text-teal-100/80 text-sm md:text-base max-w-xl mt-1">
            Locate lost possessions on campus map pins and submit secure verification proofs to claim items safely.
          </p>
        </div>
        <button
          onClick={() => setShowPostModal(true)}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95"
        >
          + Report Lost / Found Item
        </button>
      </div>

      {/* Google Map Overview Container */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 px-2">Interactive Campus Pin Map</h3>
        <div ref={mapRef} className="w-full h-80 rounded-xl bg-slate-100" />
        {!googleMaps && (
          <p className="px-2 pt-2 text-sm text-slate-500">
            The map is loading or unavailable. You can still browse and search listings below.
          </p>
        )}
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input
          type="text"
          placeholder="Search items or campus spots (e.g., Blue ID Card, Library)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-96 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        {/* Status Toggle Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {['all', 'lost', 'found'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold capitalize transition-all ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Listings */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading lost & found pins...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-500 font-medium">No items matching your criteria.</p>
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
                  <span className="text-xs text-slate-400">📍 {item.location_name}</span>
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

      {/* Claim Modal (Option 3A + 3B Workflow) */}
      {claimModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Claim Item: {claimModalItem.title}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {claimModalItem.security_question 
                ? `Answer the finder's security question to verify ownership.`
                : `Submit a detailed description to verify ownership.`}
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
                    <p className="text-xs text-teal-700">
                      Collect at: <strong>{claimModalItem.dropoff_location || 'Main Security Gate'}</strong>
                    </p>
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
                    placeholder="Enter answer or proof details..."
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Campus Spot Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Central Library 2nd Floor Reading Room"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Drag Marker to Exact Location</label>
                <div ref={postMapRef} className="w-full h-48 rounded-xl bg-slate-100" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Proof Question (For Claim Verification)</label>
                <input
                  type="text"
                  placeholder="e.g., What sticker is on the back?"
                  value={formData.security_question}
                  onChange={(e) => setFormData({ ...formData, security_question: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Expected Answer</label>
                <input
                  type="text"
                  placeholder="e.g., Batman"
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
                  Publish Listing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}