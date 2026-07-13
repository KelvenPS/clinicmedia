# Deploy seguro e anti-cache — ClinIQ Pro

## Problema anterior

`deploy.sh` rodava `docker compose up -d --force-recreate`, que reinicia **todos** os containers
(incluindo `postgres`) a cada publicação, mesmo quando só a imagem do backend ou do frontend
mudou. Isso causava reconexões desnecessárias do banco, quedas/reconexões dos sockets do
WhatsApp, e uma janela maior de indisponibilidade do que o necessário. Além disso, o frontend
(SPA em Vite) não tinha nenhuma forma de saber que uma nova versão foi publicada — um usuário
com a aba aberta continuava rodando o JavaScript antigo até dar F5 manualmente.

## O que foi implementado

Esta stack é **Vite + React (SPA) + Express + Prisma**, com um único container de backend e um
de frontend atrás de um Nginx — não Next.js, e sem Blue-Green (não há réplicas nem Redis hoje).
A solução foi dimensionada para essa realidade:

### 1. Identificador de versão

Cada build recebe `RELEASE_SHA` (hash curto do commit) e `BUILD_DATE`, gerados pelo `deploy.sh`
e passados como build args do Docker:

- Backend: `APP_VERSION` / `BUILD_DATE` (env vars, ver `packages/backend/src/lib/app-version.ts`)
- Frontend: `VITE_APP_VERSION`, embutido no bundle em tempo de build (ver
  `packages/frontend/src/lib/version.ts`)

### 2. Endpoints de versão e saúde

- `GET /api/version` — `{ version, buildDate, environment }`, sem cache
  (`Cache-Control: no-store, no-cache, must-revalidate, max-age=0`).
- `GET /api/readiness` — roda `SELECT 1` no banco via Prisma; 200 se ok, 503 se não.
- `GET /api/health` — já existia; passou a incluir `version` na resposta.

### 3. Aviso de nova versão no frontend

`useAppVersion` (`packages/frontend/src/hooks/useAppVersion.ts`) consulta `/api/version` a cada
90s (configurável via `VITE_VERSION_CHECK_INTERVAL_MS`) e ao voltar o foco da aba, comparando
com a versão embutida no build atual. Quando diferente, `VersionUpdateBanner`
(`packages/frontend/src/components/system/VersionUpdateBanner.tsx`) exibe uma faixa no topo
(mesmo padrão visual do `TrialBanner`), com "Atualizar agora" e "Lembrar depois".

Se houver alterações não salvas (`useUnsavedChangesStore`, ver abaixo), "Atualizar agora" abre
um modal de confirmação antes de recarregar.

### 4. Alterações não salvas

`packages/frontend/src/store/unsavedChangesStore.ts` (Zustand, seguindo o padrão já usado em
`authStore.ts`) expõe `hasUnsavedChanges` / `setHasUnsavedChanges`. Qualquer tela pode chamar
`setHasUnsavedChanges(true)` ao detectar edição e `setHasUnsavedChanges(false)` ao salvar.
`useUnsavedChangesGuard` (montado uma vez em `Layout.tsx`) ativa um `beforeunload` só enquanto
houver alterações pendentes.

**Nota:** por enquanto nenhuma tela chama `setHasUnsavedChanges` ainda — o mecanismo está pronto
para ser adotado progressivamente nos formulários de prontuário, paciente, agendamento etc.

### 5. Recuperação de erro de asset desatualizado

- `ErrorBoundary` (`packages/frontend/src/components/system/ErrorBoundary.tsx`) envolve `<App />`
  em `main.tsx`. Ao capturar um erro, verifica se é um erro típico de chunk desatualizado
  (`chunkErrorRecovery.ts`) e recarrega a página **uma única vez** (controlado via
  `sessionStorage`, chave por versão, evitando loop). Se não resolver, mostra uma tela de
  recuperação sem stack trace.
- `installChunkErrorListeners()` (chamado em `main.tsx`) captura falhas de carregamento de
  `<script>`/`<link>` de `/assets/*` e rejeições de `import()` dinâmico, aplicando a mesma
  recuperação — mesmo sem nenhuma rota lazy-loaded hoje, isso protege caso alguma seja
  adicionada no futuro.

### 6. Cache HTTP

