# Changelog

Todas as mudanças notáveis do **ClinIQ Pro** são documentadas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.0.0] — 2026-06-09

### Release inicial da plataforma

#### Infraestrutura
- Docker Compose com PostgreSQL 16, Node.js 20 (Alpine) e Nginx
- Multi-stage Dockerfile para backend e frontend (imagens otimizadas)
- Prisma ORM com suporte a migrações e seeds
- CI/CD com GitHub Actions:
  - Branch `develop` → validação de build (homologação)
  - Branch `main` → build + deploy automático para VPS Hostinger

#### Autenticação & Autorização
- JWT com refresh e expiração configurável
- Roles: `ADMIN`, `DOCTOR`, `SECRETARY`
- Reset de senha via token
- Multi-tenant: cada médico acessa apenas seus próprios dados

#### Pacientes
- Cadastro completo com foto, endereço, CPF, RG e plano de saúde
- Isolamento por médico — secretárias vinculadas ao médico cadastram em nome dele
- Admin pode reatribuir pacientes entre médicos

#### Agenda & Consultas
- Agendamento com sala, médico e status
- Bloqueios de horário por médico
- Estatísticas do dashboard filtradas por médico autenticado

#### Planos de Saúde
- Planos por médico (PARTICULAR, CONVÊNIO, OUTROS)
- Percentual de desconto e valor padrão configuráveis
- Vínculo de plano por paciente (PatientPlan)

#### Prontuário & Avaliações
- Prontuários vinculados a consultas e médico
- Templates de avaliação psicológica (WISC-IV, WASI, WAIS-III, RAVLT, Cognitiva)
- Templates de documentos por médico

#### Financeiro
- Registro de transações vinculadas a consultas
- Métodos de pagamento por médico

#### Equipe & Usuários
- Vínculo médico-secretária (DoctorSecretary)
- Gerenciamento de salas com atribuição a secretárias
- Perfil de usuário com dados profissionais e Registro Profissional

#### Admin — Gestão de Dados
- Painel do super admin com visão geral da plataforma
- Listagem de pacientes com filtro por médico ou órfãos
- Migração automática de pacientes sem médico via histórico de consultas
- Reatribuição manual de pacientes por médico

#### WhatsApp & Chatbot (estrutura)
- Instância WhatsApp por médico
- Fluxos e templates de chatbot
- Histórico de conversas e mensagens

#### Notificações & Integrações
- Sistema de notificações in-app
- Registro de integrações (WhatsApp, Google Calendar, Google Gmail, Webhook, AI Agent)
- Assinatura por médico (DoctorSubscription)
