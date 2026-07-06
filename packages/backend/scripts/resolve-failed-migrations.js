// Ensures all migrations are in a sane state before prisma migrate deploy.
//
// Strategy:
//   - Migrations before BASELINE_CUTOFF existed when the DB was managed by
//     prisma db push. Their schema is already in the DB. Any that are not
//     cleanly applied in _prisma_migrations get baselined (marked applied
//     without running SQL) so that prisma migrate deploy can proceed.
//   - Migrations on or after BASELINE_CUTOFF are NEW — they must run via
//     prisma migrate deploy. They use IF NOT EXISTS so they are idempotent
//     even if the DB already has partial state.
//
// This is safe for production: no data is touched, only migration records.

const { execSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

// Migrations with names >= this prefix are new and should run normally.
// Migrations before this were applied by prisma db push and must be baselined.
const BASELINE_CUTOFF = '20260628'

async function main() {
  const p = new PrismaClient()
  try {
    // Collect all migrations cleanly applied (finished_at set, not rolled back)
    let appliedNames = new Set()
    try {
      const rows = await p.$queryRawUnsafe(
        `SELECT migration_name
         FROM _prisma_migrations
         WHERE finished_at IS NOT NULL
           AND rolled_back_at IS NULL`
      )
      appliedNames = new Set(rows.map(r => r.migration_name))
      console.log(`[migrate] ${appliedNames.size} migration(s) already cleanly applied.`)
    } catch {
      console.log('[migrate] _prisma_migrations not readable — will baseline all pre-cutoff migrations.')
    }

    // Read all migration folders
    const entries = fs.readdirSync('prisma/migrations', { withFileTypes: true })
    const migrationNames = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()

    let baselinedCount = 0
    for (const name of migrationNames) {
      if (appliedNames.has(name)) continue // already cleanly applied — skip

      if (name >= BASELINE_CUTOFF) {
        // New migration — let prisma migrate deploy handle it
        console.log(`[migrate] will run via deploy: ${name}`)
        continue
      }

      // Old migration not cleanly tracked — baseline it
      console.log(`[migrate] resolve --applied: ${name}`)
      try {
        execSync(
          `node_modules/.bin/prisma migrate resolve --applied "${name}" --schema=prisma/schema.prisma`,
          { stdio: 'inherit' }
        )
        baselinedCount++
      } catch {
        console.log(`[migrate]   (skipped — already handled)`)
      }
    }

    if (baselinedCount > 0) {
      console.log(`[migrate] Baselined ${baselinedCount} pre-existing migration(s).`)
    } else {
      console.log('[migrate] No migrations needed baselining.')
    }
  } finally {
    await p.$disconnect()
  }
}

main().catch(e => {
  console.error('[migrate] resolve error (non-fatal):', e.message)
  process.exit(0)
})