- `nginx.frontend.conf`: `index.html` agora envia `Cache-Control: no-cache, must-revalidate`
  (antes não tinha header nenhum, podendo ficar em cache heurístico do navegador e apontar para
  JS/CSS antigos). Assets com hash em `/assets/*` continuam com `public, immutable` por 1 ano —
  isso já era seguro porque o Vite gera nomes com hash de conteúdo.
- `/api/version` responde sempre sem cache (ver acima).

### 7. Deploy sem derrubar tudo

`deploy.sh` não usa mais `--force-recreate`. `docker compose up -d` recria apenas os containers
cuja imagem realmente mudou — na prática, `backend` e/ou `frontend` quando o código muda;
`postgres` e `nginx` ficam intocados na maioria dos deploys. Um smoke test final confere
`/api/version` para garantir que a versão publicada é a esperada.

## Fora de escopo (decisão consciente)

Não implementamos, porque não fazem sentido para uma stack de instância única sem Redis:

- Blue-Green real (containers duplicados + troca de upstream no Nginx)
- `WHATSAPP_WORKER_ENABLED` / lock distribuído entre instâncias (só existe 1 backend)
- Service worker / PWA (não existe hoje, nada a limpar)
- Expand-and-contract formal de migrations Prisma (aplicável quando houver de fato dois
  releases de API coexistindo — hoje o deploy é sequencial e rápido o bastante para não
  precisar dessa disciplina completa)

Se o produto crescer para múltiplas instâncias de backend, revisitar esses itens — em especial
o lock de sessões do WhatsApp (`packages/backend/src/lib/room-whatsapp.ts`), que hoje só
garante exclusividade dentro de um único processo.

## Variáveis de ambiente

Raiz (`.env`, ver `.env.example`):
```
RELEASE_SHA=development   # gerado automaticamente pelo deploy.sh
BUILD_DATE=               # gerado automaticamente pelo deploy.sh
```

Frontend (`packages/frontend/.env`, ver `.env.example` — só relevante em dev local):
```
VITE_APP_VERSION=development
VITE_VERSION_UPDATE_ENABLED=true
VITE_VERSION_CHECK_INTERVAL_MS=90000
```

## Como publicar

Sem mudanças no fluxo do operador:
```bash
bash deploy.sh
```
O script agora: gera `RELEASE_SHA`/`BUILD_DATE` a partir do commit atual → builda as imagens →
`docker compose up -d` (só recria o que mudou) → espera o backend ficar healthy → confere
`/api/version`.

## Como testar

**Local:**
```bash
npm run dev
curl http://localhost:3001/api/version
curl http://localhost:3001/api/readiness
```
Para simular uma "nova versão" no frontend, rode com `VITE_APP_VERSION=teste-local` num
`.env.local` do frontend e observe o banner aparecer (a API precisa responder uma versão
diferente — pode-se setar `APP_VERSION` do backend também).

**Produção (após deploy):**
```bash
curl http://2.25.185.223/api/version
curl http://2.25.185.223/api/readiness
docker compose ps   # confirmar que postgres/nginx não reiniciaram desnecessariamente
```

## Como reverter

Não há rollback automático de infraestrutura (não há Blue-Green). Para reverter uma versão:
```bash
git revert <commit-problemático>   # ou: git checkout <commit-anterior>
bash deploy.sh
```
Migrations do Prisma não devem ser destrutivas no mesmo deploy que o código que as usa —
adicionar colunas/tabelas antes de remover uso do campo antigo em um deploy futuro.

## Riscos restantes

- Ainda há uma janela curta (segundos) de indisponibilidade do backend durante seu próprio
  restart, porque só existe um container — zero-downtime completo exigiria Blue-Green.
- Nenhuma tela chama `setHasUnsavedChanges` ainda; o mecanismo existe mas precisa ser adotado
  formulário por formulário.
- Sem observability/métricas dedicadas para erros de chunk ou versões desatualizadas em uso —
  hoje só há `console.error`.

## Melhorias futuras

- Adotar `setHasUnsavedChanges` nos formulários críticos (prontuário, paciente, agendamento,
  financeiro).
- Se o produto migrar para múltiplas instâncias de backend: Blue-Green completo, lock de
  WhatsApp entre processos, e expand-and-contract formal de migrations.
- Métricas de quantos usuários estão em versão desatualizada e quantos erros de chunk ocorrem.
