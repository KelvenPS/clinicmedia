# Assinatura Clinic Pro via Kiwify

## Modelo comercial

- Produto único: **Clinic Pro**, R$ 49,90/mês, 7 dias de teste grátis.
- Sem tiers, sem upgrade/downgrade, sem cobrança por módulo.
- A assinatura é por "tenant" — no modelo de dados atual isso é o **doctorId**
  (o `User` com `role=DOCTOR` é o médico/especialista responsável e dono do
  tenant; não existe um model `Clinic`/`Tenant` separado neste projeto, nem um
  role `SPECIALIST` distinto — "Médico" e "Especialista" são o mesmo
  `role=DOCTOR` tecnicamente, só terminologia comercial diferente). Secretárias
  herdam o acesso da assinatura do médico a que estão vinculadas via
  `getEffectiveDoctorId()` — nunca têm trial, checkout ou assinatura própria.
- **Isso já era garantido antes desta entrega**: `POST /api/auth/register`
  (cadastro público) sempre cria `role: 'DOCTOR'` — não existe cadastro
  público de `SECRETARY`. Secretárias só são criadas via
  `POST /api/team/secretary` (autenticado, restrito a `DOCTOR`/`ADMIN`,
  `packages/backend/src/routes/team.ts`), já nascendo vinculadas ao
  `doctorId` de quem convidou. Não há como uma secretária criar um tenant
  independente, acidentalmente ou não.
- O bloqueio já é por tenant inteiro, não por usuário: o middleware resolve
  `getEffectiveDoctorId()` (médico → o próprio id; secretária → o id do
  médico vinculado) e consulta uma única `DoctorSubscription` — quando o
  médico está bloqueado, a secretária correspondente é bloqueada junto, sem
  precisar iterar usuário por usuário.

## O que foi implementado

### Backend
- `src/lib/billing-config.ts` — preço/trial/feature flags centralizados.
- `src/lib/subscription-access.ts` — `calculateClinicAccess()` (regra única de
  acesso, usada tanto no middleware quanto no endpoint de status),
  `ensureTrialSubscription()` (cria o trial de 7 dias, chamado dentro da
  transação de `POST /api/auth/register`), transições de estado válidas, e o
  watchdog que marca trials vencidos como `BLOCKED` a cada hora.
- `src/middleware/subscription.ts` — `requireActiveSubscription`, aplicado em
  `src/index.ts` nas rotas operacionais (`/api/appointments`, `/api/patients`,
  `/api/financial`, `/api/medical-records`, `/api/chatbot-light`,
  `/api/rooms`, `/api/documents`, `/api/notifications`,
  `/api/payment-methods`, `/api/integrations`, `/api/team`,
  `/api/my/rooms`, `/api/appointment-types`, `/api/appointment-blocks`,
  `/api/health-plans`). **Não** gateado: `/api/auth`, `/api/users`,
  `/api/doctors`, `/api/admin*` (admin de plataforma), `/api/version`,
  `/api/readiness`, `/api/subscription/*`, `/api/webhooks/kiwify`.
- `src/integrations/kiwify/` — `kiwify.types.ts` (payload cru), `kiwify.mapper.ts`
  (normaliza pra `NormalizedBillingEvent`), `kiwify.client.ts` (verificação de
  assinatura do webhook + montagem da URL de checkout + consulta best-effort
  de venda via API), `kiwify.service.ts` (processamento idempotente do
  webhook com transação).
- `src/routes/subscriptions.ts` — `GET /api/subscription/status`,
  `POST /api/subscription/checkout`, `POST /api/subscription/reconcile`.
- `src/routes/webhooks-kiwify.ts` — `POST /api/webhooks/kiwify` (público).
- `scripts/backfill-subscriptions.ts` — migração explícita para contas
  existentes (ver seção própria abaixo).
- Prisma: `DoctorSubscription`, `SubscriptionPayment`, `KiwifyWebhookEvent`,
  `SubscriptionCheckoutAttempt` (migration `20260713140000_add_kiwify_subscription`).
- Status da assinatura (`SubscriptionStatusValue`, TypeScript, não enum
  Postgres): `TRIAL`, `ACTIVE`, `PENDING_PAYMENT`, `PAST_DUE`, `CANCELED`,
  `BLOCKED`. `PENDING_PAYMENT` existe para o caso de Pix/boleto gerado e ainda
  não confirmado — `kiwify.service.ts` só rebaixa o tenant pra esse status se
  ele **já não tiver** acesso garantido no momento (trial ou período pago
  ainda vigentes, calculado em tempo real via `calculateClinicAccess`, não
  pelo rótulo gravado no banco).

