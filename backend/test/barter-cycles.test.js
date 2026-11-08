const test = require('node:test')
const assert = require('node:assert/strict')
const { findBarterCycles } = require('../src/utils/barter-cycles')

function listing(id, seller_id, category_id, wanted_category_ids) {
  return { id, seller_id, category_id, wanted_category_ids }
}

test('finds a three-person barter loop starting with the signed-in user', () => {
  const { cycles } = findBarterCycles([
    listing('a', 'user-a', 1, [2]),
    listing('b', 'user-b', 2, [3]),
    listing('c', 'user-c', 3, [1]),
  ], 'user-a')

  assert.equal(cycles.length, 1)
  assert.deepEqual(cycles[0].map(({ id }) => id), ['a', 'b', 'c'])
})

test('does not suggest a cycle when one participant wants their own listing category', () => {
  const { cycles } = findBarterCycles([
    listing('a', 'user-a', 1, [2]),
    listing('b', 'user-b', 2, [2]),
  ], 'user-a')

  assert.deepEqual(cycles, [])
})

test('only returns cycles that include the requesting user', () => {
  const { cycles } = findBarterCycles([
    listing('a', 'user-a', 1, []),
    listing('b', 'user-b', 2, [3]),
    listing('c', 'user-c', 3, [2]),
  ], 'user-a')

  assert.deepEqual(cycles, [])
})

test('does not close a cycle with a different listing from the starting member', () => {
  const { cycles } = findBarterCycles([
    listing('a-start', 'user-a', 1, [2]),
    listing('a-other', 'user-a', 4, []),
    listing('b', 'user-b', 2, [4]),
  ], 'user-a')

  assert.deepEqual(cycles, [])
})

test('reports when barter-cycle exploration reaches its configured bound', () => {
  const result = findBarterCycles([
    listing('a', 'user-a', 1, [2]),
    listing('b', 'user-b', 2, [1]),
  ], 'user-a', { maxExplorations: 0 })

  assert.equal(result.limited, true)
  assert.deepEqual(result.cycles, [])
})
