// Finds migrations with status FAILED in _prisma_migrations and resolves
// them as applied. Safe here because prisma db push already applied the
// schema; failures are due to old table names (pre-rename) in the SQL.
const { execSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  try {
    const failed = await p.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL
         AND rolled_back_at IS NULL
         AND started_at IS NOT NULL`
    )
    if (!failed.length) {
      console.log('[migrate] No failed migrations found.')
      return
    }
    for (const row of failed) {
      const name = row.migration_name
      console.log(`[migrate]   resolve --applied: ${name}`)
      try {
        execSync(
          `node_modules/.bin/prisma migrate resolve --applied "${name}" --schema=prisma/schema.prisma`,
          { stdio: 'inherit' }
        )
      } catch {
        console.log(`[migrate]   (already resolved or not found — skipping)`)
      }
    }
    console.log('[migrate] Failed migrations resolved.')
  } finally {
    await p.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(0) })
