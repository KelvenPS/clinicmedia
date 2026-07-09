// Fase 3, item 6 do plano: "Inserir modelo pronto" — cada modelo só cria
// blocos visíveis no Construtor (rascunho), nunca mensagens escondidas numa
// Ação do Sistema.

import { randomUUID } from 'crypto'
import { prisma } from './prisma'

export async function getOrCreateDraftVersion(chatbotId: string) {
  const existingDraft = await prisma.chatbotBuilderVersion.findFirst({
    where: { chatbotId, status: 'draft' },
    orderBy: { versionNumber: 'desc' },
  })
  if (existingDraft) return existingDraft

  const last = await prisma.chatbotBuilderVersion.findFirst({ where: { chatbotId }, orderBy: { versionNumber: 'desc' } })
  return prisma.chatbotBuilderVersion.create({
    data: { chatbotId, status: 'draft', versionNumber: (last?.versionNumber ?? 0) + 1 },
  })
}

export async function nextOrderIndex(versionId: string): Promise<number> {
  const last = await prisma.chatbotBlock.findFirst({ where: { versionId }, orderBy: { orderIndex: 'desc' } })
  return (last?.orderIndex ?? -1) + 1
}

interface TemplateBlockSpec {
  id: string
  type: string
  name: string
  config: any
}

interface BlockTemplate {
  key: string
  label: string
  description: string
  implemented: boolean
  build?: () => TemplateBlockSpec[]
}

function agendamentoCompletoBlocks(): TemplateBlockSpec[] {
  const ids = {
    inicio: randomUUID(), nome: randomUUID(), cpf: randomUUID(), servicos: randomUUID(),
    data: randomUUID(), horarios: randomUUID(), confirmar: randomUUID(), acao: randomUUID(),
    sucesso: randomUUID(), erro: randomUUID(), fim: randomUUID(),
  }
  return [
    { id: ids.inicio, type: 'welcome', name: 'Mensagem de início', config: {
      triggers: 'agendar, agendar consulta, marcar consulta',
      message: 'Olá, {nome}! Vamos agendar sua consulta.',
      nextBlockId: ids.nome,
    } },
    { id: ids.nome, type: 'collect_data', name: 'Coletar nome', config: {
      question: 'Qual seu nome completo?', saveTo: 'nome', dataType: 'texto',
      validation: { required: true }, errorBlockId: ids.nome, nextBlockId: ids.cpf,
    } },
    { id: ids.cpf, type: 'collect_data', name: 'Coletar CPF', config: {
      question: 'Informe seu CPF (apenas números).', saveTo: 'cpf', dataType: 'cpf',
      validation: { required: true }, errorBlockId: ids.cpf, nextBlockId: ids.servicos,
    } },
    { id: ids.servicos, type: 'menu_dynamic', name: 'Menu dinâmico de serviços', config: {
      message: 'Escolha o serviço desejado:', actionKey: 'list_services', optionsField: 'services',
      labelField: 'name', saveTo: 'servicoId', saveLabelTo: 'servicoNome', errorBlockId: ids.servicos, nextBlockId: ids.data,
    } },
    { id: ids.data, type: 'collect_data', name: 'Coletar data desejada', config: {
      question: 'Qual a melhor data ou período? (ex: amanhã, sexta-feira, próxima semana à tarde)',
      saveTo: 'dataDesejada', dataType: 'texto', validation: { required: true }, errorBlockId: ids.data, nextBlockId: ids.horarios,
    } },
    { id: ids.horarios, type: 'menu_dynamic', name: 'Menu dinâmico de horários', config: {
      message: 'Escolha um horário disponível:', actionKey: 'list_available_slots',
      inputsMap: { dataDesejada: '{dataDesejada}' }, optionsField: 'slots', labelField: 'label',
      saveTo: 'horarioEscolhido', saveFieldsMap: { horarioInicio: 'startAt', horarioFim: 'endAt' },
      errorBlockId: ids.data, nextBlockId: ids.confirmar,
    } },
    { id: ids.confirmar, type: 'confirm_data', name: 'Confirmar dados', config: {
      message: 'Confira os dados:\nNome: {nome}\nServiço: {servicoNome}\nHorário: {horarioEscolhido}\n\n1 - Confirmar\n2 - Alterar',
      yesBlockId: ids.acao, noBlockId: ids.servicos,
    } },
    { id: ids.acao, type: 'system_action', name: 'Executar ação: Criar agendamento', config: {
      actionKey: 'create_appointment',
      inputsMap: { nome: '{nome}', telefone: '{telefone}', cpf: '{cpf}', servicoId: '{servicoId}', startAt: '{horarioInicio}', endAt: '{horarioFim}' },
      successBlockId: ids.sucesso, errorBlockId: ids.erro,
    } },
    { id: ids.sucesso, type: 'success_message', name: 'Mensagem de sucesso', config: {
      message: 'Sua consulta foi agendada com sucesso!\nProtocolo: {protocolo}', nextBlockId: ids.fim,
    } },
    { id: ids.erro, type: 'error_message', name: 'Mensagem de erro', config: {
      message: 'Não foi possível concluir seu agendamento agora. Nossa equipe entrará em contato para te ajudar.', nextBlockId: ids.fim,
    } },
    { id: ids.fim, type: 'end', name: 'Encerrar conversa', config: {} },
  ]
}

