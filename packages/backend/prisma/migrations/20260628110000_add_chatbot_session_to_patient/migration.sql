-- Migration: add_chatbot_session_to_patient
-- Rastreia qual sessão do chatbot light gerou o cadastro do paciente (pré-agendamento)
--
-- Contexto:
--   Novo fluxo de pré-agendamento via chatbot cria Patient com status=PRE_CADASTRO
--   e origin=CHATBOT. Este campo liga o paciente à sessão que o originou.
--
-- Dependências já garantidas pela migration 20260628100000:
--   - Coluna "status"  ("PatientStatus") em TBLPACIENTE ✓
--   - Coluna "origin"  ("PatientOrigin") em TBLPACIENTE ✓
--   - Tabela TBLLIGHTFLOWSESSION existe desde migration 20260617150000 ✓

-- 1. Adiciona coluna chatbotSessionId (nullable, unique) em TBLPACIENTE
--    UNIQUE garante relação 1-para-1: uma sessão origina no máximo um paciente.
ALTER TABLE "TBLPACIENTE"
  ADD COLUMN IF NOT EXISTS "chatbotSessionId" TEXT;

DO $$ BEGIN
  ALTER TABLE "TBLPACIENTE"
    ADD CONSTRAINT "TBLPACIENTE_chatbotSessionId_key"
    UNIQUE ("chatbotSessionId");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. FK opcional para TBLLIGHTFLOWSESSION (SET NULL ao deletar sessão)
DO $$ BEGIN
  ALTER TABLE "TBLPACIENTE"
    ADD CONSTRAINT "TBLPACIENTE_chatbotSessionId_fkey"
    FOREIGN KEY ("chatbotSessionId")
    REFERENCES "TBLLIGHTFLOWSESSION"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Índice para acelerar lookups (ex: buscar paciente pela sessão)
CREATE INDEX IF NOT EXISTS "TBLPACIENTE_chatbotSessionId_idx"
  ON "TBLPACIENTE"("chatbotSessionId");
