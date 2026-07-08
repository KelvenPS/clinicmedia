-- CreateTable: templates de notificação de agendamento (WhatsApp)
CREATE TABLE IF NOT EXISTS "TBLCHATBOTLIGHTNOTIFTPL" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "doctorId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "message"   TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLCHATBOTLIGHTNOTIFTPL_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TBLCHATBOTLIGHTNOTIFTPL_doctorId_idx"
  ON "TBLCHATBOTLIGHTNOTIFTPL"("doctorId");

-- AddForeignKey (safe — só adiciona se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TBLCHATBOTLIGHTNOTIFTPL_doctorId_fkey'
  ) THEN
    ALTER TABLE "TBLCHATBOTLIGHTNOTIFTPL"
      ADD CONSTRAINT "TBLCHATBOTLIGHTNOTIFTPL_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
