-- Migration: add_room_whatsapp_permissions_and_audit
-- Adds granular permissions to RoomSecretary, creates RoomWhatsAppConnection and AuditLog

-- Add permission columns and active flag to TBLSALASECRETARIA
ALTER TABLE "TBLSALASECRETARIA"
  ADD COLUMN IF NOT EXISTS "active"                    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canViewSchedule"           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canManageWhatsapp"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canConnectWhatsapp"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canReconnectWhatsapp"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canDisconnectWhatsapp"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canSendMessages"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseTemplates"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseAutomaticMessages"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewHistory"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add index on secretaryId for fast lookups
CREATE INDEX IF NOT EXISTS "TBLSALASECRETARIA_secretaryId_idx" ON "TBLSALASECRETARIA"("secretaryId");

-- Create RoomWhatsAppConnection table
CREATE TABLE IF NOT EXISTS "TBLSALAWHATSAPP" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "roomId"              TEXT NOT NULL,
  "doctorId"            TEXT NOT NULL,
  "instanceKey"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "status"              TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "qrCode"              TEXT,
  "qrCodeExpiresAt"     TIMESTAMP(3),
  "phoneNumber"         TEXT,
  "displayName"         TEXT,
  "connectedByUserId"   TEXT,
  "connectedAt"         TIMESTAMP(3),
  "disconnectedAt"      TIMESTAMP(3),
  "lastSyncAt"          TIMESTAMP(3),
  "reconnectAttempts"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TBLSALAWHATSAPP_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TBLSALAWHATSAPP_roomId_key" UNIQUE ("roomId"),
  CONSTRAINT "TBLSALAWHATSAPP_instanceKey_key" UNIQUE ("instanceKey"),
  CONSTRAINT "TBLSALAWHATSAPP_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TBLSALA"("id") ON DELETE CASCADE,
  CONSTRAINT "TBLSALAWHATSAPP_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "TBLUSUARIO"("id"),
  CONSTRAINT "TBLSALAWHATSAPP_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "TBLUSUARIO"("id")
);

CREATE INDEX IF NOT EXISTS "TBLSALAWHATSAPP_doctorId_idx" ON "TBLSALAWHATSAPP"("doctorId");

-- Create AuditLog table
CREATE TABLE IF NOT EXISTS "TBLAUDITLOG" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "clinicId"    TEXT,
  "roomId"      TEXT,
  "userId"      TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "description" TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TBLAUDITLOG_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TBLAUDITLOG_clinicId_idx" ON "TBLAUDITLOG"("clinicId");
CREATE INDEX IF NOT EXISTS "TBLAUDITLOG_roomId_idx" ON "TBLAUDITLOG"("roomId");
CREATE INDEX IF NOT EXISTS "TBLAUDITLOG_userId_idx" ON "TBLAUDITLOG"("userId");
CREATE INDEX IF NOT EXISTS "TBLAUDITLOG_createdAt_idx" ON "TBLAUDITLOG"("createdAt");
