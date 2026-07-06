#!/bin/sh
# Startup migration script — safe for production.
# Strategy:
#   1. Run idempotent table renames (always safe to repeat).
#   2. If _prisma_migrations table does not yet exist (DB was built via
#      prisma db push), baseline all existing migration folders so that
#      prisma migrate deploy does not try to re-run already-applied SQL.
#   3. Run prisma migrate deploy — applies only new, untracked migrations.
#   4. Start the server.
set -e

echo "[migrate] Step 1/4: rename-tables.sql..."
node_modules/.bin/prisma db execute \
  --file=prisma/rename-tables.sql \
  --schema=prisma/schema.prisma

echo "[migrate] Step 2/4: checking migration history..."
HAS_HISTORY=$(node scripts/check-migration-history.js 2>/dev/null)

if [ "$HAS_HISTORY" != "yes" ]; then
  echo "[migrate] No history found — baselining existing migrations (first switch to migrate deploy)..."
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    [ "$name" = "README.md" ] && continue
    echo "[migrate]   baseline: $name"
    node_modules/.bin/prisma migrate resolve \
      --applied "$name" \
      --schema=prisma/schema.prisma 2>&1 || true
  done
  echo "[migrate] Baseline complete."
fi

echo "[migrate] Step 3/4: prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "[migrate] Step 4/4: starting server..."
exec node dist/index.js
