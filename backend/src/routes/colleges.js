// backend/routes/colleges.js   (CommonJS; convert to import/export if your project uses ESM)
// Assumes ../db exports a pg Pool, e.g.  module.exports = new Pool({...});
// Mount in your app:  app.use('/api/colleges', require('./routes/colleges'));
// Needs Node 18+ (built-in fetch). Check Render's Node version in your service settings.

const express = require('express');
const pool = require('../db');
const router = express.Router();

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

// GET /api/colleges/nearby?lat=18.52&lng=73.85&limit=10
router.get('/nearby', async (req, res) => {
  const lat = num(req.query.lat);
  const lng = num(req.query.lng);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'invalid_coordinates' });
  }

  try {
    // Haversine distance in km, no PostGIS needed. Only approved colleges with coordinates.
    const { rows } = await pool.query(
      `SELECT id, name, city, state, email_domain,
              center_lat::float8 AS center_lat, center_lng::float8 AS center_lng,
              6371 * 2 * asin(sqrt(
                power(sin(radians(center_lat::float8 - $1::float8) / 2), 2) +
                cos(radians($1::float8)) * cos(radians(center_lat::float8)) *
                power(sin(radians(center_lng::float8 - $2::float8) / 2), 2)
              )) AS distance_km
         FROM colleges
        WHERE status = 'approved' AND center_lat IS NOT NULL AND center_lng IS NOT NULL
        ORDER BY distance_km
        LIMIT $3`,
      [lat, lng, limit]
    );
    res.json(rows.map((r) => ({ ...r, distance_km: Math.round(r.distance_km * 10) / 10 })));
  } catch (err) {
    console.error('nearby colleges failed', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/colleges/search?q=ratnagiri   (name or city, no location needed)
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT id, name, city, state, email_domain
         FROM colleges
        WHERE status = 'approved' AND (name ILIKE $1 OR city ILIKE $1)
        ORDER BY name
        LIMIT 20`,
      [`%${q.replace(/[%_]/g, '')}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('college search failed', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/colleges/geocode?q=Kolhapur  -> { lat, lng, label } using OpenStreetMap Nominatim.
// Nominatim is a free public service with a usage policy (identify your app, about 1 request/second,
// no heavy use). Read it before demo day: https://operations.osmfoundation.org/policies/nominatim/
// Add rate limiting (e.g. express-rate-limit) on this route before going public.
router.get('/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'query_too_short' });
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=' +
                encodeURIComponent(q);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Campustu/1.0 (student project; contact: YOUR_EMAIL_HERE)' },
    });
    if (!r.ok) return res.status(502).json({ error: 'geocoder_unavailable' });
    const data = await r.json();
    if (!data.length) return res.status(404).json({ error: 'place_not_found' });
    res.json({ lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name });
  } catch (err) {
    console.error('geocode failed', err.message);
    res.status(502).json({ error: 'geocoder_unavailable' });
  }
});

module.exports = router;