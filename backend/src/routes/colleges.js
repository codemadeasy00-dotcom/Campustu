const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/colleges - list all approved colleges or search by query parameter ?q=
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let query = "SELECT id, name, city, state, latitude, longitude FROM colleges WHERE status = 'approved'";
    let params = [];
    if (q) {
      query += " AND (name ILIKE \$1 OR city ILIKE \$1 OR state ILIKE \$1)";
      params.push(`%${q}%`);
    }
    query += " ORDER BY name ASC";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching colleges:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/colleges/search - search colleges by keyword
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const { rows } = await pool.query(
      "SELECT id, name, city, state, latitude, longitude FROM colleges WHERE status = 'approved' AND (name ILIKE \$1 OR city ILIKE \$1)",
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error searching colleges:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/colleges/nearby - find colleges sorted by distance using Haversine formula
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, limit = 10 } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const query = `
      SELECT id, name, city, state, latitude, longitude,
      (
        6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )
      ) AS distance_km
      FROM colleges
      WHERE status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT $3
    `;
    const { rows } = await pool.query(query, [parseFloat(lat), parseFloat(lng), parseInt(limit)]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching nearby colleges:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/colleges/geocode - reverse/forward geocode via Nominatim
router.get('/geocode', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });
    
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'CampustuApp/1.0' }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Geocode error:', err);
    res.status(500).json({ error: 'geocode_failed' });
  }
});

module.exports = router;