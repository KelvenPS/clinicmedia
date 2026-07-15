-- Preço do Clinic Pro passou de R$ 89,90 para R$ 49,90/mês.
-- Só altera o DEFAULT da coluna (fallback nunca usado em produção — o valor
-- real sempre vem de CLINIC_PRO_SUBSCRIPTION.monthlyPriceCents no código).
-- Não retroage sobre pagamentos já registrados.
ALTER TABLE "TBLPAGAMENTOCLINICA" ALTER COLUMN "amountCents" SET DEFAULT 4990;
