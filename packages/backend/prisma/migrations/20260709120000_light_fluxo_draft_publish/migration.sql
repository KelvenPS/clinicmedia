-- AlterTable: camada de rascunho/publicação do Construtor de Atendimento (builder visual)
-- 100% aditivo — nenhuma coluna existente é alterada ou removida. O motor de
-- execução (chatbot-light-engine.ts / chatbot-light-guided-engine.ts) continua
-- lendo só welcomeMessage/keywords/options/active (campos "live"/publicados).
ALTER TABLE "TBLCHATBOTLIGHTFLUXO"
  ADD COLUMN IF NOT EXISTS "status"              TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "draftWelcomeMessage"  TEXT,
  ADD COLUMN IF NOT EXISTS "draftKeywords"        TEXT,
  ADD COLUMN IF NOT EXISTS "draftOptions"         JSONB,
  ADD COLUMN IF NOT EXISTS "hasDraftChanges"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastPublishedAt"       TIMESTAMP(3);
