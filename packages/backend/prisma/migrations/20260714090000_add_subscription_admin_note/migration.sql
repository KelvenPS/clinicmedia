-- Campo pra registrar por que um ADMIN liberou/bloqueou/resetou manualmente
-- a assinatura de um médico (ex.: usuário de teste). Aditivo, sem risco.
ALTER TABLE "TBLASSINATURACLINICA" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
