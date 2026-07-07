-- AlterTable: LightQuickReply — referência opcional a um LightTemplate (deduplicação de texto de mensagem)
ALTER TABLE "TBLCHATBOTLIGHTQUICKREPLY" ADD COLUMN "templateId" TEXT;

-- AlterTable: LightSettings — preferência de exibir painéis avançados no menu
ALTER TABLE "TBLCHATBOTLIGHTSETTINGS" ADD COLUMN "advancedMode" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "TBLCHATBOTLIGHTQUICKREPLY" ADD CONSTRAINT "TBLCHATBOTLIGHTQUICKREPLY_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TBLCHATBOTLIGHTTEMPLATE"("id") ON DELETE SET NULL ON UPDATE CASCADE;
