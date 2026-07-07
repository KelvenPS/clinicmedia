-- CreateTable: LightChatbot — entidade "chatbot" que agrupa fluxos, respostas
-- rápidas, mensagens automáticas e logs sob um nome/objetivo/sala próprios.
CREATE TABLE "TBLLIGHTCHATBOT" (
    "id"            TEXT NOT NULL,
    "doctorId"      TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "objective"     TEXT,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "boundRoomId"   TEXT,
    "fallbackQueue" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TBLLIGHTCHATBOT_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TBLLIGHTCHATBOT_boundRoomId_key" ON "TBLLIGHTCHATBOT"("boundRoomId");
CREATE INDEX "TBLLIGHTCHATBOT_doctorId_idx" ON "TBLLIGHTCHATBOT"("doctorId");

ALTER TABLE "TBLLIGHTCHATBOT" ADD CONSTRAINT "TBLLIGHTCHATBOT_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TBLLIGHTCHATBOT" ADD CONSTRAINT "TBLLIGHTCHATBOT_boundRoomId_fkey" FOREIGN KEY ("boundRoomId") REFERENCES "TBLSALA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: WhatsAppInstance passa a poder ter várias linhas CHATBOT_LIGHT
-- por médico (uma por chatbot). CLINICAL_AGENT continua único por médico,
-- garantido em código (find-or-create) em vez de constraint de banco.
ALTER TABLE "TBLWHATSAPPINSTANCIA" ADD COLUMN "chatbotId" TEXT;
DROP INDEX "TBLWHATSAPPINSTANCIA_doctorId_type_key";
CREATE UNIQUE INDEX "TBLWHATSAPPINSTANCIA_chatbotId_key" ON "TBLWHATSAPPINSTANCIA"("chatbotId");
ALTER TABLE "TBLWHATSAPPINSTANCIA" ADD CONSTRAINT "TBLWHATSAPPINSTANCIA_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "TBLLIGHTCHATBOT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: LightFluxo passa a pertencer a um chatbot
ALTER TABLE "TBLCHATBOTLIGHTFLUXO" ADD COLUMN "chatbotId" TEXT;
CREATE INDEX "TBLCHATBOTLIGHTFLUXO_chatbotId_idx" ON "TBLCHATBOTLIGHTFLUXO"("chatbotId");
ALTER TABLE "TBLCHATBOTLIGHTFLUXO" ADD CONSTRAINT "TBLCHATBOTLIGHTFLUXO_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "TBLLIGHTCHATBOT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: LightQuickReply passa a pertencer a um chatbot
ALTER TABLE "TBLCHATBOTLIGHTQUICKREPLY" ADD COLUMN "chatbotId" TEXT;
CREATE INDEX "TBLCHATBOTLIGHTQUICKREPLY_chatbotId_idx" ON "TBLCHATBOTLIGHTQUICKREPLY"("chatbotId");
ALTER TABLE "TBLCHATBOTLIGHTQUICKREPLY" ADD CONSTRAINT "TBLCHATBOTLIGHTQUICKREPLY_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "TBLLIGHTCHATBOT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: LightIntegrationConfig passa a pertencer a um chatbot (define
-- por qual número/sala a automação dispara)
ALTER TABLE "TBLCHATBOTLIGHTCONFIG" ADD COLUMN "chatbotId" TEXT;
DROP INDEX "TBLCHATBOTLIGHTCONFIG_doctorId_module_triggerEvent_key";
CREATE UNIQUE INDEX "TBLCHATBOTLIGHTCONFIG_doctorId_chatbotId_module_triggerEve_key" ON "TBLCHATBOTLIGHTCONFIG"("doctorId", "chatbotId", "module", "triggerEvent");
ALTER TABLE "TBLCHATBOTLIGHTCONFIG" ADD CONSTRAINT "TBLCHATBOTLIGHTCONFIG_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "TBLLIGHTCHATBOT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: LightMessageLog passa a registrar de qual chatbot é o envio
ALTER TABLE "TBLCHATBOTLIGHTLOG" ADD COLUMN "chatbotId" TEXT;
CREATE INDEX "TBLCHATBOTLIGHTLOG_chatbotId_idx" ON "TBLCHATBOTLIGHTLOG"("chatbotId");
ALTER TABLE "TBLCHATBOTLIGHTLOG" ADD CONSTRAINT "TBLCHATBOTLIGHTLOG_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "TBLLIGHTCHATBOT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Patient ganha o pipeline de lead do Chatbot Light, independente
-- do PatientStatus usado pelo resto do sistema.
ALTER TABLE "TBLPACIENTE" ADD COLUMN "leadStatus" TEXT;
CREATE INDEX "TBLPACIENTE_leadStatus_idx" ON "TBLPACIENTE"("leadStatus");

-- Backfill: cria um "Chatbot Principal" para cada médico que já tinha
-- qualquer configuração de Chatbot Light (fluxo, resposta rápida, mensagem
-- automática ou sala vinculada), herdando a sala já vinculada quando houver,
-- e migra essas configurações + a instância de WhatsApp + os logs para esse
-- chatbot. Nenhuma automação existente para de funcionar após o deploy.
INSERT INTO "TBLLIGHTCHATBOT" ("id", "doctorId", "name", "active", "boundRoomId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."doctorId", 'Chatbot Principal', true, ls."boundRoomId", NOW(), NOW()
FROM (
  SELECT "doctorId" FROM "TBLCHATBOTLIGHTFLUXO"
  UNION
  SELECT "doctorId" FROM "TBLCHATBOTLIGHTQUICKREPLY"
  UNION
  SELECT "doctorId" FROM "TBLCHATBOTLIGHTCONFIG"
  UNION
  SELECT "doctorId" FROM "TBLCHATBOTLIGHTSETTINGS" WHERE "boundRoomId" IS NOT NULL
) d
LEFT JOIN "TBLCHATBOTLIGHTSETTINGS" ls ON ls."doctorId" = d."doctorId";

UPDATE "TBLWHATSAPPINSTANCIA" wi
SET "chatbotId" = lc."id"
FROM "TBLLIGHTCHATBOT" lc
WHERE wi."doctorId" = lc."doctorId" AND wi."type" = 'CHATBOT_LIGHT';

UPDATE "TBLCHATBOTLIGHTFLUXO" f
SET "chatbotId" = lc."id"
FROM "TBLLIGHTCHATBOT" lc
WHERE f."doctorId" = lc."doctorId";

UPDATE "TBLCHATBOTLIGHTQUICKREPLY" q
SET "chatbotId" = lc."id"
FROM "TBLLIGHTCHATBOT" lc
WHERE q."doctorId" = lc."doctorId";

UPDATE "TBLCHATBOTLIGHTCONFIG" c
SET "chatbotId" = lc."id"
FROM "TBLLIGHTCHATBOT" lc
WHERE c."doctorId" = lc."doctorId";

UPDATE "TBLCHATBOTLIGHTLOG" l
SET "chatbotId" = lc."id"
FROM "TBLLIGHTCHATBOT" lc
WHERE l."doctorId" = lc."doctorId";

-- AlterTable: LightSettings perde boundRoomId — a vinculação de sala agora
-- vive em LightChatbot (migrada acima).
ALTER TABLE "TBLCHATBOTLIGHTSETTINGS" DROP CONSTRAINT IF EXISTS "TBLCHATBOTLIGHTSETTINGS_boundRoomId_fkey";
ALTER TABLE "TBLCHATBOTLIGHTSETTINGS" DROP COLUMN IF EXISTS "boundRoomId";
