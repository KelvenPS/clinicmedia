import { findAvailableSlots } from '../chatbot-light-guided-engine'
import type { SystemAction } from './types'

// Encapsula findAvailableSlots() (chatbot-light-guided-engine.ts), já usada
// pelo motor legado — não reimplementa a lógica de disponibilidade.
export const listAvailableSlots: SystemAction = {
  key: 'list_available_slots',
  name: 'Listar horários disponíveis',
  description: 'Lista horários livres para agendamento a partir de uma data/período desejado.',
  implemented: true,
  inputs: [
    { key: 'dataDesejada', label: 'Data/período desejado (texto livre)', required: true },
    { key: 'durationMinutes', label: 'Duração da consulta (minutos)', required: false },
    { key: 'searchWindowDays', label: 'Janela de busca (dias)', required: false },
    { key: 'limit', label: 'Máximo de horários', required: false },
  ],
  outputs: [{ key: 'slots', label: 'Lista de horários', required: true }],
  async execute(ctx, input) {
    const preferredDateText = String(input.dataDesejada ?? 'próximos dias')
    const durationMinutes = Number(input.durationMinutes) || 30
    const searchWindowDays = Number(input.searchWindowDays) || 15
    const limit = Number(input.limit) || 5

    const slots = await findAvailableSlots({
      doctorId: ctx.doctorId,
      preferredDateText,
      searchWindowDays,
      durationMinutes,
      limit,
    })

    if (slots.length === 0) {
      return { success: false, error: 'Nenhum horário disponível encontrado para esse período.', code: 'NO_SLOTS' }
    }

    return {
      success: true,
      data: {
        slots: slots.map(s => ({
          label: new Date(s.startAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
          startAt: s.startAt,
          endAt: s.endAt,
        })),
      },
    }
  },
}
