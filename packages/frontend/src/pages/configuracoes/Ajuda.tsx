import { HelpCircle, MessageCircle, Mail, Phone, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

const faqs = [
  { q: 'Como cadastrar um novo paciente?', a: 'Acesse "Pacientes" no menu lateral, clique em "Novo Paciente" e preencha os dados. Você pode vincular planos de saúde diretamente no cadastro.' },
  { q: 'Como agendar uma consulta?', a: 'Na tela de Agenda, clique em qualquer slot horário disponível ou no botão "Novo Agendamento". Selecione o paciente, médico, data e horário.' },
  { q: 'A secretária pode ver o financeiro?', a: 'Não. O módulo Financeiro é restrito a médicos e administradores. Secretárias têm acesso apenas à agenda e cadastro de pacientes.' },
  { q: 'Como cadastrar planos de convênio?', a: 'Acesse "Configurações > Planos de Saúde". Crie os planos com o tipo "Convênio". No cadastro do paciente, vincule o plano e informe o número da carteirinha.' },
  { q: 'Como criar um prontuário?', a: 'Acesse "Prontuário" no menu lateral, selecione um paciente, escolha o médico e clique em "Novo Registro". Preencha o tipo (Anamnese, Evolução, etc.) e o conteúdo.' },
  { q: 'Como alterar minha senha?', a: 'Acesse "Configurações > Meu Perfil" e preencha o campo "Nova Senha". Clique em "Salvar Alterações".' },
  { q: 'Posso ter mais de um médico cadastrado?', a: 'Sim. Um administrador pode cadastrar quantos médicos forem necessários em "Configurações > Usuários". Cada médico verá apenas sua própria agenda e financeiro.' },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-medium text-slate-900 text-sm pr-4">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 bg-slate-50 border-t border-slate-200">
          <p className="text-sm text-slate-600 leading-relaxed pt-3">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function Ajuda() {
  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Ajuda & Suporte</h1>
        <p className="page-subtitle">Encontre respostas para suas dúvidas</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          Perguntas Frequentes
        </h2>
        {faqs.map((item, i) => <FAQItem key={i} {...item} />)}
      </div>

      <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <h2 className="font-semibold text-blue-900 mb-4">Ainda precisa de ajuda?</h2>
        <div className="space-y-3">
          {[
            { icon: MessageCircle, label: 'Chat ao vivo', desc: 'Suporte em tempo real', color: 'text-blue-600 bg-blue-100' },
            { icon: Mail, label: 'Email', desc: 'suporte@agendaclinica.com.br', color: 'text-emerald-600 bg-emerald-100' },
            { icon: Phone, label: 'Telefone', desc: '(11) 4004-0000 · Seg-Sex 8h-18h', color: 'text-purple-600 bg-purple-100' },
          ].map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-blue-100">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color.split(' ')[1]}`}>
                <Icon className={`w-5 h-5 ${color.split(' ')[0]}`} />
              </div>
              <div>
                <p className="font-medium text-slate-900 text-sm">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
