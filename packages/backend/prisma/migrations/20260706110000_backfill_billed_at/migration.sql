-- Backfill billedAt on appointments that already have a transaction.
-- These were charged via the old auto-transaction-on-COMPLETED flow.
-- Sets billedAt = transaction.createdAt so the "Cobrar" button stays hidden.

UPDATE "TBLAGENDAMENTO" a
SET "billedAt" = t."createdAt"
FROM "TBLTRANSACAO" t
WHERE t."appointmentId" = a."id"
  AND a."billedAt" IS NULL;
