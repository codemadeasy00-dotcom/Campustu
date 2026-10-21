// frontend/src/components/CollegePicker.jsx   (replaces the earlier version)
// Usage:  <CollegePicker onSelect={(college) => setCollegeId(college.id)} />
// Needs in frontend/.env:  VITE_API_URL=https://campustu-backend.onrender.com   (restart `npm run dev` after editing)
//
// Exactly options:
//   1. A dropdown of our approved colleges with a search box inside it.
//   2. "I can't find my college": search the map OR enter details manually for admin review (saved as pending).
//
// Safe inside a sign-up <form>: no nested forms, every button is type="button", Enter never submits.

import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './ui.jsx';

const API = import.meta.env.VITE_API_URL;

async function getJson(path, options) {
  const res = await fetch(`${API}${path}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null; // not JSON (for example an HTML page from a wrong URL)
  }
  if (!res.ok || data === null) {
    const err = new Error((data && data.error) || 'bad_response');
    err.status = res.status;
    err.data = data || {};
    throw err;
  }
  return data;
}

const onEnter = (action) => (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    action();
  }
};

function Picker({ onSelect, placeholder = 'Select your college' }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'suggest'
  const [selected, setSelected] = useState(null);

  // ---- option 1: dropdown list ----
  const [colleges, setColleges] = useState([]);
  const [listState, setListState] = useState('loading'); // loading | ready | error
  const [query, setQuery] = useState('');

  // ---- option 2: can't find my college (map search) ----
  const [mapQuery, setMapQuery] = useState('');
  const [mapResults, setMapResults] = useState(null); // null = not searched yet
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState(null);

  // ---- option 2b: manual entry fallback ----
  const [manualName, setManualName] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualState, setManualState] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState('');

  function loadColleges() {
    if (!API) {
      console.error('CollegePicker: VITE_API_URL is not set');
      setListState('error');
      return;
    }
    setListState('loading');
    getJson('/api/colleges')
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows && Array.isArray(rows.colleges) ? rows.colleges : null;
        if (!list) throw new Error('unexpected response shape');
        setColleges(list.filter((c) => c && c.id != null && c.name));
        setListState('ready');
      })
      .catch((err) => {
        console.error(`CollegePicker: could not load colleges from ${API}/api/colleges`, err);
        setListState('error');
      });
  }
  useEffect(loadColleges, []);

  // close when clicking outside
  useEffect(() => {
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return colleges;
    return colleges.filter((c) => {
      const hay = `${c.name} ${c.city || ''} ${c.state || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [colleges, query]);

  function choose(c) {
    setSelected(c);
    setOpen(false);
    setQuery('');
    onSelect?.(c);
  }

  function toggle() {
    setOpen((o) => !o);
    setView('list');
    setMessage('');
    setManualMsg('');
  }

  async function searchMap() {
    const q = mapQuery.trim();
    if (q.length < 3) return;
    setMessage('');
    setBusy(true);
    try {
      setMapResults(await getJson(`/api/colleges/place-search?q=${encodeURIComponent(q)}`));
    } catch (err) {
      console.error('CollegePicker: map search failed', err.status, err.data || err);
      setMapResults(null);
      setMessage(
        err.status === 429 ? 'Too many searches. Please wait a minute.'
        : err.status === 502 ? 'The map service is not responding right now. Try again in a minute.'
        : err.status ? 'Map search is unavailable right now. Try again later.'
        : 'Could not reach the server. Check your internet connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function suggest(c) {
    setBusy(true);
    setMessage('');
    try {
      const r = await getJson('/api/colleges/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osm_ref: c.osm_ref }),
      });
      if (r.status === 'approved') {
        setMessage('This college is already available. Go back to the list and select it.');
        loadColleges();
      } else if (r.status === 'rejected') {
        setMessage('This college was reviewed and is not available.');
      } else {
        setMessage('Thanks! We will review it and add it soon. Please check back in a day or two.');
      }
    } catch (err) {
      console.error('CollegePicker: suggest failed', err.status, err.data || err);
      setMessage(
        err.data?.error === 'not_a_college' ? 'That place is not listed as a college on the map.'
        : err.status === 429 ? 'Too many requests right now. Please try again later.'
        : 'Could not send the suggestion. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    const name = manualName.trim();
    const city = manualCity.trim();
    if (!name || !city) return;
    setManualBusy(true);
    setManualMsg('');
    try {
      await getJson('/api/colleges/suggest-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          city,
          state: manualState.trim() || undefined,
        }),
      });
      setManualMsg('Thanks! Your college has been submitted for review. Please check back in a day or two.');
      setManualName('');
      setManualCity('');
      setManualState('');
    } catch (err) {
      console.error('CollegePicker: manual suggest failed', err);
      setManualMsg('Could not submit college. Please try again.');
    } finally {
      setManualBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-full border border-sky-200 bg-sky-50 px-5 py-3 outline-none focus:border-teal-400';

  return (
    <div
      ref={rootRef}
      className="relative w-full max-w-xl"
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-left hover:border-teal-300"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-500'}>
          {selected ? selected.name : placeholder}
        </span>
        <span aria-hidden="true" className="ml-3 text-slate-500">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-sky-100 bg-white p-3 shadow-lg">
          {view === 'list' && (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onEnter(() => { if (filtered.length === 1) choose(filtered[0]); })}
                placeholder="Search your college or city"
                className={inputCls}
              />

              <div className="mt-2 max-h-64 overflow-y-auto" role="listbox">
                {listState === 'loading' && (
                  <div aria-label="Loading colleges" className="space-y-2 px-3 py-2">
                    {[1, 2, 3].map((row) => (
                      <div key={row} aria-hidden="true" className="animate-pulse space-y-1.5 py-1">
                        <div className="h-4 w-2/3 rounded bg-slate-200" />
                        <div className="h-3 w-1/3 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                )}
                {listState === 'error' && (
                  <p className="px-3 py-2 text-sm text-red-600">
                    {API ? 'Could not load colleges.' : 'VITE_API_URL is not set (see frontend/.env).'}{' '}
                    <button type="button" onClick={loadColleges} className="underline">Try again</button>
                  </p>
                )}
                {listState === 'ready' && filtered.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-500">No college matches your search.</p>
                )}
                {listState === 'ready' && filtered.map((c) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === c.id}
                    key={c.id}
                    onClick={() => choose(c)}
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-sky-50"
                  >
                    <span className="block font-medium text-slate-800">{c.name}</span>
                    <span className="block text-sm text-slate-500">
                      {[c.city, c.state].filter(Boolean).join(', ')}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-2 border-t border-sky-100 pt-2">
                <button
                  type="button"
                  onClick={() => { setView('suggest'); setMessage(''); setManualMsg(''); }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-sky-600 hover:bg-sky-50"
                >
                  I can't find my college
                </button>
              </div>
            </>
          )}

          {view === 'suggest' && (
            <div className="max-h-80 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => { setView('list'); setMessage(''); setManualMsg(''); }}
                className="mb-2 text-sm text-sky-600 hover:underline"
              >
                &larr; Back to the list
              </button>

              {/* Map search section */}
              <p className="mb-2 text-sm text-slate-500">
                Search the map for your college. We review every new college before students can join it.
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  onKeyDown={onEnter(searchMap)}
                  placeholder="College name and city"
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={searchMap}
                  disabled={busy || mapQuery.trim().length < 3}
                  className="rounded-full bg-sky-500 px-5 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  Search map
                </button>
              </div>

              {mapResults && mapResults.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  No college found on the map for that search. Try manual entry below.
                </p>
              )}

              {mapResults && mapResults.length > 0 && (
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {mapResults.map((c) => (
                    <button
                      type="button"
                      key={c.osm_ref}
                      onClick={() => setPendingSuggestion(c)}
                      disabled={busy}
                      className="block w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-left hover:border-teal-300 disabled:opacity-60"
                    >
                      <span className="block font-medium text-slate-800">{c.name}</span>
                      <span className="block text-sm text-slate-500">
                        {[c.city, c.state].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}

              {/* Manual Entry Fallback Section */}
              <div className="mt-6 border-t border-sky-100 pt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Can't find it on the map? Enter manually:</p>
                <div className="space-y-3">
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="College Name (e.g. KIT College)"
                    className={inputCls}
                  />
                  <div className="flex gap-2">
                    <input
                      value={manualCity}
                      onChange={(e) => setManualCity(e.target.value)}
                      placeholder="City"
                      className={`${inputCls} flex-1`}
                    />
                    <input
                      value={manualState}
                      onChange={(e) => setManualState(e.target.value)}
                      placeholder="State"
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitManual}
                    disabled={manualBusy || !manualName.trim() || !manualCity.trim()}
                    className="w-full rounded-full bg-teal-500 px-5 py-3 font-medium text-white hover:bg-teal-600 disabled:opacity-60"
                  >
                    {manualBusy ? 'Submitting...' : 'Submit manual entry'}
                  </button>
                  {manualMsg && <p className="text-sm text-slate-700 text-center">{manualMsg}</p>}
                </div>
              </div>
            </div>
          )}
          <ConfirmDialog
            open={Boolean(pendingSuggestion)}
            title="Submit this college for review?"
            confirmLabel={busy ? 'Submitting…' : 'Submit'}
            onCancel={() => setPendingSuggestion(null)}
            onConfirm={() => {
              const college = pendingSuggestion;
              setPendingSuggestion(null);
              if (college) suggest(college);
            }}
          >
            Send “{pendingSuggestion?.name}” for review? You can register once it is approved.
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}

// Error Boundary
class PickerBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('CollegePicker crashed:', error);
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          The college selector failed to load. Please refresh the page.
        </p>
      );
    }
    return this.props.children;
  }
}

export default function CollegePicker(props) {
  return (
    <PickerBoundary>
      <Picker {...props} />
    </PickerBoundary>
  );
}