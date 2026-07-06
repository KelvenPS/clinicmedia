-- Financial Improvements Migration
-- Adds new fields to TBLTRANSACAO and TBLAGENDAMENTO

-- Add new columns to Transaction table
ALTER TABLE "TBLTRANSACAO"
  ADD COLUMN IF NOT EXISTS "paymentMethodId" TEXT,
  ADD COLUMN IF NOT EXISTS "repasseValue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Add billedAt column to Appointment table
ALTER TABLE "TBLAGENDAMENTO"
  ADD COLUMN IF NOT EXISTS "billedAt" TIMESTAMP(3);

-- Add FK from Transaction.paymentMethodId → PaymentMethod.id
DO $$ BEGIN
  ALTER TABLE "TBLTRANSACAO"
    ADD CONSTRAINT "TBLTRANSACAO_paymentMethodId_fkey"
    FOREIGN KEY ("paymentMethodId")
    REFERENCES "TBLFORMAPAGAMENTO"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
