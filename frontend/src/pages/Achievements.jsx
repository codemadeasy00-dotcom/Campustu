import { useEffect, useState } from 'react'
import { achievementsApi, errorMessage } from '../services/api.js'
import { Alert, PageLoading } from '../components/ui.jsx'

const STAT_LABELS = [
  { key: 'items_posted', label: 'Items posted', icon: '📦' },
  { key: 'completed_trades', label: 'Trades completed', icon: '🤝' },
  { key: 'resolved_reports', label: 'Reports resolved', icon: '🛡️' },
  { key: 'successful_returns', label: 'Verified returns', icon: '✅' },
  { key: 'needs_posted', label: 'Needs posted', icon: '📌' },
  { key: 'need_responses', label: 'Need responses', icon: '💬' },
]

function AchievementEmblem({ achievement }) {
  const icons = {
    first_listing: '📦',
    campus_provider: '🎒',
    first_trade: '🤝',
    trusted_trader: '💎',
    lost_and_found_helper: '🛡️',
    verified_return: '✅',
    campus_requester: '📌',
    community_responder: '💬',
  }

  return (
    <div className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 text-3xl shadow-inner ${
      achievement.unlocked
        ? 'border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-200 shadow-amber-200/70'
        : 'border-slate-500 bg-slate-800 grayscale'
    }`}>
      <span aria-hidden="true">{achievement.unlocked ? icons[achievement.id] || '🏆' : '🔒'}</span>
      {achievement.unlocked && (
        <span aria-hidden="true" className="absolute -right-2 -top-2 text-sm">✨</span>
      )}
    </div>
  )
}

export default function Achievements() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    achievementsApi.get()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!data) return <PageLoading message="Loading your activity…" />

  const unlockedCount = data.achievements.filter((achievement) => achievement.unlocked).length
  const completion = data.achievements.length
    ? Math.round((unlockedCount / data.achievements.length) * 100)
    : 0
  const nextAchievement = data.achievements.find((achievement) => !achievement.unlocked)
  const nextProgress = nextAchievement
    ? Math.min(100, Math.round((nextAchievement.progress / nextAchievement.target) * 100))
    : 100

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-6">
      <section className="relative isolate overflow-hidden rounded-3xl border-4 border-slate-950 bg-gradient-to-br from-slate-950 via-teal-950 to-indigo-950 p-5 text-white shadow-[0_8px_0_#0f172a] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[24px] border-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-teal-400/10 blur-2xl" />
        <div className="relative grid gap-7 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal-300">Campustu · Player achievements</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Your campus quest</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Every badge is earned through recorded activity: listings, verified handovers, returns, and campus requests.
            </p>
            <div className="mt-6 max-w-lg rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Milestone collection</p>
                  <p className="mt-1 text-lg font-extrabold">{unlockedCount} <span className="text-slate-400">/ {data.achievements.length} unlocked</span></p>
                </div>
                <span className="rounded-xl border border-teal-300/30 bg-teal-300/10 px-3 py-2 font-mono text-xl font-black text-teal-200">{completion}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Achievement collection progress"
                aria-valuemin={0}
                aria-valuemax={data.achievements.length}
                aria-valuenow={unlockedCount}
                className="mt-3 h-3 overflow-hidden rounded-full border border-white/20 bg-slate-950/70 p-0.5"
              >
                <div className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-300 transition-[width]" style={{ width: `${completion}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 md:flex-col md:gap-2">
            <div className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] border-2 border-amber-300/80 bg-gradient-to-br from-amber-200 via-yellow-500 to-orange-600 text-5xl shadow-[0_6px_0_#713f12]">
              🏆
            </div>
            <div className="md:text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Quest log</p>
              <p className="text-sm font-extrabold">{data.achievements.length} milestones</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Your activity totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_LABELS.map(({ key, label, icon }) => (
          <article key={key} className="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-[0_4px_0_#cbd5e1]">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-2xl">{icon}</span>
              <div>
                <p className="text-2xl font-black tabular-nums text-slate-900">{data.stats[key]}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {nextAchievement && (
        <section aria-label="Next achievement" className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-4 shadow-[0_4px_0_#c7d2fe] sm:flex sm:items-center sm:gap-4">
          <span aria-hidden="true" className="text-3xl">🧭</span>
          <div className="mt-2 flex-1 sm:mt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">Next objective</p>
              <p className="text-xs font-bold text-indigo-800">{nextAchievement.name} · {nextAchievement.progress}/{nextAchievement.target}</p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-indigo-100">
              <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${nextProgress}%` }} />
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-brand-700">Collect them all</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Achievement board</h2>
          </div>
          <p className="text-xs font-semibold text-slate-500">{data.achievements.length - unlockedCount} still to unlock</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((achievement) => {
            const progress = Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
            return (
              <article
                key={achievement.id}
                className={`relative overflow-hidden rounded-2xl border-2 p-4 transition-transform hover:-translate-y-1 ${
                  achievement.unlocked
                    ? 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-yellow-50 shadow-[0_5px_0_#d6a53b]'
                    : 'border-slate-300 bg-slate-100 shadow-[0_5px_0_#94a3b8]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <AchievementEmblem achievement={achievement} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`font-mono text-[9px] font-black uppercase tracking-[0.16em] ${achievement.unlocked ? 'text-amber-700' : 'text-slate-500'}`}>
                        {achievement.unlocked ? 'Badge unlocked' : 'Locked badge'}
                      </p>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                        achievement.unlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {achievement.unlocked ? 'Complete' : 'In progress'}
                      </span>
                    </div>
                    <h3 className={`mt-1 text-base font-black ${achievement.unlocked ? 'text-slate-900' : 'text-slate-600'}`}>{achievement.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{achievement.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-between font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <span>{achievement.unlocked ? 'Milestone complete' : 'Progress'}</span>
                  <span>{achievement.progress} / {achievement.target}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${achievement.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={achievement.target}
                  aria-valuenow={achievement.progress}
                  className="mt-2 h-2.5 overflow-hidden rounded-full border border-slate-300 bg-white"
                >
                  <div className={`h-full rounded-full transition-[width] ${achievement.unlocked ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : 'bg-gradient-to-r from-teal-500 to-cyan-500'}`} style={{ width: `${progress}%` }} />
                </div>
                {achievement.unlocked && achievement.unlocked_at && (
                  <p className="mt-3 border-t border-amber-200 pt-2 text-[10px] font-semibold text-amber-800">
                    Earned {new Date(achievement.unlocked_at).toLocaleDateString()}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        Your collection is based on activity recorded by Campustu. XP and barter-loop completion are not included because they are not currently tracked as completed events.
      </p>
    </div>
  )
}
