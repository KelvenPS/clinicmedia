const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    name: 'Agendamento Automático',
    description: 'Permite ao paciente agendar, cancelar e remarcar consultas automaticamente',
    category: 'APPOINTMENT',
    icon: 'calendar',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo ao agendamento automático. Como posso ajudar?' } },
      { id: 'menu', type: 'menu', x: 160, y: 290, data: { label: 'Menu principal', text: 'Escolha uma opção:', options: ['Agendar consulta', 'Cancelar consulta', 'Remarcar consulta'] } },
      { id: 'schedule', type: 'message', x: 20, y: 470, data: { label: 'Agendar', text: 'Por favor, informe a data desejada (DD/MM/AAAA):' } },
      { id: 'cancel', type: 'message', x: 230, y: 470, data: { label: 'Cancelar', text: 'Informe o número da sua consulta para cancelamento:' } },
      { id: 'reschedule', type: 'message', x: 440, y: 470, data: { label: 'Remarcar', text: 'Informe o número da consulta e a nova data desejada:' } },
      { id: 'end', type: 'end', x: 270, y: 620, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'menu' },
      { id: 'e3', source: 'menu', sourcePort: 0, target: 'schedule' },
      { id: 'e4', source: 'menu', sourcePort: 1, target: 'cancel' },
      { id: 'e5', source: 'menu', sourcePort: 2, target: 'reschedule' },
      { id: 'e6', source: 'schedule', sourcePort: 0, target: 'end' },
      { id: 'e7', source: 'cancel', sourcePort: 0, target: 'end' },
      { id: 'e8', source: 'reschedule', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Captação de Leads',
    description: 'Coleta dados do paciente interessado e adiciona à lista de espera',
    category: 'LEAD',
    icon: 'user-plus',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Ficamos felizes com seu interesse. Qual é o seu nome completo?' } },
      { id: 'ask_phone', type: 'message', x: 170, y: 290, data: { label: 'Solicitar telefone', text: 'Qual é o melhor telefone para contato?' } },
      { id: 'ask_reason', type: 'message', x: 170, y: 430, data: { label: 'Motivo da consulta', text: 'Qual é o motivo da consulta ou qual especialidade você busca?' } },
      { id: 'confirm', type: 'message', x: 170, y: 570, data: { label: 'Confirmação', text: 'Obrigado! Seus dados foram registrados. Nossa equipe entrará em contato em breve.' } },
      { id: 'end', type: 'end', x: 270, y: 710, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'ask_phone' },
      { id: 'e3', source: 'ask_phone', sourcePort: 0, target: 'ask_reason' },
      { id: 'e4', source: 'ask_reason', sourcePort: 0, target: 'confirm' },
      { id: 'e5', source: 'confirm', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Lembrete de Consulta',
    description: 'Envia lembretes automáticos 24h e 2h antes das consultas',
    category: 'REMINDER',
    icon: 'bell',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'reminder_24h', type: 'message', x: 170, y: 150, data: { label: 'Lembrete 24h', text: 'Olá, {{nome}}! Lembramos que você tem uma consulta amanhã, {{data}} às {{hora}}. Responda SIM para confirmar ou NÃO para cancelar.' } },
      { id: 'menu', type: 'menu', x: 160, y: 290, data: { label: 'Verificar resposta', text: 'O paciente respondeu:', options: ['Confirmar consulta', 'Cancelar consulta'] } },
      { id: 'confirmed', type: 'message', x: 60, y: 470, data: { label: 'Confirmada', text: 'Consulta confirmada! Te esperamos amanhã. Em caso de dúvidas, entre em contato.' } },
      { id: 'cancelled', type: 'message', x: 290, y: 470, data: { label: 'Cancelada', text: 'Consulta cancelada. Se precisar reagendar, entre em contato conosco.' } },
      { id: 'reminder_2h', type: 'message', x: 60, y: 610, data: { label: 'Lembrete 2h', text: 'Olá, {{nome}}! Sua consulta é hoje às {{hora}}. Aguardamos você!' } },
      { id: 'end', type: 'end', x: 270, y: 760, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'reminder_24h' },
      { id: 'e2', source: 'reminder_24h', sourcePort: 0, target: 'menu' },
      { id: 'e3', source: 'menu', sourcePort: 0, target: 'confirmed' },
      { id: 'e4', source: 'menu', sourcePort: 1, target: 'cancelled' },
      { id: 'e5', source: 'confirmed', sourcePort: 0, target: 'reminder_2h' },
      { id: 'e6', source: 'reminder_2h', sourcePort: 0, target: 'end' },
      { id: 'e7', source: 'cancelled', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Atendimento Inicial',
    description: 'Recepciona o paciente e direciona para o atendimento correto',
    category: 'WELCOME',
    icon: 'message-circle',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo à nossa clínica. Como posso ajudar?' } },
      { id: 'router', type: 'menu', x: 150, y: 290, data: { label: 'Direcionar', text: 'Selecione uma opção:', options: ['Agendar consulta', 'Informações sobre planos', 'Resultados de exames', 'Falar com atendente'] } },
      { id: 'schedule', type: 'message', x: 0, y: 500, data: { label: 'Agendamento', text: 'Vou te direcionar para o agendamento. Um momento...' } },
      { id: 'plans', type: 'message', x: 170, y: 500, data: { label: 'Planos', text: 'Trabalhamos com os principais planos de saúde. Qual plano você possui?' } },
      { id: 'exams', type: 'message', x: 340, y: 500, data: { label: 'Exames', text: 'Para acessar resultados de exames, acesse nosso portal ou fale com a recepção.' } },
      { id: 'human', type: 'queue', x: 510, y: 500, data: { label: 'Atendente', text: 'Transferindo para um atendente. Aguarde um momento...' } },
      { id: 'end', type: 'end', x: 270, y: 660, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'router' },
      { id: 'e3', source: 'router', sourcePort: 0, target: 'schedule' },
      { id: 'e4', source: 'router', sourcePort: 1, target: 'plans' },
      { id: 'e5', source: 'router', sourcePort: 2, target: 'exams' },
      { id: 'e6', source: 'router', sourcePort: 3, target: 'human' },
      { id: 'e7', source: 'schedule', sourcePort: 0, target: 'end' },
      { id: 'e8', source: 'plans', sourcePort: 0, target: 'end' },
      { id: 'e9', source: 'exams', sourcePort: 0, target: 'end' },
      { id: 'e10', source: 'human', sourcePort: 0, target: 'end' },
    ],
  },
];

async function main() {
  const count = await prisma.chatbotTemplate.count();
  if (count === 0) {
    await prisma.chatbotTemplate.createMany({
      data: DEFAULT_TEMPLATES.map(t => ({
        ...t,
        nodes: t.nodes,
        edges: t.edges,
      })),
    });
    console.log('Seeded templates.');
  } else {
    console.log('Templates already exist.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
