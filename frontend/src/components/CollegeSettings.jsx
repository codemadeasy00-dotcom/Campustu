// frontend/src/components/CollegeSettings.jsx
// Put it on the profile/settings page:  <CollegeSettings />
// Uses CollegePicker.jsx (previous step) and lib/api.js.

import { useEffect, useState } from 'react';
import CollegePicker from './CollegePicker';
import { apiFetch } from '../lib/api';
import { ConfirmDialog, useToast } from './ui.jsx';

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function messageFor(err) {
  const d = err.data || {};
  switch (d.error) {
    case 'cooldown_active':
      return `You can change your college again on ${fmtDate(d.next_change_at)}.`;
    case 'active_activity': {
      const b = d.blockers || {};
      const parts = [];
      if (b.listings) parts.push(`${b.listings} active listing(s)`);
      if (b.reservations) parts.push(`${b.reservations} active reservation(s)`);
      if (b.handovers) parts.push(`${b.handovers} pending handover(s)`);
      if (b.lost_found_posts) parts.push(`${b.lost_found_posts} open lost/found post(s)`);
      return `Finish or remove these first: ${parts.join(', ')}.`;
    }
    case 'already_in_this_college':
      return 'You are already in this college.';
    case 'college_not_found':
      return 'That college is not available.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function CollegeSettings() {
  const showToast = useToast();
  const [state, setState] = useState(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingCollege, setPendingCollege] = useState(null);

  useEffect(() => {
    apiFetch('/api/me/college').then(setState).catch(() => setError('Could not load your college.'));
  }, []);

  async function choose(college) {
    setBusy(true);
    setError('');
    try {
      setState(await apiFetch('/api/me/college', {
        method: 'PUT',
        body: JSON.stringify({ college_id: college.id }),
      }));
      setChanging(false);
      showToast('College updated successfully.');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
    return (
      <div aria-label="Loading college settings" className="mx-auto w-full max-w-xl animate-pulse rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="mt-4 h-16 rounded-2xl bg-slate-100" />
        <div className="mt-4 h-10 w-36 rounded-full bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Your college</h2>

      <div className="mt-3 rounded-2xl bg-sky-50 p-4">
        <p className="font-medium text-slate-800">{state.college?.name ?? 'Not set'}</p>
        {state.college && (
          <p className="text-sm text-slate-500">{state.college.city}, {state.college.state}</p>
        )}
        {!state.verified_by_email && state.college && (
          <p className="mt-1 text-xs text-amber-700">Selected manually, not verified by your email.</p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!changing && (
        <>
          <button
            onClick={() => { setError(''); setChanging(true); }}
            disabled={!state.can_change_now || busy}
            className="mt-4 rounded-full bg-teal-500 px-6 py-2.5 font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change college
          </button>
          <p className="mt-2 text-sm text-slate-500">
            {state.can_change_now
              ? `You can change your college once every ${state.cooldown_days} days.`
              : `Next change available on ${fmtDate(state.next_change_at)}.`}
          </p>
        </>
      )}

      {changing && (
        <div className="mt-4">
          <CollegePicker onSelect={setPendingCollege} />
          <button
            onClick={() => setChanging(false)}
            className="mt-2 rounded-full border border-slate-300 px-5 py-2 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingCollege)}
        title="Change your college?"
        confirmLabel={busy ? 'Updating…' : 'Change college'}
        onCancel={() => setPendingCollege(null)}
        onConfirm={() => {
          const college = pendingCollege;
          setPendingCollege(null);
          if (college) choose(college);
        }}
      >
        Switch to {pendingCollege?.name}? You will not be able to change again for {state.cooldown_days} days.
      </ConfirmDialog>
    </div>
  );
}
