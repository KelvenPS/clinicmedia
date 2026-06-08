#!/bin/bash
set -e

echo "🚀 ClinIQ Pro — Deploy Script"
echo "================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Run as root: sudo bash deploy.sh"
  exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
  echo "📦 Installing Docker Compose..."
  apt-get install -y docker-compose-plugin
fi

# Create .env if not exists
if [ ! -f .env ]; then
  echo "⚙️  Creating .env from .env.example..."
  cp .env.example .env
  # Generate random JWT secret
  JWT_SECRET=$(openssl rand -hex 32)
  sed -i "s/your-super-secret-jwt-key-CHANGE-ME-in-production/$JWT_SECRET/" .env
  echo "✅ .env created with random JWT_SECRET"
  echo "⚠️  Edit .env to set POSTGRES_PASSWORD before continuing"
  echo "   nano .env"
  exit 0
fi

echo "🐳 Building and starting containers..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo "⏳ Waiting for database to be ready..."
sleep 10

echo "🌱 Running database migrations..."
docker compose exec backend npx prisma migrate deploy

echo "🌱 Seeding initial data..."
docker compose exec backend npx prisma db seed || true

echo ""
echo "✅ Deploy concluído!"
echo "🌐 Acesse: http://2.25.185.223"
echo "📊 API Health: http://2.25.185.223/api/health"
echo ""
echo "📋 Credenciais padrão:"
echo "   Admin: admin@cliniq.com / admin123"
echo ""
echo "⚠️  IMPORTANTE: Altere a senha do admin após o primeiro login!"
