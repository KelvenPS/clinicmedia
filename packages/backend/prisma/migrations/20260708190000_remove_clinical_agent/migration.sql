-- Remove o Agente Clínico da plataforma (CLINICAL_AGENT).
-- O Chatbot Light (CHATBOT_LIGHT) e todo o restante da aplicação não são afetados.

-- Apaga as instâncias WhatsApp do Agente Clínico. Cascade remove automaticamente
-- (via FK ON DELETE CASCADE ainda vigente neste ponto da migration) as linhas
-- dependentes em TBLCONVERSA (-> TBLMENSAGEM), TBLCHATBOTFLUXO e TBLCHATBOTCONFIG.
DELETE FROM "TBLWHATSAPPINSTANCIA" WHERE "type" = 'CLINICAL_AGENT';

-- DropTable
DROP TABLE "TBLCHATBOTFLUXO";

-- DropTable
DROP TABLE "TBLCHATBOTMODELO";

-- DropTable
DROP TABLE "TBLCHATBOTCONFIG";

-- DropEnum (só era usado por TBLCHATBOTFLUXO.trigger)
DROP TYPE "FlowTrigger";

-- AlterEnum (remove CLINICAL_AGENT de WhatsAppInstanceType)
BEGIN;
CREATE TYPE "WhatsAppInstanceType_new" AS ENUM ('CHATBOT_LIGHT');
ALTER TABLE "TBLWHATSAPPINSTANCIA" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "TBLWHATSAPPINSTANCIA" ALTER COLUMN "type" TYPE "WhatsAppInstanceType_new" USING ("type"::text::"WhatsAppInstanceType_new");
ALTER TYPE "WhatsAppInstanceType" RENAME TO "WhatsAppInstanceType_old";
ALTER TYPE "WhatsAppInstanceType_new" RENAME TO "WhatsAppInstanceType";
DROP TYPE "WhatsAppInstanceType_old";
ALTER TABLE "TBLWHATSAPPINSTANCIA" ALTER COLUMN "type" SET DEFAULT 'CHATBOT_LIGHT';
COMMIT;
