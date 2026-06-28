-- Migration: add_patient_pre_registration
-- Adds pre-registration workflow fields to patients table

-- Create enums (idempotent)
DO $$ BEGIN
  CREATE TYPE "PatientStatus" AS ENUM ('PRE_CADASTRO', 'ATIVO', 'INCOMPLETO', 'INATIVO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PatientOrigin" AS ENUM ('AGENDA', 'CHATBOT', 'MANUAL', 'IMPORTACAO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to TBLPACIENTE
ALTER TABLE "TBLPACIENTE"
  ADD COLUMN IF NOT EXISTS "status"             "PatientStatus" NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS "origin"             "PatientOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "roomId"             TEXT,
  ADD COLUMN IF NOT EXISTS "createdByUserId"    TEXT,
  ADD COLUMN IF NOT EXISTS "completedByUserId"  TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt"        TIMESTAMP(3);

-- Add foreign key constraints (skip if already exist)
DO $$ BEGIN
  ALTER TABLE "TBLPACIENTE"
    ADD CONSTRAINT "TBLPACIENTE_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "TBLSALA"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "TBLPACIENTE"
    ADD CONSTRAINT "TBLPACIENTE_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "TBLUSUARIO"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "TBLPACIENTE"
    ADD CONSTRAINT "TBLPACIENTE_completedByUserId_fkey"
    FOREIGN KEY ("completedByUserId") REFERENCES "TBLUSUARIO"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes for filtering by status and origin
CREATE INDEX IF NOT EXISTS "TBLPACIENTE_status_idx" ON "TBLPACIENTE"("status");
CREATE INDEX IF NOT EXISTS "TBLPACIENTE_origin_idx" ON "TBLPACIENTE"("origin");
CREATE INDEX IF NOT EXISTS "TBLPACIENTE_createdByUserId_idx" ON "TBLPACIENTE"("createdByUserId");
