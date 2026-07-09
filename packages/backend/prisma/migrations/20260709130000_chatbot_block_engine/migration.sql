-- Fase 3: motor de blocos genérico (visual_builder). 100% aditivo — nenhuma
-- tabela/coluna existente é alterada ou removida. O motor legado
-- (chatbot-light-engine.ts / chatbot-light-guided-engine.ts / LightFluxo /
-- LightSystemActionConfig) não lê nem escreve nada abaixo.

-- AlterTable: modo do chatbot (legacy | visual_builder)
ALTER TABLE "TBLLIGHTCHATBOT"
  ADD COLUMN IF NOT EXISTS "builderMode" TEXT NOT NULL DEFAULT 'legacy';

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLCHATBOTBUILDERVERSION" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "chatbotId"       TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'draft',
    "versionNumber"   INTEGER NOT NULL,
    "createdByUserId" TEXT,
    "publishedAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLCHATBOTBUILDERVERSION_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBUILDERVERSION_chatbotId_idx" ON "TBLCHATBOTBUILDERVERSION"("chatbotId");
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBUILDERVERSION_status_idx" ON "TBLCHATBOTBUILDERVERSION"("status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLCHATBOTBLOCK" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "versionId"     TEXT NOT NULL,
    "chatbotId"     TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "orderIndex"    INTEGER NOT NULL DEFAULT 0,
    "parentBlockId" TEXT,
    "config"        JSONB NOT NULL DEFAULT '{}',
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLCHATBOTBLOCK_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBLOCK_chatbotId_idx" ON "TBLCHATBOTBLOCK"("chatbotId");
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBLOCK_versionId_idx" ON "TBLCHATBOTBLOCK"("versionId");
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBLOCK_parentBlockId_idx" ON "TBLCHATBOTBLOCK"("parentBlockId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TBLCHATBOTBLOCK_versionId_fkey'
  ) THEN
    ALTER TABLE "TBLCHATBOTBLOCK"
      ADD CONSTRAINT "TBLCHATBOTBLOCK_versionId_fkey"
      FOREIGN KEY ("versionId") REFERENCES "TBLCHATBOTBUILDERVERSION"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLCHATBOTBUILDERSESSION" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "chatbotId"      TEXT NOT NULL,
    "roomId"         TEXT,
    "phone"          TEXT NOT NULL,
    "contactName"    TEXT,
    "currentBlockId" TEXT,
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "variables"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt"  TIMESTAMP(3),

    CONSTRAINT "TBLCHATBOTBUILDERSESSION_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLCHATBOTBUILDERSESSION_chatbotId_phone_status_idx" ON "TBLCHATBOTBUILDERSESSION"("chatbotId", "phone", "status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLCHATBOTMESSAGETRACE" (
    "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "sessionId"         TEXT NOT NULL,
    "chatbotId"         TEXT NOT NULL,
    "direction"         TEXT NOT NULL,
    "message"           TEXT NOT NULL,
    "blockId"           TEXT,
    "sourceType"        TEXT NOT NULL,
    "sourceId"          TEXT,
    "variablesSnapshot" JSONB,
    "metadata"          JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLCHATBOTMESSAGETRACE_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLCHATBOTMESSAGETRACE_sessionId_idx" ON "TBLCHATBOTMESSAGETRACE"("sessionId");
CREATE INDEX IF NOT EXISTS "TBLCHATBOTMESSAGETRACE_chatbotId_idx" ON "TBLCHATBOTMESSAGETRACE"("chatbotId");
CREATE INDEX IF NOT EXISTS "TBLCHATBOTMESSAGETRACE_createdAt_idx" ON "TBLCHATBOTMESSAGETRACE"("createdAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLSYSTEMACTIONEXECUTION" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "chatbotId"    TEXT NOT NULL,
    "sessionId"    TEXT,
    "actionKey"    TEXT NOT NULL,
    "input"        JSONB NOT NULL,
    "output"       JSONB,
    "success"      BOOLEAN NOT NULL,
    "errorCode"    TEXT,
    "errorMessage" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLSYSTEMACTIONEXECUTION_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLSYSTEMACTIONEXECUTION_chatbotId_idx" ON "TBLSYSTEMACTIONEXECUTION"("chatbotId");
CREATE INDEX IF NOT EXISTS "TBLSYSTEMACTIONEXECUTION_sessionId_idx" ON "TBLSYSTEMACTIONEXECUTION"("sessionId");
CREATE INDEX IF NOT EXISTS "TBLSYSTEMACTIONEXECUTION_actionKey_idx" ON "TBLSYSTEMACTIONEXECUTION"("actionKey");
CREATE INDEX IF NOT EXISTS "TBLSYSTEMACTIONEXECUTION_createdAt_idx" ON "TBLSYSTEMACTIONEXECUTION"("createdAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "TBLLEGACYACTIONMAPPING" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "chatbotId"      TEXT NOT NULL,
    "legacyActionId" TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'active',
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLLEGACYACTIONMAPPING_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TBLLEGACYACTIONMAPPING_chatbotId_idx" ON "TBLLEGACYACTIONMAPPING"("chatbotId");
CREATE INDEX IF NOT EXISTS "TBLLEGACYACTIONMAPPING_legacyActionId_idx" ON "TBLLEGACYACTIONMAPPING"("legacyActionId");
