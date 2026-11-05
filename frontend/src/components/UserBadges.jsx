const BADGE_STYLES = {
  college_verified: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  admin: 'border-brand-800 bg-brand-900 text-white',
  power_trader: 'border-amber-500 bg-amber-100 text-amber-950',
  trusted_member: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  lost_found_hero: 'border-amber-300 bg-amber-50 text-amber-900',
  suspended: 'border-red-300 bg-red-100 text-red-900',
  banned: 'border-red-500 bg-red-700 text-white',
}

export default function UserBadges({ badges = [], className = '' }) {
  if (!badges.length) return null

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4 ${BADGE_STYLES[badge.id] || 'border-slate-200 bg-slate-100 text-slate-700'}`}
        >
          {badge.id === 'college_verified' && (
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M8 1.25 9.7 2.3l2-.1.8 1.85 1.65 1.15-.55 1.92.55 1.92-1.65 1.15-.8 1.85-2-.1L8 13.95l-1.7-1.05-2 .1-.8-1.85-1.65-1.15.55-1.92-.55-1.92L3.5 5.01l.8-1.85 2 .1L8 1.25Zm3.02 4.66a.75.75 0 0 0-1.04.12L7.4 9.3 6.05 8.16a.75.75 0 1 0-.96 1.15l1.95 1.63a.75.75 0 0 0 1.06-.12l3.04-3.87a.75.75 0 0 0-.12-1.04Z" clipRule="evenodd" />
            </svg>
          )}
          {badge.label}
        </span>
      ))}
    </span>
  )
}
