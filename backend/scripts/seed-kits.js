// Loads semester kits from db/kits-data.json into the database.
//
//   cd backend
//   node scripts/seed-kits.js            (or: node scripts/seed-kits.js path/to/other-file.json)
//
// The file format is described in db/kits-data.json. Safe to run again: a kit that already exists
// (same branch + semester) gets its name and item list replaced by what is in the file; kits that are
// not in the file are left alone. Everything is checked first, and nothing is written if anything is wrong.

const fs = require('fs')
const path = require('path')
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }) } catch (_) { /* dotenv not needed if your db module loads .env */ }
const { query, tx } = require('../src/db')

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'db', 'kits-data.json')

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  if (!Array.isArray(data.kits) || data.kits.length === 0) {
    console.log(`No kits in ${FILE}. Nothing to do.`)
    return
  }

  const branches = (await query('SELECT id, code FROM branches ORDER BY code')).rows
  const types = (await query('SELECT id, name FROM item_types ORDER BY id')).rows
  const branchByCode = new Map(branches.map((b) => [b.code.trim().toLowerCase(), b.id]))
  const typeByName = new Map(types.map((t) => [t.name.trim().toLowerCase(), t.id]))

  const problems = []
  const seen = new Set()
  const plan = data.kits.map((k, n) => {
    const where = `kit #${n + 1}`

    let branchId = null
    if (k.branch !== null && k.branch !== undefined) {
      branchId = branchByCode.get(String(k.branch).trim().toLowerCase())
      if (!branchId) problems.push(`${where}: unknown branch code "${k.branch}"`)
    }
    if (!Number.isInteger(k.semester) || k.semester < 1 || k.semester > 8) problems.push(`${where}: semester must be a whole number from 1 to 8`)
    const name = String(k.name || '').trim()
    if (!name) problems.push(`${where}: missing name`)

    const key = `${branchId ?? 'all'}:${k.semester}`
    if (seen.has(key)) problems.push(`${where}: another kit in the file has the same branch and semester`)
    seen.add(key)

    const items = (k.items || []).map((it, m) => {
      const id = typeByName.get(String(it.item_type || '').trim().toLowerCase())
      if (!id) problems.push(`${where}, item ${m + 1}: unknown item type "${it.item_type}"`)
      const quantity = it.quantity === undefined ? 1 : it.quantity
      if (!Number.isInteger(quantity) || quantity < 1) problems.push(`${where}, item ${m + 1}: quantity must be a whole number, 1 or more`)
      return { id, quantity, optional: Boolean(it.optional) }
    })
    if (items.length === 0) problems.push(`${where}: has no items`)
    const ids = items.map((i) => i.id).filter(Boolean)
    if (new Set(ids).size !== ids.length) problems.push(`${where}: the same item type is listed twice`)

    return { branchId, semester: k.semester, name, items }
  })

  if (problems.length) {
    console.error('Nothing was saved. Fix these first:\n  - ' + problems.join('\n  - '))
    console.error('\nValid branch codes: ' + branches.map((b) => b.code).join(', '))
    console.error('Valid item types:   ' + types.map((t) => t.name).join(', '))
    process.exitCode = 1
    return
  }

  await tx(async (db) => {
    for (const k of plan) {
      const found = await db.query(
        'SELECT id FROM kits WHERE COALESCE(branch_id, 0) = COALESCE($1::int, 0) AND semester = $2',
        [k.branchId, k.semester]
      )
      let kitId
      if (found.rows[0]) {
        kitId = found.rows[0].id
        await db.query('UPDATE kits SET name = $1 WHERE id = $2', [k.name, kitId])
        await db.query('DELETE FROM kit_items WHERE kit_id = $1', [kitId])
      } else {
        kitId = (await db.query(
          'INSERT INTO kits (branch_id, semester, name) VALUES ($1, $2, $3) RETURNING id',
          [k.branchId, k.semester, k.name]
        )).rows[0].id
      }
      for (const it of k.items) {
        await db.query(
          'INSERT INTO kit_items (kit_id, item_type_id, quantity, is_optional) VALUES ($1, $2, $3, $4)',
          [kitId, it.id, it.quantity, it.optional]
        )
      }
    }
  })
  console.log(`Saved ${plan.length} kit(s) with ${plan.reduce((n, k) => n + k.items.length, 0)} item row(s).`)
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1 })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100))