### Frontend
- `src/hooks/useSubscription.ts` — consulta `/api/subscription/status`.
- `src/components/SubscriptionGate.tsx` — envolve **apenas o `<Outlet/>`**
  dentro de `<main>` em `Layout.tsx` (não o shell inteiro). Cabeçalho, menu
  lateral e botão de sair continuam sempre visíveis e funcionais mesmo com o
  tenant bloqueado — importante pro médico conseguir navegar até a cobrança e
  pra equipe conseguir sair da conta. Bloqueia apenas o conteúdo da página
  quando `accessAllowed=false`, exceto `/configuracoes/assinatura*`,
  `/configuracoes/perfil` (conta) e `/configuracoes/ajuda` (suporte), que
  ficam sempre acessíveis. Médico (responsável) vê CTA de assinar; secretária
  vê aviso pra contatar o responsável.
- `src/components/ui/TrialBanner.tsx` — banner de trial (últimos 3 dias),
  montado ao lado do `VersionUpdateBanner` em `Layout.tsx` (sempre visível,
  independente da rota).
- `src/pages/configuracoes/Assinatura.tsx` — status, preço, trial, histórico
  de pagamentos, botão "Assinar" (abre checkout da Kiwify em nova aba) e
  "Já realizei o pagamento" (reconciliação).
- `src/pages/configuracoes/AssinaturaPendente.tsx` — polling de status a cada
  7s, redireciona pro dashboard assim que `accessAllowed=true`.
- `src/lib/api.ts` — interceptor redireciona pra `/configuracoes/assinatura`
  em qualquer resposta `402 SUBSCRIPTION_REQUIRED`.

### Módulos removidos do produto (NFe, Teleconsulta, Avaliação)
NFe e Teleconsulta já tinham sido removidos numa entrega anterior (só existiam
como telas "em breve", sem integração real). Nesta entrega, **Avaliação**
(prontuário cognitivo — WISC-IV, WASI etc.) seguiu a mesma estratégia
incremental:
1. **Etapa 1 (feito)**: página `Avaliacoes.tsx` deletada, rota `/avaliacoes`
   removida do `App.tsx`, item removido do `Sidebar.tsx`.
2. **Etapa 2 (feito)**: rota `/api/assessments` desmontada em `src/index.ts`
   (comentário explica o porquê).
3. **Etapa 3 (feito)**: `src/routes/assessments.ts` e o model Prisma
   `Assessment`/tabela `TBLAVALIACAO` **continuam intactos**, só não são mais
   chamados por nada — reativar é só remontar a rota em `index.ts` e
   restaurar a página no frontend (o arquivo `Laudos.tsx`, órfão e não
   roteado, foi removido junto por ser do mesmo domínio).
4. **Etapa 4 (não feito, de propósito)**: remoção física da tabela/coluna só
   deve acontecer numa migration futura, depois de confirmar que ninguém
   precisa mais desses dados.

## Por que duas tabelas novas em vez de reaproveitar TBLASSINATURA

O sistema antigo de assinatura (MercadoPago, removido do código numa entrega
anterior) já criou as tabelas `TBLASSINATURA`/`TBLPAGAMENTOASSINATURA` em
produção, com colunas específicas do MercadoPago (`mpPaymentId`,
`billingCycle`, `adminNote` etc.) e sem conversão de tipo alguma pro Kiwify.
Reaproveitar essas tabelas exigiria uma migration de `ALTER COLUMN`/conversão
de dados que eu não consigo validar sem inspecionar o banco de produção ao
vivo. Para eliminar esse risco por completo, o sistema Kiwify usa tabelas
novas: `TBLASSINATURACLINICA` e `TBLPAGAMENTOCLINICA`. As tabelas antigas
continuam no banco, sem uso — sua limpeza é uma decisão separada e futura.

## Rollout seguro (feature flags)

```env
SUBSCRIPTION_FEATURE_ENABLED=true    # mostra a tela/banner de assinatura
SUBSCRIPTION_ENFORCEMENT_ENABLED=false  # true = bloqueia de verdade
KIWIFY_WEBHOOK_ENABLED=true
```

**`SUBSCRIPTION_ENFORCEMENT_ENABLED` vem `false` por padrão.** Enquanto isso,
o middleware `requireActiveSubscription` sempre libera a requisição — o
sistema todo (schema, endpoints, telas) pode ser publicado com segurança
antes mesmo de existir uma conta Kiwify configurada, sem bloquear ninguém.

Ordem recomendada de ativação:
1. Publicar backend + migration (`prisma migrate deploy`).
2. Rodar `scripts/backfill-subscriptions.ts` pras contas existentes (ver abaixo).
3. Configurar a conta Kiwify de verdade (checkout, produto, webhook).
4. Testar o fluxo de ponta a ponta com `SUBSCRIPTION_ENFORCEMENT_ENABLED=false`
   (nada é bloqueado, mas dá pra validar checkout/webhook/status).
5. Ativar `SUBSCRIPTION_ENFORCEMENT_ENABLED=true`.

## Migração de contas existentes

`scripts/backfill-subscriptions.ts` cria uma linha de assinatura só para
médicos que ainda não têm uma (contas criadas antes desta feature existir).
**Não roda automaticamente** — decida conscientemente o status:

