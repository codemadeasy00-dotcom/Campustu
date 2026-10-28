import { useEffect, useState } from 'react'

export default function ItemPhoto({ src, alt = '', className = '', loading = 'lazy' }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt ? `${alt} photo unavailable` : 'Item photo unavailable'}
        className={`flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 text-brand-400 ${className}`}
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12">
          <rect x="7" y="9" width="34" height="30" rx="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="m10 34 10-10 6 6 4-4 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
