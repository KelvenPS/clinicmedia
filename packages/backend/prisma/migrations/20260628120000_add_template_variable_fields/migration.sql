-- Migration: add_template_variable_fields
-- Adiciona campos necessários para suportar variáveis expandidas de template do chatbot
-- Data: 2026-06-28

-- ─── TBLSALA: endereço formatado e link de teleconsulta ──────────────────────
-- Variável {endereco}: endereço completo formatado da sala/clínica
ALTER TABLE "TBLSALA" ADD COLUMN IF NOT EXISTS "address" TEXT;

-- Variável {teleconsulta}: link de teleconsulta da sala
ALTER TABLE "TBLSALA" ADD COLUMN IF NOT EXISTS "teleconsulta_link" TEXT;

-- ─── TBLTRANSACAO: forma de pagamento ────────────────────────────────────────
-- Variável {forma_pagamento}: método de pagamento (ex: PIX, Cartão, Dinheiro, Convênio)
ALTER TABLE "TBLTRANSACAO" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
