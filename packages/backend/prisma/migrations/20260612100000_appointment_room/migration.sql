-- AlterTable Appointment: add optional roomId FK
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "roomId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Appointment_roomId_fkey'
      AND table_name = 'Appointment'
  ) THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