function preAgendamentoSimplesBlocks(): TemplateBlockSpec[] {
  const ids = { inicio: randomUUID(), nome: randomUUID(), telefone: randomUUID(), acao: randomUUID(), sucesso: randomUUID(), fim: randomUUID() }
  return [
    { id: ids.inicio, type: 'welcome', name: 'Mensagem de início', config: {
      triggers: 'oi, ola, olá, agendar', message: 'Olá, {nome}! Vamos registrar seu interesse em agendar.', nextBlockId: ids.nome,
    } },
    { id: ids.nome, type: 'collect_data', name: 'Coletar nome', config: {
      question: 'Qual seu nome completo?', saveTo: 'nome', dataType: 'texto', validation: { required: true }, errorBlockId: ids.nome, nextBlockId: ids.telefone,
    } },
    { id: ids.telefone, type: 'collect_data', name: 'Coletar telefone', config: {
      question: 'Informe um telefone para contato.', saveTo: 'telefone', dataType: 'telefone', validation: { required: true }, errorBlockId: ids.telefone, nextBlockId: ids.acao,
    } },
    { id: ids.acao, type: 'system_action', name: 'Executar ação: Criar pré-agendamento', config: {
      actionKey: 'create_pre_scheduling', inputsMap: { nome: '{nome}', telefone: '{telefone}' }, successBlockId: ids.sucesso, errorBlockId: ids.sucesso,
    } },
    { id: ids.sucesso, type: 'success_message', name: 'Mensagem de sucesso', config: {
      message: 'Recebemos seu interesse, {nome}! Protocolo: {protocolo}. Nossa equipe entrará em contato para confirmar o melhor horário.', nextBlockId: ids.fim,
    } },
    { id: ids.fim, type: 'end', name: 'Encerrar conversa', config: {} },
  ]
}

function atendimentoForaDoHorarioBlocks(): TemplateBlockSpec[] {
  const ids = { offHours: randomUUID(), fim: randomUUID() }
  return [
    { id: ids.offHours, type: 'off_hours', name: 'Fora do horário', config: {
      triggers: 'oi, ola, olá, menu, agendar',
      message: 'No momento estamos fora do horário de atendimento. Deixe seu nome e telefone que retornaremos assim que possível.',
      nextBlockId: ids.fim,
    } },
    { id: ids.fim, type: 'end', name: 'Encerrar conversa', config: {} },
  ]
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { key: 'agendamento_completo', label: 'Agendamento completo', description: 'Coleta nome, CPF, serviço e horário, e cria o agendamento.', implemented: true, build: agendamentoCompletoBlocks },
  { key: 'pre_agendamento_simples', label: 'Pré-agendamento simples', description: 'Coleta nome e telefone e registra o interesse para contato posterior.', implemented: true, build: preAgendamentoSimplesBlocks },
  { key: 'atendimento_fora_horario', label: 'Atendimento fora do horário', description: 'Mensagem padrão para quando a clínica está fechada.', implemented: true, build: atendimentoForaDoHorarioBlocks },
  { key: 'confirmacao_consulta', label: 'Confirmação de consulta', description: 'Em breve.', implemented: false },
  { key: 'cancelamento_consulta', label: 'Cancelamento de consulta', description: 'Em breve.', implemented: false },
  { key: 'atualizacao_cadastral', label: 'Atualização cadastral', description: 'Em breve.', implemented: false },
  { key: 'solicitacao_documentos', label: 'Solicitação de documentos', description: 'Em breve.', implemented: false },
]

export async function applyBlockTemplate(chatbotId: string, key: string): Promise<{ createdBlockIds: string[] }> {
  const template = BLOCK_TEMPLATES.find(t => t.key === key)
  if (!template || !template.implemented || !template.build) {
    throw new Error('Modelo não encontrado ou ainda não disponível')
  }

  const version = await getOrCreateDraftVersion(chatbotId)
  let orderIndex = await nextOrderIndex(version.id)
  const specs = template.build()

  const created = await prisma.$transaction(
    specs.map(spec => prisma.chatbotBlock.create({
      data: { id: spec.id, versionId: version.id, chatbotId, type: spec.type, name: spec.name, orderIndex: orderIndex++, config: spec.config },
    }))
  )

  return { createdBlockIds: created.map(b => b.id) }
}
