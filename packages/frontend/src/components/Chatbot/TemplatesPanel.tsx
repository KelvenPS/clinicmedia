import { Loader2, ArrowUpRight, Calendar, Target, Bell, Handshake } from 'lucide-react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type Template,
  templateCategoryColors,
  templateCategoryLabels,
} from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  onUseTemplate: (tpl: Template) => void
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  APPOINTMENT: <Calendar className="w-6 h-6" />,
  LEAD: <Target className="w-6 h-6" />,
  REMINDER: <Bell className="w-6 h-6" />,
  WELCOME: <Handshake className="w-6 h-6" />,
}

const CATEGORY_ICON_BG: Record<string, string> = {
  APPOINTMENT: 'bg-blue-500/10 text-blue-500',
  LEAD: 'bg-emerald-500/10 text-emerald-500',
  REMINDER: 'bg-amber-500/10 text-amber-500',
  WELCOME: 'bg-violet-500/10 text-violet-500',
}

export default function TemplatesPanel({ onUseTemplate }: Props) {
  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['chatbot-templates'],
    queryFn: () => api.get('/chatbot/templates').then(r => r.data),
    retry: 1,
  })

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Templates de Fluxo</h2>
        <p className="text-sm text-slate-500 mt-1">
          Comece rapidamente com um template pré-configurado para sua clínica.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <Calendar className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Nenhum template cadastrado</p>
            <p className="text-xs text-slate-400 mt-1">
              Templates globais aparecerão aqui quando cadastrados no sistema.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${CATEGORY_ICON_BG[tpl.category] ?? 'bg-slate-100 text-slate-500'}`}>
                  {CATEGORY_ICONS[tpl.category]}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${templateCategoryColors[tpl.category] ?? 'bg-slate-100 text-slate-500'}`}>
                  {templateCategoryLabels[tpl.category] ?? tpl.category}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800 mb-1">{tpl.name}</h3>
                {tpl.description && (
                  <p className="text-xs text-slate-500 leading-relaxed">{tpl.description}</p>
                )}
              </div>
              <button
                onClick={() => onUseTemplate(tpl)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 group-hover:bg-cyan-500 text-slate-600 group-hover:text-white border border-slate-200 group-hover:border-cyan-500 rounded-lg text-sm font-medium transition-all duration-200"
              >
                <ArrowUpRight className="w-4 h-4" />
                Usar Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
