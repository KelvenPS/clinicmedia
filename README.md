# 🏥 Agenda Clínica

Sistema completo de gestão para clínicas médicas com agendamento, controle de pacientes e financeiro.

## ✨ Funcionalidades

| Módulo | Admin | Médico | Secretária |
|--------|-------|--------|-----------|
| Dashboard | ✅ | ✅ | ✅ |
| Agenda | ✅ | ✅ (própria) | ✅ |
| Pacientes | ✅ | ✅ | ✅ |
| Financeiro | ✅ | ✅ (próprio) | ❌ |
| Usuários | ✅ | ❌ | ❌ |

## 🚀 Instalação

### Pré-requisitos
- Node.js 18+
- npm 9+

### Setup completo (primeira vez)

```bash
# Clone e instale tudo
npm install
npm install -w packages/backend
npm install -w packages/frontend

# Configure o banco de dados
cd packages/backend
npx prisma db push
npx tsx prisma/seed.ts
cd ../..
```

### Rodar em desenvolvimento

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Banco Prisma Studio**: `cd packages/backend && npx prisma studio`

## 🔑 Credenciais de Acesso

| Perfil | Email | Senha |
|--------|-------|-------|
| Administrador | admin@clinica.com | admin123 |
| Médico (Dr. Carlos) | dr.silva@clinica.com | doctor123 |
| Médico (Dra. Ana) | dra.santos@clinica.com | doctor123 |
| Secretária | secretaria@clinica.com | secretary123 |

## 🛠️ Stack Tecnológica

### Backend
- **Node.js + Express** — API REST
- **TypeScript** — Tipagem estática
- **Prisma + SQLite** — ORM e banco de dados
- **JWT + bcryptjs** — Autenticação e senhas
- **Zod** — Validação de dados

### Frontend
- **React 18 + Vite** — UI e build
- **TypeScript** — Tipagem
- **Tailwind CSS** — Estilização
- **TanStack Query** — Cache e estados de servidor
- **Zustand** — Estado global (autenticação)
- **React Hook Form + Zod** — Formulários
- **Recharts** — Gráficos financeiros
- **date-fns** — Manipulação de datas
- **lucide-react** — Ícones
- **react-hot-toast** — Notificações

## 📁 Estrutura

```
agenda-katiane/
├── packages/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── routes/       # auth, users, appointments, patients, financial, doctors
│   │       ├── middleware/   # auth, requireRole
│   │       ├── utils/        # jwt
│   │       └── index.ts
│   └── frontend/
│       └── src/
│           ├── pages/        # Login, Dashboard, Agenda, Financeiro, Usuarios, Pacientes
│           ├── components/   # Layout, Sidebar, modais, formulários
│           ├── store/        # authStore (Zustand)
│           ├── lib/          # api (axios), queryClient
│           └── types/        # TypeScript types
└── package.json
```

## 🔒 Segurança

- JWT com expiração de 7 dias
- Senhas hasheadas com bcrypt (salt 10)
- Middleware de autenticação em todas as rotas protegidas
- RBAC (Role-Based Access Control) por rota
- Secretárias **bloqueadas** do módulo financeiro (HTTP 403)

## 📈 Próximos passos (sugestões)

- [ ] Notificações por WhatsApp/SMS (Twilio)
- [ ] Exportação de relatórios PDF
- [ ] Agendamento online para pacientes
- [ ] Dashboard com mais métricas
- [ ] Suporte a múltiplas clínicas
- [ ] App mobile (React Native)
