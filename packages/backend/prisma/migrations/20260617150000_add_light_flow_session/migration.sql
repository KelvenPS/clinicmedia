-- CreateTable
CREATE TABLE "TBLLIGHTFLOWSESSION" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "contactPhone" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "currentStepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "collectedData" JSONB,
    "dynamicOptions" JSONB,
    "invalidAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TBLLIGHTFLOWSESSION_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TBLLIGHTFLOWSESSION_instanceId_contactPhone_status_idx" ON "TBLLIGHTFLOWSESSION"("instanceId", "contactPhone", "status");

-- CreateIndex
CREATE INDEX "TBLLIGHTFLOWSESSION_instanceId_idx" ON "TBLLIGHTFLOWSESSION"("instanceId");

-- CreateIndex
CREATE INDEX "TBLLIGHTFLOWSESSION_contactPhone_idx" ON "TBLLIGHTFLOWSESSION"("contactPhone");

-- CreateIndex
CREATE INDEX "TBLLIGHTFLOWSESSION_flowId_idx" ON "TBLLIGHTFLOWSESSION"("flowId");

-- CreateIndex
CREATE INDEX "TBLLIGHTFLOWSESSION_expiresAt_idx" ON "TBLLIGHTFLOWSESSION"("expiresAt");
