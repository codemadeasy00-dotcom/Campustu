export const CONDITIONS = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

export const conditionLabel = (v) => CONDITIONS.find((c) => c.value === v)?.label ?? v

export const formatPrice = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

export const STATUS_STYLES = {
  available: 'bg-emerald-100 text-emerald-800',
  reserved: 'bg-amber-100 text-amber-800',
  sold: 'bg-slate-200 text-slate-700',
  withdrawn: 'bg-slate-200 text-slate-700',
  removed: 'bg-red-100 text-red-800',
}
