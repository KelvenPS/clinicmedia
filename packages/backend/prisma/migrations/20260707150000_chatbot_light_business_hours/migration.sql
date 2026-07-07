-- AlterTable: LightSettings — horário de funcionamento (vale para todos os chatbots da conta)
ALTER TABLE "TBLCHATBOTLIGHTSETTINGS" ADD COLUMN "businessHours" JSONB;
