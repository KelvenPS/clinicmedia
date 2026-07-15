-- Configuração administrável da integração Kiwify (linha única, id fixo
-- "kiwify") — gerenciada pelo menu Admin > Integrações do frontend, permite
-- trocar segredo do webhook / produto / URL de checkout sem redeploy.

-- CreateTable
CREATE TABLE "TBLCONFIGKIWIFY" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "checkoutUrl" TEXT,
    "productId" TEXT,
    "accountId" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "webhookSecret" TEXT,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TBLCONFIGKIWIFY_pkey" PRIMARY KEY ("id")
);
