import React from 'react'
import Modal from '../ui/Modal'
import { AgendaPreferences } from '../../hooks/useAgendaPreferences'
import { Clock, Monitor, CalendarDays } from 'lucide-react'

interface AgendaSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  preferences: AgendaPreferences
  onUpdate: (newPrefs: Partial<AgendaPreferences>) => void
}

export default function AgendaSettingsModal({ isOpen, onClose, preferences, onUpdate }: AgendaSettingsModalProps) {
  const handlePresetChange = (preset: 'commercial' | 'extended') => {
    if (preset === 'commercial') {
      onUpdate({ startHour: 7, endHour: 18 })
    } else if (preset === 'extended') {
      onUpdate({ startHour: 1, endHour: 23 })
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Personalizar Agenda" size="md">
      <div className="space-y-6">
        
        {/* Horário de Exibição */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3>Horário de Exibição</h3>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => handlePresetChange('commercial')}
              className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                preferences.startHour === 7 && preferences.endHour === 18
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Comercial
              <span className="block text-xs font-normal opacity-70">07:00 às 18:00</span>
            </button>
            <button
              onClick={() => handlePresetChange('extended')}
              className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                preferences.startHour === 1 && preferences.endHour === 23
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Estendido
              <span className="block text-xs font-normal opacity-70">01:00 às 23:00</span>
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Início (Personalizado)</label>
              <select
                value={preferences.startHour}
                onChange={e => onUpdate({ startHour: Number(e.target.value) })}
                className="input-field py-1.5"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Fim (Personalizado)</label>
              <select
                value={preferences.endHour}
                onChange={e => onUpdate({ endHour: Number(e.target.value) })}
                className="input-field py-1.5"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Formatação da Grade */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-2">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <h3>Formatação da Grade</h3>
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Intervalo de horários
            </label>
            <select
              value={preferences.interval}
              onChange={e => onUpdate({ interval: Number(e.target.value) })}
              className="input-field"
            >
              <option value={10}>A cada 10 minutos</option>
              <option value={15}>A cada 15 minutos</option>
              <option value={20}>A cada 20 minutos</option>
              <option value={30}>A cada 30 minutos</option>
              <option value={60}>A cada 60 minutos</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Início da Semana
            </label>
            <select
              value={preferences.weekStartsOn}
              onChange={e => onUpdate({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
              className="input-field"
            >
              <option value={1}>Segunda-feira</option>
              <option value={0}>Domingo</option>
            </select>
          </div>
        </div>

        {/* Visualização */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-2">
            <Monitor className="w-4 h-4 text-blue-600" />
            <h3>Visualização</h3>
          </div>
          
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={preferences.hideWeekends}
                onChange={e => onUpdate({ hideWeekends: e.target.checked })}
                className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded checked:bg-blue-600 checked:border-blue-600 transition-colors"
              />
              <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Ocultar finais de semana</span>
              <span className="text-xs text-slate-500">Exibir apenas de Segunda a Sexta</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group pt-2">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={preferences.compactMode}
                onChange={e => onUpdate({ compactMode: e.target.checked })}
                className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded checked:bg-blue-600 checked:border-blue-600 transition-colors"
              />
              <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Modo Compacto</span>
              <span className="text-xs text-slate-500">Reduz a altura das linhas para mostrar mais horários</span>
            </div>
          </label>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-primary px-6">
            Concluir
          </button>
        </div>
      </div>
    </Modal>
  )
}
