// frontend/src/components/CollegePicker.jsx
// Usage:  <CollegePicker onSelect={(college) => console.log(college)} />
// Needs in frontend/.env:  VITE_API_URL=https://campustu-backend.onrender.com
// (use http://localhost:<port> if you run the backend locally)

import { useState } from 'react';

const API = import.meta.env.VITE_API_URL;

export default function CollegePicker({ onSelect }) {
  const [place, setPlace] = useState('');
  const [colleges, setColleges] = useState([]);
  const [heading, setHeading] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadNearby(lat, lng, label) {
    const r = await fetch(`${API}/api/colleges/nearby?lat=${lat}&lng=${lng}&limit=10`);
    if (!r.ok) throw new Error('Could not load colleges. Please try again.');
    setColleges(await r.json());
    setHeading(label);
  }

  function useMyLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Your browser cannot share location. Type your city instead.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Coordinates are sent only to look up colleges. They are not stored.
          await loadNearby(pos.coords.latitude, pos.coords.longitude, 'Colleges near you');
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        setError(
          err.code === 1
            ? 'Location permission denied. Type your city instead.'
            : 'Could not get your location. Type your city instead.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function searchPlace(e) {
    e.preventDefault();
    const q = place.trim();
    if (q.length < 3) return;
    setError('');
    setLoading(true);
    try {
      const g = await fetch(`${API}/api/colleges/geocode?q=${encodeURIComponent(q)}`);
      if (g.status === 404) throw new Error('Place not found. Try a nearby city name.');
      if (!g.ok) throw new Error('Place search is unavailable right now.');
      const { lat, lng } = await g.json();
      await loadNearby(lat, lng, `Colleges near ${q}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto p-4">
      <button
        onClick={useMyLocation}
        disabled={loading}
        className="w-full rounded-full bg-teal-500 px-6 py-3 font-medium text-white hover:bg-teal-600 disabled:opacity-60"
      >
        {loading ? 'Searching...' : 'Use my current location'}
      </button>

      <p className="my-3 text-center text-sm text-slate-500">or</p>

      <form onSubmit={searchPlace} className="flex gap-2">
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Type your city or area"
          className="flex-1 rounded-full border border-sky-200 bg-sky-50 px-5 py-3 outline-none focus:border-teal-400"
        />
        <button
          type="submit"
          disabled={loading || place.trim().length < 3}
          className="rounded-full bg-sky-500 px-5 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-60"
        >
          Search
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {colleges.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 font-semibold text-slate-700">{heading}</h3>
          <ul className="space-y-2">
            {colleges.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelect?.(c)}
                  className="flex w-full items-center justify-between rounded-2xl border border-sky-100 bg-white px-4 py-3 text-left shadow-sm hover:border-teal-300"
                >
                  <span>
                    <span className="block font-medium text-slate-800">{c.name}</span>
                    <span className="block text-sm text-slate-500">{c.city}, {c.state}</span>
                  </span>
                  <span className="ml-3 whitespace-nowrap rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
                    {c.distance_km} km
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
