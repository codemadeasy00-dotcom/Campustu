import { useEffect, useState } from 'react'
import { achievementsApi, errorMessage } from '../services/api.js'
import { Alert, PageLoading } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'

const STAT_LABELS = [
  ['items_posted', 'Marketplace items posted'],
  ['completed_trades', 'Completed marketplace handovers'],
  ['resolved_reports', 'Resolved Lost & Found reports'],
]

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

  return (
    <div className="page-enter mx-auto max-w-5xl space-y-6">
      <PageHero
        eyebrow="Your campus journey"
        title="Achievements"
        description="Milestones are calculated from completed handovers, published listings, and resolved Lost & Found reports."
      />

      <section aria-label="Your activity totals" className="grid gap-3 sm:grid-cols-3">
        {STAT_LABELS.map(([key, label]) => (
          <article key={key} className="surface-panel p-4">
            <p className="text-2xl font-bold text-brand-800">{data.stats[key]}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-brand-900">Achievement badges</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((achievement) => {
            const progress = Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
            return (
              <article
                key={achievement.id}
                className={`surface-panel border p-4 ${achievement.unlocked ? 'border-teal-800 shadow-[4px_4px_0px_0px_#0f766e]' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-teal-950">{achievement.name}</h3>
                    <p className="mt-1 text-xs text-slate-600">{achievement.description}</p>
                  </div>
                  <span aria-hidden="true" className="text-xl">{achievement.unlocked ? '🏆' : '🔒'}</span>
                </div>
                <div className="mt-4 flex justify-between text-[11px] font-semibold text-slate-600">
                  <span>{achievement.unlocked ? 'Unlocked' : 'Progress'}</span>
                  <span>{achievement.progress} / {achievement.target}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${achievement.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={achievement.target}
                  aria-valuenow={achievement.progress}
                  className="mt-1 h-3 overflow-hidden border border-teal-800 bg-teal-50"
                >
                  <div className="h-full bg-teal-800 transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                {achievement.unlocked && achievement.unlocked_at && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    Earned {new Date(achievement.unlocked_at).toLocaleDateString()}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>
      <p className="text-xs text-slate-500">XP and barter-loop completion are not shown because the site does not currently record those as completed events.</p>
    </div>
  )
}
