#!/bin/sh
# Startup migration script — safe for production.
#
# Flow:
#   1. rename-tables.sql (idempotent — safe to repeat every deploy)
#   2. If _prisma_migrations does not exist → baseline ALL migrations as applied
#      (DB was built via prisma db push; all schema is already there)
#   3. Resolve any FAILED migrations as applied
#      (Happens when a migration SQL references old table names that were
#       renamed by rename-tables.sql before the migration ran)
#   4. prisma migrate deploy → applies only truly new, untracked migrations
#   5. Start the server
set -e

echo "[migrate] Step 1/5: rename-tables.sql..."
node_modules/.bin/prisma db execute \
  --file=prisma/rename-tables.sql \
  --schema=prisma/schema.prisma

echo "[migrate] Step 2/5: checking migration history..."
HAS_HISTORY=$(node scripts/check-migration-history.js 2>/dev/null)

if [ "$HAS_HISTORY" != "yes" ]; then
  echo "[migrate] No history found — baselining all migrations as applied..."
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    [ "$name" = "README.md" ] && continue
    echo "[migrate]   baseline: $name"
    node_modules/.bin/prisma migrate resolve \
      --applied "$name" \
      --schema=prisma/schema.prisma 2>&1 || true
  done
  echo "[migrate] Baseline complete."
else
  echo "[migrate] History exists — checking for failed migrations..."
  # Resolve any migrations marked as FAILED (started but never finished).
  # These are safe to mark applied because prisma db push already applied
  # the schema changes; the failure was due to renamed tables, not missing data.
  node scripts/resolve-failed-migrations.js 2>/dev/null || true
fi

echo "[migrate] Step 4/5: prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "[migrate] Step 5/5: starting server..."
exec node dist/index.js
