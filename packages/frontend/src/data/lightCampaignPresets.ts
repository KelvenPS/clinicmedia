// Textos prontos por evento — usados no botão "Usar texto pronto" da tela
// Campanhas, para o médico não precisar criar um Template do zero antes de
// ativar uma automação. O texto criado fica editável normalmente depois.

export interface CampaignPreset {
  module: string
  triggerEvent: string
  name: string
  category: string
  content: string
}

export const LIGHT_CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    module: 'agenda',
    triggerEvent: 'APPOINTMENT_CONFIRMATION',
    name: 'Confirmação de agendamento',
    category: 'agenda',
    content: 'Olá {nome}! Sua consulta com {medico} foi agendada para {data} às {hora}, em {endereco}. Qualquer dúvida, estou à disposição!',
  },
  {
    module: 'agenda',
    triggerEvent: 'APPOINTMENT_REMINDER_24H',
    name: 'Lembrete 24h antes da consulta',
    category: 'agenda',
    content: 'Olá {nome}, passando para lembrar que sua consulta é amanhã, dia {data} às {hora}, em {endereco}. Caso precise remarcar, nos avise com antecedência.',
  },
  {
    module: 'agenda',
    triggerEvent: 'APPOINTMENT_REMINDER_2H',
    name: 'Lembrete 2h antes da consulta',
    category: 'agenda',
    content: 'Olá {nome}, sua consulta é hoje às {hora}, em {endereco}. Até já!',
  },
  {
    module: 'pacientes',
    triggerEvent: 'NEW_PATIENT_WELCOME',
    name: 'Boas-vindas ao novo paciente',
    category: 'pacientes',
    content: 'Olá {nome}, seja bem-vindo(a)! Ficamos felizes em ter você como paciente. Qualquer dúvida, estamos à disposição por aqui.',
  },
  {
    module: 'prontuario',
    triggerEvent: 'POST_CONSULTATION_SUMMARY',
    name: 'Resumo após consulta',
    category: 'prontuario',
    content: 'Olá {nome}, obrigado pela consulta de hoje com {medico}. As orientações ficam disponíveis no seu prontuário: {prontuario}',
  },
  {
    module: 'avaliacao',
    triggerEvent: 'ASSESSMENT_COMPLETE',
    name: 'Avaliação disponível',
    category: 'avaliacao',
    content: 'Olá {nome}, sua avaliação já está disponível. Acesse pelo link: {prontuario}',
  },
  {
    module: 'financeiro',
    triggerEvent: 'PAYMENT_REMINDER',
    name: 'Lembrete de pagamento pendente',
    category: 'financeiro',
    content: 'Olá {nome}, lembramos que o pagamento no valor de R$ {valor} está próximo do vencimento. Link para pagamento: {link}',
  },
  {
    module: 'financeiro',
    triggerEvent: 'PAYMENT_OVERDUE',
    name: 'Aviso de pagamento em atraso',
    category: 'financeiro',
    content: 'Olá {nome}, identificamos que o pagamento no valor de R$ {valor} está em atraso. Link para regularizar: {link}',
  },
  {
    module: 'documentos',
    triggerEvent: 'DOCUMENT_SENT',
    name: 'Documento gerado para o paciente',
    category: 'documentos',
    content: 'Olá {nome}, o documento "{documento}" já está disponível. Você pode acessá-lo pelo prontuário: {prontuario}',
  },
]

export function findCampaignPreset(module: string, triggerEvent: string): CampaignPreset | undefined {
  return LIGHT_CAMPAIGN_PRESETS.find(p => p.module === module && p.triggerEvent === triggerEvent)
}
