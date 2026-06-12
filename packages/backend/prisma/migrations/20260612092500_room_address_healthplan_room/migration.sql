-- AlterTable Room: add address fields (nullable to preserve existing data)
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "cep"        TEXT;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "numero"     TEXT;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "cidade"     TEXT;

-- AlterTable HealthPlan: add optional roomId FK
ALTER TABLE "HealthPlan" ADD COLUMN IF NOT EXISTS "roomId" TEXT;

-- AddForeignKey (IF NOT EXISTS guard via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'HealthPlan_roomId_fkey'
      AND table_name = 'HealthPlan'
  ) THEN
    ALTER TABLE "HealthPlan"
      ADD CONSTRAINT "HealthPlan_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
