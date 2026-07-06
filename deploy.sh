#!/bin/bash
# Deploy ClinIQ Pro — git pull + build + up
# Uso: bash deploy.sh
# O backend executa scripts/migrate.sh ao iniciar:
#   1. rename-tables.sql (idempotente)
#   2. baseline automático se for a primeira vez com migrate deploy
#   3. prisma migrate deploy (aplica apenas migrations novas)
#   4. node dist/index.js

set -e

echo "========================================"
echo "  ClinIQ Pro — Deploy"
echo "========================================"

# 1. Pull latest code
echo ""
echo "[1/3] Atualizando codigo..."
git pull origin main

# 2. Build images (apenas os que mudaram são reconstruídos pelo cache)
echo ""
echo "[2/3] Buildando imagens..."
docker compose build

# 3. Restart containers preservando o volume do banco
#    --force-recreate garante que os containers usem as novas imagens
echo ""
echo "[3/3] Reiniciando containers..."
docker compose up -d --force-recreate

# Aguarda o backend ficar healthy (aplica migrations via scripts/migrate.sh)
echo ""
echo "Aguardando backend..."
RETRIES=0
until docker inspect --format='{{.State.Health.Status}}' clinicmedia_backend 2>/dev/null | grep -q "healthy"; do
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -gt 40 ]; then
    echo "Timeout. Veja os logs:"
    docker compose logs --tail=40 backend
    exit 1
  fi
  printf "."
  sleep 3
done

echo ""
echo ""
echo "Deploy concluido!"
echo "Acesse: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "Logs recentes do backend:"
docker compose logs --tail=20 backend
