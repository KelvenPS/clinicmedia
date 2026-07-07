-- AlterTable: LightMessageLog — referência opcional a um LightTemplate (rastreio de qual template gerou a mensagem)
ALTER TABLE "TBLCHATBOTLIGHTLOG" ADD COLUMN "templateId" TEXT;

-- AddForeignKey
ALTER TABLE "TBLCHATBOTLIGHTLOG" ADD CONSTRAINT "TBLCHATBOTLIGHTLOG_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TBLCHATBOTLIGHTTEMPLATE"("id") ON DELETE SET NULL ON UPDATE CASCADE;
