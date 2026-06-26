-- ============================================================
-- Renomeação de tabelas — idempotente (verifica antes de agir)
-- Executado automaticamente no startup do backend antes do
-- prisma db push, portanto seguro rodar múltiplas vezes.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'User') THEN
    ALTER TABLE "User" RENAME TO "TBLUSUARIO";
    RAISE NOTICE 'Renomeada: User -> TBLUSUARIO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DoctorSecretary') THEN
    ALTER TABLE "DoctorSecretary" RENAME TO "TBLMEDICOSECRETARIA";
    RAISE NOTICE 'Renomeada: DoctorSecretary -> TBLMEDICOSECRETARIA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Patient') THEN
    ALTER TABLE "Patient" RENAME TO "TBLPACIENTE";
    RAISE NOTICE 'Renomeada: Patient -> TBLPACIENTE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'HealthPlan') THEN
    ALTER TABLE "HealthPlan" RENAME TO "TBLPLANOSAUDE";
    RAISE NOTICE 'Renomeada: HealthPlan -> TBLPLANOSAUDE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PatientPlan') THEN
    ALTER TABLE "PatientPlan" RENAME TO "TBLPACIENTEPLANO";
    RAISE NOTICE 'Renomeada: PatientPlan -> TBLPACIENTEPLANO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AppointmentBlock') THEN
    ALTER TABLE "AppointmentBlock" RENAME TO "TBLBLOQUEIOAGENDA";
    RAISE NOTICE 'Renomeada: AppointmentBlock -> TBLBLOQUEIOAGENDA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'MedicalRecord') THEN
    ALTER TABLE "MedicalRecord" RENAME TO "TBLPRONTUARIO";
    RAISE NOTICE 'Renomeada: MedicalRecord -> TBLPRONTUARIO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Assessment') THEN
    ALTER TABLE "Assessment" RENAME TO "TBLAVALIACAO";
    RAISE NOTICE 'Renomeada: Assessment -> TBLAVALIACAO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Appointment') THEN
    ALTER TABLE "Appointment" RENAME TO "TBLAGENDAMENTO";
    RAISE NOTICE 'Renomeada: Appointment -> TBLAGENDAMENTO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AppointmentType') THEN
    ALTER TABLE "AppointmentType" RENAME TO "TBLTIPOAGENDAMENTO";
    RAISE NOTICE 'Renomeada: AppointmentType -> TBLTIPOAGENDAMENTO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SqlQueryLog') THEN
    ALTER TABLE "SqlQueryLog" RENAME TO "TBLLOGSQL";
    RAISE NOTICE 'Renomeada: SqlQueryLog -> TBLLOGSQL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Transaction') THEN
    ALTER TABLE "Transaction" RENAME TO "TBLTRANSACAO";
    RAISE NOTICE 'Renomeada: Transaction -> TBLTRANSACAO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Room') THEN
    ALTER TABLE "Room" RENAME TO "TBLSALA";
    RAISE NOTICE 'Renomeada: Room -> TBLSALA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'RoomSecretary') THEN
    ALTER TABLE "RoomSecretary" RENAME TO "TBLSALASECRETARIA";
    RAISE NOTICE 'Renomeada: RoomSecretary -> TBLSALASECRETARIA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DocumentTemplate') THEN
    ALTER TABLE "DocumentTemplate" RENAME TO "TBLMODELODOCUMENTO";
    RAISE NOTICE 'Renomeada: DocumentTemplate -> TBLMODELODOCUMENTO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Notification') THEN
    ALTER TABLE "Notification" RENAME TO "TBLNOTIFICACAO";
    RAISE NOTICE 'Renomeada: Notification -> TBLNOTIFICACAO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PaymentMethod') THEN
    ALTER TABLE "PaymentMethod" RENAME TO "TBLFORMAPAGAMENTO";
    RAISE NOTICE 'Renomeada: PaymentMethod -> TBLFORMAPAGAMENTO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Integration') THEN
    ALTER TABLE "Integration" RENAME TO "TBLINTEGRACAO";
    RAISE NOTICE 'Renomeada: Integration -> TBLINTEGRACAO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'WebhookLog') THEN
    ALTER TABLE "WebhookLog" RENAME TO "TBLLOGWEBHOOK";
    RAISE NOTICE 'Renomeada: WebhookLog -> TBLLOGWEBHOOK';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'DoctorSubscription') THEN
    ALTER TABLE "DoctorSubscription" RENAME TO "TBLASSINATURA";
    RAISE NOTICE 'Renomeada: DoctorSubscription -> TBLASSINATURA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SubscriptionPayment') THEN
    ALTER TABLE "SubscriptionPayment" RENAME TO "TBLPAGAMENTOASSINATURA";
    RAISE NOTICE 'Renomeada: SubscriptionPayment -> TBLPAGAMENTOASSINATURA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'WhatsAppInstance') THEN
    ALTER TABLE "WhatsAppInstance" RENAME TO "TBLWHATSAPPINSTANCIA";
    RAISE NOTICE 'Renomeada: WhatsAppInstance -> TBLWHATSAPPINSTANCIA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Conversation') THEN
    ALTER TABLE "Conversation" RENAME TO "TBLCONVERSA";
    RAISE NOTICE 'Renomeada: Conversation -> TBLCONVERSA';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Message') THEN
    ALTER TABLE "Message" RENAME TO "TBLMENSAGEM";
    RAISE NOTICE 'Renomeada: Message -> TBLMENSAGEM';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ChatbotFlow') THEN
    ALTER TABLE "ChatbotFlow" RENAME TO "TBLCHATBOTFLUXO";
    RAISE NOTICE 'Renomeada: ChatbotFlow -> TBLCHATBOTFLUXO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ChatbotTemplate') THEN
    ALTER TABLE "ChatbotTemplate" RENAME TO "TBLCHATBOTMODELO";
    RAISE NOTICE 'Renomeada: ChatbotTemplate -> TBLCHATBOTMODELO';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ChatbotSettings') THEN
    ALTER TABLE "ChatbotSettings" RENAME TO "TBLCHATBOTCONFIG";
    RAISE NOTICE 'Renomeada: ChatbotSettings -> TBLCHATBOTCONFIG';
  END IF;
END $$;

-- ─── Migração de colunas: TBLSALASECRETARIA ────────────────────────────────────
ALTER TABLE "TBLSALASECRETARIA" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── Migração de enums: PatientStatus e PatientOrigin ───────────────────────────
DO $$ BEGIN
  CREATE TYPE "PatientStatus" AS ENUM ('PRE_CADASTRO', 'ATIVO', 'INCOMPLETO', 'INATIVO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PatientOrigin" AS ENUM ('AGENDA', 'CHATBOT', 'MANUAL', 'IMPORTACAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Migração de colunas: TBLPACIENTE ──────────────────────────────────────────
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "status" "PatientStatus" NOT NULL DEFAULT 'ATIVO';
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "origin" "PatientOrigin" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "completedByUserId" TEXT;
ALTER TABLE "TBLPACIENTE" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
