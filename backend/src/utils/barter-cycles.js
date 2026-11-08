function findBarterCycles(items, userId, {
  maxLength = 5,
  maxResults = 20,
  maxExplorations = 50_000,
} = {}) {
  const offersByCategory = new Map()
  for (const item of items) {
    if (!offersByCategory.has(item.category_id)) offersByCategory.set(item.category_id, [])
    offersByCategory.get(item.category_id).push(item)
  }

  const ownOffers = items.filter((item) => item.seller_id === userId && item.wanted_category_ids.length)
  const cycles = new Map()
  let explorations = 0
  let limited = false

  function search(currentItem, pathItems, visitedUsers) {
    if (pathItems.length > maxLength || cycles.size >= maxResults || limited) return

    for (const wantedCategoryId of currentItem.wanted_category_ids) {
      for (const nextItem of offersByCategory.get(wantedCategoryId) || []) {
        explorations += 1
        if (explorations > maxExplorations) {
          limited = true
          return
        }
        if (nextItem.seller_id === currentItem.seller_id) continue
        if (nextItem.seller_id === userId && nextItem.id === pathItems[0].id && pathItems.length >= 2) {
          const cycleItems = [...pathItems, nextItem]
          const key = cycleItems.slice(0, -1).map(({ id }) => id).sort().join(':')
          if (!cycles.has(key)) cycles.set(key, cycleItems.slice(0, -1))
          if (cycles.size >= maxResults) return
          continue
        }
        if (visitedUsers.has(nextItem.seller_id)) continue
        const nextVisited = new Set(visitedUsers)
        nextVisited.add(nextItem.seller_id)
        search(nextItem, [...pathItems, nextItem], nextVisited)
        if (cycles.size >= maxResults) return
      }
    }
  }

  for (const item of ownOffers) {
    search(item, [item], new Set([userId]))
    if (cycles.size >= maxResults || limited) break
  }
  return { cycles: [...cycles.values()], limited: limited || cycles.size >= maxResults }
}

module.exports = { findBarterCycles }
