-- Migration: financial_categories_cost_centers_bank_accounts
-- Tables were previously created via prisma db push without a migration file.
-- All statements use IF NOT EXISTS so this is safe on existing databases.

DO $$ BEGIN
  CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- TBLCATEGORIAFIN (FinancialCategory)
CREATE TABLE IF NOT EXISTS "TBLCATEGORIAFIN" (
  "id"        TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "type"      "TransactionType" NOT NULL,
  "color"     TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TBLCATEGORIAFIN_pkey" PRIMARY KEY ("id")
);

-- TBLCENTROCUSTO (CostCenter)
CREATE TABLE IF NOT EXISTS "TBLCENTROCUSTO" (
  "id"          TEXT NOT NULL,
  "doctorId"    TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TBLCENTROCUSTO_pkey" PRIMARY KEY ("id")
);

-- TBLCONTABANCARIA (BankAccount)
CREATE TABLE IF NOT EXISTS "TBLCONTABANCARIA" (
  "id"        TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "bank"      TEXT,
  "agency"    TEXT,
  "account"   TEXT,
  "type"      "BankAccountType" NOT NULL DEFAULT 'CHECKING',
  "balance"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TBLCONTABANCARIA_pkey" PRIMARY KEY ("id")
);

-- FK columns on TBLTRANSACAO (added by prisma db push, may already exist)
ALTER TABLE "TBLTRANSACAO" ADD COLUMN IF NOT EXISTS "categoryId"    TEXT;
ALTER TABLE "TBLTRANSACAO" ADD COLUMN IF NOT EXISTS "costCenterId"  TEXT;
ALTER TABLE "TBLTRANSACAO" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;

-- Foreign keys from FinancialCategory → User
DO $$ BEGIN
  ALTER TABLE "TBLCATEGORIAFIN"
    ADD CONSTRAINT "TBLCATEGORIAFIN_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Foreign keys from CostCenter → User
DO $$ BEGIN
  ALTER TABLE "TBLCENTROCUSTO"
    ADD CONSTRAINT "TBLCENTROCUSTO_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Foreign keys from BankAccount → User
DO $$ BEGIN
  ALTER TABLE "TBLCONTABANCARIA"
    ADD CONSTRAINT "TBLCONTABANCARIA_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Foreign keys from Transaction → FinancialCategory / CostCenter / BankAccount
DO $$ BEGIN
  ALTER TABLE "TBLTRANSACAO"
    ADD CONSTRAINT "TBLTRANSACAO_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TBLCATEGORIAFIN"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "TBLTRANSACAO"
    ADD CONSTRAINT "TBLTRANSACAO_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "TBLCENTROCUSTO"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "TBLTRANSACAO"
    ADD CONSTRAINT "TBLTRANSACAO_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "TBLCONTABANCARIA"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
