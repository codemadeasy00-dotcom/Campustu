// backend/src/routes/colleges.js   (CommonJS)  -- replaces the earlier colleges.js
// Mount:   app.use('/api/colleges', require('./routes/colleges'));
// Install: npm i express-rate-limit
// Also in app.js (Render sits behind a proxy, rate limits need it):  app.set('trust proxy', 1);
// Env (optional): NOMINATIM_USER_AGENT="Campustu/1.0 (your-email@example.com)"
// Needs Node 18+ (built-in fetch). Adjust the pool import path to match your project.
//
// Endpoints (only what the two-option picker needs):
//   GET  /api/colleges               all approved colleges, for the dropdown
//   GET  /api/colleges/place-search  map lookup, used by "I can't find my college"
//   POST /api/colleges/suggest       save a map result as a PENDING college for admin review

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db');

const router = express.Router();

// ---------- Nominatim helper: identified, throttled (>= 1.1 s apart), cached ----------
// Usage policy (check it yourself): https://operations.osmfoundation.org/policies/nominatim/
// It is for occasional lookups, NOT search-as-you-type. The frontend only searches on button press.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = process.env.NOMINATIM_USER_AGENT || 'Campustu/1.0 (student project; set NOMINATIM_USER_AGENT)';
const GAP_MS = 1100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttled(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {}).then(() => sleep(GAP_MS));
  return run;
}

async function nominatim(path, params) {
  const url = `${NOMINATIM}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`;
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await throttled(async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    if (!r.ok) throw new Error(`nominatim_${r.status}`);
    return r.json();
  });
  if (cache.size > 500) cache.clear();
  cache.set(url, { val, exp: Date.now() + CACHE_TTL_MS });
  return val;
}

// ---------- helpers ----------
const isCollege = (r) => r.category === 'amenity' && ['college', 'university'].includes(r.type);
const osmRef = (r) => `${String(r.osm_type)[0].toUpperCase()}${r.osm_id}`;   // way + 123 -> W123

function toCollege(r) {
  const a = r.address || {};
  return {
    osm_ref: osmRef(r),
    name: String(r.name || r.display_name.split(',')[0]).trim().slice(0, 200),
    city: a.city || a.town || a.village || a.suburb || a.county || null,
    state: a.state || null,
    latitude: Number(r.lat),
    longitude: Number(r.lon),
  };
}

const limiterOpts = { standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'rate_limited' } };
const placeSearchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, ...limiterOpts });
const suggestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, ...limiterOpts });
const MAX_PENDING = 100;   // stops the pending queue from being flooded

// ---------- GET /   (dropdown list: approved colleges only) ----------
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, city, state FROM colleges WHERE status = 'approved' ORDER BY name LIMIT 1000`
    );
    res.set('Cache-Control', 'public, max-age=300');
    res.json(rows);
  } catch (err) {
    console.error('list colleges failed', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- GET /place-search?q=   (map lookup for "I can't find my college") ----------
// Only results tagged amenity=college/university are returned. A real college that is tagged
// differently in OpenStreetMap will not appear here; that is a limit of the data.
router.get('/place-search', placeSearchLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'query_too_short' });
  try {
    const data = await nominatim('/search', { addressdetails: '1', limit: '10', countrycodes: 'in', q });
    res.json(data.filter(isCollege).slice(0, 5).map(toCollege));
  } catch (err) {
    console.error('place-search failed', err.message);
    res.status(502).json({ error: 'geocoder_unavailable' });
  }
});

// ---------- POST /suggest   body: { "osm_ref": "W123456" } ----------
// The client sends ONLY the OSM reference. The server fetches name/location itself from
// OpenStreetMap, so nobody can insert made-up names or coordinates. The row is saved as
// 'pending'; an admin approves it and fills in email_domain.
router.post('/suggest', suggestLimiter, async (req, res) => {
  const ref = String((req.body && req.body.osm_ref) || '').trim().toUpperCase();
  if (!/^[NWR]\d{1,15}$/.test(ref)) return res.status(400).json({ error: 'invalid_osm_ref' });

  const findExisting = async () =>
    (await pool.query(`SELECT id, name, city, state, status FROM colleges WHERE osm_id = $1`, [ref])).rows[0];

  try {
    const existing = await findExisting();
    if (existing) return res.json({ status: existing.status, college: existing });

    const pending = (await pool.query(`SELECT count(*)::int AS n FROM colleges WHERE status = 'pending'`)).rows[0].n;
    if (pending >= MAX_PENDING) return res.status(429).json({ error: 'queue_full' });

    const data = await nominatim('/lookup', { addressdetails: '1', osm_ids: ref });
    if (!data.length) return res.status(404).json({ error: 'place_not_found' });
    if (!isCollege(data[0])) return res.status(422).json({ error: 'not_a_college' });

    const c = toCollege(data[0]);
    const ins = await pool.query(
      `INSERT INTO colleges (name, city, state, latitude, longitude, osm_id, status, suggested_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())
       ON CONFLICT (osm_id) DO NOTHING
       RETURNING id, name, city, state, status`,
      [c.name, c.city, c.state, c.latitude, c.longitude, ref]
    );
    if (ins.rows.length) return res.status(201).json({ status: 'pending', college: ins.rows[0] });

    const raced = await findExisting();                 // someone else inserted it a moment ago
    res.json({ status: raced.status, college: raced });
  } catch (err) {
    console.error('suggest failed', err.message);
    res.status(502).json({ error: 'could_not_save' });
  }
});

module.exports = router;