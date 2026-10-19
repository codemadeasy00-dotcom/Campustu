import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function CollegePicker({ onSelect }) {
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCollege, setSelectedCollege] = useState(null);

  useEffect(() => {
    async function fetchColleges(lat, lng) {
      try {
        let url = `${API}/api/colleges`;
        if (lat && lng) {
          url = `${API}/api/colleges/nearby?lat=${lat}&lng=${lng}&limit=20`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load colleges.');
        const data = await res.json();
        setColleges(data);
      } catch (err) {
        setError('Could not load colleges. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchColleges(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Fallback to fetch all colleges if location is denied/unavailable
          fetchColleges(null, null);
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } else {
      fetchColleges(null, null);
    }
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto p-4">
      <label className="block mb-2 font-medium text-slate-700">Select your college *</label>
      
      {loading ? (
        <div className="w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-500 text-center">
          Detecting location & loading colleges...
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <select
          onChange={(e) => {
            const found = colleges.find((c) => String(c.id) === e.target.value);
            setSelectedCollege(found);
            onSelect?.(found);
          }}
          defaultValue=""
          className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 outline-none focus:border-teal-400 text-slate-800 shadow-sm"
        >
          <option value="" disabled>
            Select your college from the list
          </option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.city}, {c.state}){c.distance_km ? ` — ${Math.round(c.distance_km)} km away` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}