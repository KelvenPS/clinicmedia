-- CreateTable
CREATE TABLE "TBLWHATSAPPMESSAGERETRY" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT true,
    "participant" TEXT,
    "messageB64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLWHATSAPPMESSAGERETRY_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TBLWHATSAPPMESSAGERETRY_instanceId_idx" ON "TBLWHATSAPPMESSAGERETRY"("instanceId");

-- CreateIndex
CREATE INDEX "TBLWHATSAPPMESSAGERETRY_createdAt_idx" ON "TBLWHATSAPPMESSAGERETRY"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TBLWHATSAPPMESSAGERETRY_instanceId_remoteJid_messageId_fromMe_key" ON "TBLWHATSAPPMESSAGERETRY"("instanceId", "remoteJid", "messageId", "fromMe");
