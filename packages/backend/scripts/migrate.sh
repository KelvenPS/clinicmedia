#!/bin/sh
# Startup migration script — safe for production data.
#
# Flow every deploy:
#   1. rename-tables.sql (idempotent)
#   2. resolve-failed-migrations.js
#         - Baselines all pre-20260628 migrations that are not cleanly tracked
#           (schema already in DB via prisma db push)
#         - Lets 20260628+ migrations run normally via deploy (idempotent SQL)
#   3. prisma migrate deploy — applies only new, untracked migrations
#   4. node dist/index.js
set -e

echo "[migrate] Step 1/4: rename-tables.sql..."
node_modules/.bin/prisma db execute \
  --file=prisma/rename-tables.sql \
  --schema=prisma/schema.prisma

echo "[migrate] Step 2/4: resolving migration state..."
node scripts/resolve-failed-migrations.js 2>&1

echo "[migrate] Step 3/4: prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "[migrate] Step 4/4: starting server..."
exec node dist/index.js