```bash
# Grandfathering: acesso liberado sem data de expiração (recomendado para
# quem já usava a Clinic Pro antes da Kiwify existir)
BACKFILL_STATUS=ACTIVE npx tsx scripts/backfill-subscriptions.ts

# Ou: concede um novo trial de 7 dias a partir de agora
BACKFILL_STATUS=TRIAL npx tsx scripts/backfill-subscriptions.ts
```

## Configuração no painel da Kiwify

1. Cadastre o produto Clinic Pro (assinatura recorrente mensal, R$ 49,90) e
   copie o `KIWIFY_PRODUCT_ID`.
2. Configure o checkout com parâmetros de rastreamento (`s1`, `s2`, `s3`) —
   o backend já preenche isso automaticamente na URL gerada por
   `POST /api/subscription/checkout` (`kiwify.client.ts:buildKiwifyCheckoutUrl`).
3. Cadastre a URL do webhook: `https://SEU_DOMINIO/api/webhooks/kiwify`.
4. **Importante — verificar antes de ativar em produção**: o esquema exato de
   assinatura de webhook da Kiwify (header `x-kiwify-signature` vs. token na
   query string) e os nomes de campo do payload (`order_status`,
   `TrackingParameters.s1` etc., em `kiwify.types.ts`/`kiwify.mapper.ts`)
   foram montados a partir da documentação pública da Kiwify, sem um payload
   real em mãos. Assim que o primeiro webhook de teste chegar, comparar o
   payload real com `kiwify.types.ts` e ajustar o mapper se necessário.
5. Se for usar a reconciliação via API (`GET /api/subscription/reconcile`),
   configure `KIWIFY_CLIENT_ID`/`KIWIFY_CLIENT_SECRET`/`KIWIFY_API_BASE_URL`
   — sem eles, a reconciliação cai automaticamente no modo "aguardando
   webhook" (não quebra, só não confirma antecipadamente).

## Endpoints

| Método | Rota | Autenticação | Responsabilidade |
|---|---|---|---|
| GET | `/api/subscription/status` | qualquer papel | status atual + histórico |
| POST | `/api/subscription/checkout` | DOCTOR | gera URL de checkout Kiwify |
| POST | `/api/subscription/reconcile` | DOCTOR, rate-limited (15s) | verificação manual |
| POST | `/api/webhooks/kiwify` | segredo do webhook (não é sessão) | eventos de pagamento |

## Fluxo do webhook

Requisição → verifica assinatura (`KIWIFY_WEBHOOK_SECRET`) → mapeia pro
formato interno (`mapKiwifyWebhook`) → valida `KIWIFY_PRODUCT_ID` se
configurado → gera `eventKey` (`kiwify:{tipo}:{orderId}:{data}`) →
`kiwifyWebhookEvent` com essa chave única garante idempotência → transação
atualiza `SubscriptionPayment` + `DoctorSubscription` respeitando as
transições válidas de estado (`VALID_SUBSCRIPTION_TRANSITIONS`) → sempre
responde HTTP 200 (mesmo em duplicidade/erro) pra Kiwify não reenviar em loop.

## Como testar localmente

```bash
npm run dev
curl http://localhost:3001/api/subscription/status -H "Authorization: Bearer <token>"

# Simular um webhook (ajuste o secret e o payload conforme kiwify.types.ts)
curl -X POST http://localhost:3001/api/webhooks/kiwify \
  -H "Content-Type: application/json" \
  -H "x-kiwify-signature: <hmac-sha256-do-corpo>" \
  -d '{"order_id":"teste123","order_status":"paid","TrackingParameters":{"s1":"<doctorId>"}}'
```

## Como reverter

- Definir `SUBSCRIPTION_ENFORCEMENT_ENABLED=false` desbloqueia todo mundo
  imediatamente, sem precisar reverter migration nem dado nenhum.
- `SUBSCRIPTION_FEATURE_ENABLED=false` também esconde a consulta de status no
  frontend (o hook para de fazer polling).
- Nenhuma migration destrutiva foi criada — reverter o código não perde dados.

## Riscos e limitações conhecidas

- **Payload/assinatura da Kiwify não validados contra um evento real** — ver
  seção de configuração acima. Teste com uma compra de sandbox antes de
  confiar 100% no mapeamento.
- **Sem testes automatizados.** O projeto não tem framework de testes
  configurado (nem Jest/Vitest); adicionar um do zero é uma decisão maior
  que caberia numa entrega própria. A verificação desta entrega foi manual
  (type-check + smoke test dos endpoints).
- `GET /api/subscription/reconcile` via API da Kiwify é best-effort — sem
  `KIWIFY_CLIENT_ID`/`SECRET` configurados, ela não falha, só não confirma
  antecipadamente (o webhook continua sendo o caminho principal).
- O evento de automação `ASSESSMENT_COMPLETE` (chatbot) ficou órfão — não
  quebra nada, só nunca mais dispara, já que a rota de avaliações foi
  desmontada.
