// Checks if _prisma_migrations table exists in the DB.
// Prints "yes" or "no" to stdout. Used by migrate.sh.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
p.$queryRawUnsafe(
  "SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations'"
)
  .then(r => { process.stdout.write(Number(r[0].c) > 0 ? 'yes' : 'no'); return p.$disconnect(); })
  .catch(() => { process.stdout.write('no'); return p.$disconnect().catch(() => {}); })
