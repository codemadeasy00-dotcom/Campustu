import { searchAlertsApi } from './api.js'

export async function trackUserSearch(keyword, filters = {}) {
  const normalizedKeyword = keyword?.trim()
  if (!normalizedKeyword || normalizedKeyword.length < 2) return { tracked: false }

  return searchAlertsApi.track({
    keyword: normalizedKeyword.toLowerCase(),
    category_id: filters.category_id || undefined,
    branch_id: filters.branch_id || undefined,
  })
}
