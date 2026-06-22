import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  format, startOfWeek, addDays, addWeeks, subWeeks, subDays, isSameDay, parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, Lock, Trash2, X, MapPin, User as UserIcon, CalendarDays, LayoutList } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Appointment, AppointmentBlock, User, Patient, AppointmentType, Room } from '../types'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import AppointmentForm from '../components/Agenda/AppointmentForm'
import PageHeader from '../components/ui/PageHeader'

const SLOT_HEIGHT = 40
const DEFAULT_START_HOUR = 1
const DEFAULT_END_HOUR = 23

function buildTimeSlots(startHour: number, endHour: number) {
  return Array.from(
    { length: (endHour - startHour) * 2 },
    (_, i) => {
      const totalMins = startHour * 60 + i * 30
      const h = Math.floor(totalMins / 60)
      const m = totalMins % 60
      return { h, m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
    }
  )
}

const TIME_SLOTS = buildTimeSlots(DEFAULT_START_HOUR, DEFAULT_END_HOUR)

function getApptPosition(date: Date) {
  const minutesFromStart = (date.getHours() - DEFAULT_START_HOUR) * 60 + date.getMinutes()
  return (minutesFromStart / 30) * SLOT_HEIGHT
}

function getApptHeight(duration: number) {
  return Math.max((duration / 30) * SLOT_HEIGHT, 24)
}

function getBlockPosition(date: Date) {
  const minutesFromStart = (date.getHours() - DEFAULT_START_HOUR) * 60 + date.getMinutes()
  return (minutesFromStart / 30) * SLOT_HEIGHT
}

function getBlockHeight(start: Date, end: Date) {
  const durationMins = (end.getTime() - start.getTime()) / 60000
  return Math.max((durationMins / 30) * SLOT_HEIGHT, 24)
}

function getApptColor(status: string, isBlocked: boolean) {
  if (isBlocked) return 'bg-amber-500/90 border-amber-700'
  const map: Record<string, string> = {
    SCHEDULED: 'bg-blue-500 border-blue-700',
    CONFIRMED: 'bg-emerald-500 border-emerald-700',
    COMPLETED: 'bg-slate-400 border-slate-600',
    CANCELLED: 'bg-red-400 border-red-600',
    NO_SHOW: 'bg-orange-400 border-orange-600',
  }
  return map[status] || map.SCHEDULED
}

function BlockForm({
  doctors,
  currentUser,
  onSubmit,
  loading,
}: {
  doctors: User[]
  currentUser: { id: string; role: string } | null
  onSubmit: (data: { date: string; endDate: string; reason: string; doctorId?: string }) => void
  loading: boolean
}) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:00')
  const [reason, setReason] = useState('')
  const [doctorId, setDoctorId] = useState(currentUser?.id || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      date: `${date}T${startTime}:00`,
      endDate: `${date}T${endTime}:00`,
      reason,
      doctorId: currentUser?.role === 'ADMIN' ? doctorId : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {currentUser?.role === 'ADMIN' && (
        <div>
          <label className="label">Médico</label>
          <select value={doctorId} onChange={e => setDoctorId(e.target.value)} className="input-field">
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">Data</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Início</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label">Fim</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-field" />
        </div>
      </div>
      <div>
        <label className="label">Motivo (opcional)</label>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="input-field"
          placeholder="Ex: Comprometimento pessoal, Reunião..."
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : (
          <><Lock className="w-4 h-4" />Bloquear Horário</>
        )}
      </button>
    </form>
  )
}

interface TooltipState {
  appt: Appointment
  x: number
  y: number
}

export default function Agenda() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date } | null>(null)
  const [filterDoctorId, setFilterDoctorId] = useState('')
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [calendarMode, setCalendarMode] = useState<'week' | 'day'>('day')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const mouseCoords = useRef({ x: 0, y: 0 })

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekDays = calendarMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [currentWeek]

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments', format(weekStart, 'yyyy-MM-dd'), filterDoctorId],
    queryFn: () =>
      api.get('/appointments', {
        params: {
          startDate: weekStart.toISOString(),
          endDate: addDays(weekStart, 7).toISOString(),
          ...(filterDoctorId && { doctorId: filterDoctorId }),
        },
      }).then(r => r.data),
  })

  const { data: blocks = [] } = useQuery<AppointmentBlock[]>({
    queryKey: ['appointment-blocks', format(weekStart, 'yyyy-MM-dd'), filterDoctorId],
    queryFn: () =>
      api.get('/appointment-blocks', {
        params: {
          startDate: weekStart.toISOString(),
          endDate: addDays(weekStart, 7).toISOString(),
          ...(filterDoctorId && { doctorId: filterDoctorId }),
        },
      }).then(r => r.data),
  })

  const { data: doctors = [] } = useQuery<User[]>({
    queryKey: ['doctors'],
    queryFn: () => api.get('/doctors').then(r => r.data),
  })

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn: () => api.get('/patients').then(r => r.data),
  })

  const { data: appointmentTypes = [] } = useQuery<AppointmentType[]>({
    queryKey: ['appointment-types'],
    queryFn: () => api.get('/appointment-types').then(r => r.data),
  })

  const { data: myRooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then(r => r.data),
  })

  // For secretaries: restrict to room schedule
  const roomSchedule = user?.role === 'SECRETARY' && myRooms.length > 0
    ? { startHour: parseInt(myRooms[0].startTime.split(':')[0]), endHour: parseInt(myRooms[0].endTime.split(':')[0]), days: myRooms[0].daysOfWeek }
    : null

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      selectedAppt ? api.put(`/appointments/${selectedAppt.id}`, data) : api.post('/appointments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['today-appointments'] })
      qc.invalidateQueries({ queryKey: ['appointment-stats'] })
      toast.success(selectedAppt ? 'Consulta atualizada!' : 'Consulta agendada!')
      setModalOpen(false)
      setSelectedAppt(null)
    },
    onError: () => toast.error('Erro ao salvar consulta'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      toast.success('Consulta removida')
      setModalOpen(false)
      setSelectedAppt(null)
    },
  })

  const blockMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/appointment-blocks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] })
      toast.success('Horário bloqueado!')
      setBlockModalOpen(false)
    },
    onError: () => toast.error('Erro ao bloquear horário'),
  })

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/appointment-blocks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] })
      toast.success('Bloqueio removido')
    },
  })

  const getApptsByDay = (day: Date) => appointments.filter(a => isSameDay(parseISO(a.date), day))
  const getBlocksByDay = (day: Date) => blocks.filter(b => isSameDay(parseISO(b.date), day))

  const handleSlotClick = (day: Date, slot: { h: number; m: number }) => {
    const d = new Date(day)
    d.setHours(slot.h, slot.m, 0, 0)
    setSelectedAppt(null)
    setSelectedSlot({ date: d })
    setModalOpen(true)
  }

  const handleApptClick = (e: React.MouseEvent, appt: Appointment) => {
    e.stopPropagation()
    // Secretary cannot see details of blocked appointments
    if (user?.role === 'SECRETARY' && appt.isBlocked) return
    setTooltip(null)
    setSelectedAppt(appt)
    setSelectedSlot(null)
    setModalOpen(true)
  }

  const handleApptMouseEnter = useCallback((e: React.MouseEvent, appt: Appointment) => {
    if (user?.role === 'SECRETARY' && appt.isBlocked) return
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    mouseCoords.current = { x: e.clientX, y: e.clientY }
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ appt, x: mouseCoords.current.x, y: mouseCoords.current.y })
    }, 300)
  }, [user])

  const handleApptMouseMove = useCallback((e: React.MouseEvent) => {
    mouseCoords.current = { x: e.clientX, y: e.clientY }
    if (tooltipRef.current) {
      const left = Math.min(e.clientX + 14, window.innerWidth - 260)
      const top = Math.min(e.clientY + 10, window.innerHeight - 260)
      tooltipRef.current.style.left = `${left}px`
      tooltipRef.current.style.top = `${top}px`
    }
  }, [])

  const handleApptMouseLeave = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    tooltipTimer.current = setTimeout(() => setTooltip(null), 150)
  }, [])

  const activeSlots = roomSchedule
    ? buildTimeSlots(roomSchedule.startHour, roomSchedule.endHour)
    : TIME_SLOTS

  const totalGridHeight = activeSlots.length * SLOT_HEIGHT

  const isAllowedDay = (day: Date) => {
    if (!roomSchedule) return true
    const isoDay = day.getDay() === 0 ? 7 : day.getDay()
    return roomSchedule.days.includes(isoDay)
  }

  return (
    <div className="space-y-4 page-stagger">
      <PageHeader
        title="Agenda"
        subtitle="Gerencie consultas e agendamentos"
        actions={
        <div className="flex items-center gap-2 flex-wrap">
          {(user?.role === 'DOCTOR' || user?.role === 'ADMIN') && (
            <button
              onClick={() => setBlockModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5
                         bg-gradient-to-r from-amber-500 to-amber-600
                         hover:from-amber-600 hover:to-amber-700 active:scale-95
                         text-white rounded-xl font-medium text-sm transition-all duration-150
                         shadow-sm shadow-amber-600/20"
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Bloquear</span>
            </button>
          )}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setCalendarMode('day')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                calendarMode === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setCalendarMode('week')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                calendarMode === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
          </div>
          <button
            onClick={() => setViewMode(v => v === 'calendar' ? 'list' : 'calendar')}
            className="inline-flex items-center gap-2 px-4 py-2.5
                       bg-white hover:bg-slate-50 active:scale-95
                       text-slate-700 rounded-xl font-medium text-sm transition-all duration-150
                       shadow-sm border border-slate-200 hover:border-slate-300"
          >
            {viewMode === 'calendar' ? (
              <><LayoutList className="w-4 h-4" /><span className="hidden sm:inline">Lista</span></>
            ) : (
              <><Calendar className="w-4 h-4" /><span className="hidden sm:inline">Calendário</span></>
            )}
          </button>
          <button
            onClick={() => { setSelectedAppt(null); setSelectedSlot(null); setModalOpen(true) }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Agendamento</span>
            <span className="sm:hidden">Agendar</span>
          </button>
        </div>
        }
      />

      {/* ── Controls bar ── */}
      <div className="card py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentWeek(calendarMode === 'week' ? subWeeks(currentWeek, 1) : subDays(currentWeek, 1))}
              className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center
                         hover:bg-slate-50 hover:border-slate-300 active:scale-90
                         transition-all duration-150"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <p className="font-semibold text-slate-900 text-sm min-w-[190px] text-center">
              {calendarMode === 'week' ? (
                <>
                  {format(weekStart, "d 'de' MMM", { locale: ptBR })}
                  {' '}–{' '}
                  {format(addDays(weekStart, 6), "d 'de' MMM yyyy", { locale: ptBR })}
                </>
              ) : (
                format(currentWeek, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
              )}
            </p>
            <button
              onClick={() => setCurrentWeek(calendarMode === 'week' ? addWeeks(currentWeek, 1) : addDays(currentWeek, 1))}
              className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center
                         hover:bg-slate-50 hover:border-slate-300 active:scale-90
                         transition-all duration-150"
              aria-label="Próximo"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={() => setCurrentWeek(new Date())}
              className="px-3 py-1.5 text-xs font-semibold text-blue-600
                         hover:bg-blue-50 rounded-lg border border-blue-200
                         hover:border-blue-300 transition-all duration-150 active:scale-95"
            >
              Hoje
            </button>
          </div>

          {(user?.role === 'ADMIN' || user?.role === 'SECRETARY') && (
            <select
              value={filterDoctorId}
              onChange={e => setFilterDoctorId(e.target.value)}
              className="input-field py-2 sm:max-w-[200px] text-sm"
            >
              <option value="">Todos os profissionais</option>
              {doctors.map(d => <option key={d.id} value={d.id}>Dr(a). {d.name}</option>)}
            </select>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 sm:ml-auto flex-wrap">
            {[
              { label: 'Agendado', color: 'bg-blue-500' },
              { label: 'Confirmado', color: 'bg-emerald-500' },
              { label: 'Concluído', color: 'bg-slate-400' },
              { label: 'Cancelado', color: 'bg-red-400' },
              { label: 'Bloqueado', color: 'bg-amber-500' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  {['Data', 'Hora', 'Nome Paciente', 'Local de Atendimento', 'Valor Total', 'Agendado por', 'Profissional', 'Tipo', 'Status'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekDays.map(day => {
                  const dayAppts = getApptsByDay(day)
                  const dayBlocks = getBlocksByDay(day)
                  const dayAllowed = isAllowedDay(day)

                  if (!dayAllowed) return null

                  let skipUntil: Date | null = null

                  return activeSlots.map((slot, idx) => {
                    const slotStart = new Date(day)
                    slotStart.setHours(slot.h, slot.m, 0, 0)

                    // Skip if within an ongoing appointment
                    if (skipUntil && slotStart < skipUntil) return null

                    // Check if an appointment is active
                    const activeAppt = dayAppts.find(a => {
                      const aStart = parseISO(a.date)
                      const aEnd = new Date(aStart.getTime() + a.duration * 60000)
                      return slotStart >= aStart && slotStart < aEnd
                    })

                    if (activeAppt) {
                      const aStart = parseISO(activeAppt.date)
                      skipUntil = new Date(aStart.getTime() + activeAppt.duration * 60000)
                      if (user?.role === 'SECRETARY' && activeAppt.isBlocked) return null // Secretary can't see blocked details
                      return (
                        <tr
                          key={activeAppt.id}
                          className={`border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors ${idx % 2 !== 0 ? 'bg-slate-50/30' : ''}`}
                          onClick={e => handleApptClick(e as React.MouseEvent, activeAppt)}
                        >
                          <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                            {format(parseISO(activeAppt.date), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-semibold tabular-nums whitespace-nowrap">
                            {format(parseISO(activeAppt.date), 'HH:mm')}
                          </td>
                          <td className="px-4 py-3 text-slate-900 font-semibold whitespace-nowrap">
                            {activeAppt.patient.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {activeAppt.room?.name || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium tabular-nums whitespace-nowrap">
                            {activeAppt.value != null
                              ? activeAppt.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {activeAppt.createdBy
                              ? (activeAppt.createdById === activeAppt.doctorId ? `Dr. ${activeAppt.createdBy.name}` : activeAppt.createdBy.name)
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {activeAppt.doctor.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {activeAppt.type || 'Consulta'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={activeAppt.status} />
                          </td>
                        </tr>
                      )
                    }

                    // Check for block
                    const activeBlock = dayBlocks.find(b => {
                      const bStart = parseISO(b.date)
                      const bEnd = parseISO(b.endDate)
                      return slotStart >= bStart && slotStart < bEnd
                    })

                    if (activeBlock) {
                      skipUntil = parseISO(activeBlock.endDate)
                      return (
                        <tr key={`block-${activeBlock.id}-${slot.h}-${slot.m}`} className="border-b border-amber-100 bg-amber-50/30">
                          <td className="px-4 py-3 text-amber-700 font-medium whitespace-nowrap">
                            {format(slotStart, "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className="px-4 py-3 text-amber-700 font-semibold tabular-nums whitespace-nowrap">
                            {format(slotStart, 'HH:mm')}
                          </td>
                          <td colSpan={7} className="px-4 py-3 text-amber-700">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4" />
                              <span className="font-semibold">Bloqueado</span>
                              {activeBlock.reason && <span className="opacity-80">({activeBlock.reason})</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    // Otherwise, FREE slot
                    return (
                      <tr 
                        key={`free-${day.toISOString()}-${slot.h}-${slot.m}`}
                        className="border-b border-slate-100 bg-white hover:bg-slate-50 cursor-pointer group"
                        onClick={() => handleSlotClick(day, slot)}
                      >
                        <td className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap group-hover:text-blue-600 transition-colors">
                          {format(slotStart, "dd/MM/yyyy", { locale: ptBR })}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-semibold tabular-nums whitespace-nowrap group-hover:text-blue-600 transition-colors">
                          {format(slotStart, 'HH:mm')}
                        </td>
                        <td colSpan={7} className="px-4 py-3 text-slate-400 font-medium group-hover:text-blue-600 transition-colors">
                          Livre
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      {viewMode === 'calendar' && <div className="card p-0 overflow-hidden">
        <div className="grid border-b border-slate-200 bg-slate-50/80" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          <div className="border-r border-slate-200" />
          {weekDays.map(day => {
            const isToday = isSameDay(day, new Date())
            return (
              <div
                key={day.toISOString()}
                className={`p-3 text-center border-r border-slate-200 last:border-r-0 transition-colors ${
                  isToday ? 'bg-blue-50' : 'hover:bg-slate-100/60'
                }`}
              >
                <p className={`text-xs font-bold uppercase tracking-wider ${
                  isToday ? 'text-blue-600' : 'text-slate-400'
                }`}>
                  {format(day, 'EEE', { locale: ptBR })}
                </p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mt-1 transition-all ${
                  isToday
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}>
                  <span className="text-sm font-bold">{format(day, 'd')}</span>
                </div>
                {getApptsByDay(day).length > 0 && (
                  <div className={`w-1.5 h-1.5 rounded-full mx-auto mt-1.5 ${
                    isToday ? 'bg-blue-300' : 'bg-blue-400'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '580px' }}>
          <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
            {/* Time labels */}
            <div className="border-r border-slate-200">
              {activeSlots.map((slot, i) => (
                <div
                  key={i}
                  style={{ height: SLOT_HEIGHT }}
                  className={`border-b flex items-start justify-end pr-2 pt-1 ${slot.m === 0 ? 'border-slate-200' : 'border-slate-100'}`}
                >
                  {slot.m === 0 ? (
                    <span className="text-xs font-semibold text-slate-500">{slot.label}</span>
                  ) : (
                    <span className="text-xs text-slate-300">{slot.label}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map(day => {
              const dayAppts = getApptsByDay(day)
              const dayBlocks = getBlocksByDay(day)
              const isToday = isSameDay(day, new Date())
              const dayAllowed = isAllowedDay(day)

              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-r border-slate-200 last:border-r-0 ${isToday ? 'bg-blue-50/20' : ''} ${!dayAllowed ? 'bg-slate-100/60' : ''}`}
                  style={{ height: totalGridHeight }}
                >
                  {!dayAllowed && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <p className="text-xs text-slate-400 font-medium rotate-90 whitespace-nowrap">Fora do horário</p>
                    </div>
                  )}
                  {/* Slot lines */}
                  {activeSlots.map((slot, i) => (
                    <div
                      key={i}
                      style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      className={`absolute left-0 right-0 border-b transition-colors ${slot.m === 0 ? 'border-slate-200' : 'border-slate-100'} ${dayAllowed ? 'cursor-pointer hover:bg-blue-50/50' : 'cursor-not-allowed'}`}
                      onClick={() => dayAllowed && handleSlotClick(day, slot)}
                    />
                  ))}

                  {/* Appointment Blocks */}
                  {dayBlocks.map(block => {
                    const blockStart = parseISO(block.date)
                    const blockEnd = parseISO(block.endDate)
                    const top = getBlockPosition(blockStart)
                    const height = getBlockHeight(blockStart, blockEnd)
                    const canDelete = user?.role === 'ADMIN' || user?.id === block.doctorId
                    return (
                      <div
                        key={block.id}
                        style={{ top: top + 1, height: height - 2, left: 2, right: 2 }}
                        className="absolute rounded-md border-l-4 border-amber-600 bg-amber-100/80 px-1.5 py-0.5 z-20 overflow-hidden group"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-700 flex-shrink-0" />
                          <p className="text-xs font-bold text-amber-800 truncate">Bloqueado</p>
                          {canDelete && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteBlockMutation.mutate(block.id) }}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 hover:bg-amber-200 rounded transition-all"
                            >
                              <X className="w-3 h-3 text-amber-700" />
                            </button>
                          )}
                        </div>
                        {height > 36 && block.reason && (
                          <p className="text-xs text-amber-700 opacity-80 truncate">{block.reason}</p>
                        )}
                      </div>
                    )
                  })}

                  {/* Appointments */}
                  {dayAppts.map(appt => {
                    const apptDate = parseISO(appt.date)
                    const top = getApptPosition(apptDate)
                    const height = getApptHeight(appt.duration)
                    const colorClass = getApptColor(appt.status, appt.isBlocked)
                    const isSecretaryBlocked = user?.role === 'SECRETARY' && appt.isBlocked

                    return (
                      <div
                        key={appt.id}
                        style={{ top: top + 1, height: height - 2, left: 2, right: 2 }}
                        className={`absolute rounded-md border-l-4 px-1.5 py-0.5 text-white shadow-sm z-10 overflow-hidden transition-all ${colorClass} ${isSecretaryBlocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:brightness-95'}`}
                        onClick={e => handleApptClick(e, appt)}
                        onMouseEnter={e => handleApptMouseEnter(e, appt)}
                        onMouseMove={handleApptMouseMove}
                        onMouseLeave={handleApptMouseLeave}
                      >
                        <p className="text-xs font-bold leading-tight truncate">
                          {isSecretaryBlocked ? (
                            <span className="flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Bloqueado
                            </span>
                          ) : (
                            <>{format(apptDate, 'HH:mm')} {appt.patient.name}</>
                          )}
                        </p>
                        {height > 36 && !isSecretaryBlocked && (
                          <p className="text-xs opacity-80 truncate leading-tight">{appt.duration}min · {appt.type || 'Consulta'}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>}

      {/* ── Mobile list ── */}
      {viewMode === 'calendar' && <div className="xl:hidden space-y-2 animate-stagger-3">
        {appointments.length === 0 ? (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 animate-float">
              <Calendar className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">Nenhuma consulta esta semana</p>
            <p className="text-slate-400 text-sm mt-1">Clique em + para agendar</p>
          </div>
        ) : (
          appointments
            .filter(a => !(user?.role === 'SECRETARY' && a.isBlocked))
            .map((appt, idx) => (
              <div
                key={appt.id}
                className="card-hover flex items-center gap-4 py-3 px-4"
                style={{ animationDelay: `${idx * 0.04}s` }}
                onClick={e => handleApptClick(e, appt)}
              >
                <div className="text-center min-w-[52px]">
                  <p className="text-xs font-semibold text-slate-400 uppercase">
                    {format(parseISO(appt.date), 'EEE', { locale: ptBR })}
                  </p>
                  <p className="text-xl font-bold text-slate-900 tabular-nums leading-tight">
                    {format(parseISO(appt.date), 'd')}
                  </p>
                  <p className="text-xs font-bold text-blue-600 tabular-nums">
                    {format(parseISO(appt.date), 'HH:mm')}
                  </p>
                </div>
                <div className="w-px h-10 bg-slate-200 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{appt.patient.name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span className="tabular-nums">{appt.duration}min</span>
                    {' · '}
                    <span className="truncate">{appt.doctor.name}</span>
                  </p>
                </div>
                <StatusBadge status={appt.status} />
              </div>
            ))
        )}
      </div>}

      {/* Hover tooltip — rendered via portal to escape transform/overflow ancestors */}
      {tooltip && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 260),
            top: Math.min(tooltip.y + 10, window.innerHeight - 260),
          }}
        >
          <div
            className="w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-2 pointer-events-auto"
            onMouseEnter={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }}
            onMouseLeave={handleApptMouseLeave}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getApptColor(tooltip.appt.status, tooltip.appt.isBlocked).split(' ')[0]}`} />
              <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{tooltip.appt.patient.name}</p>
            </div>
            <div className="space-y-1.5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 flex-shrink-0 text-slate-400" />
                <span>{format(parseISO(tooltip.appt.date), 'HH:mm')} · {tooltip.appt.duration}min</span>
              </div>
              {tooltip.appt.type && (
                <div className="flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3 flex-shrink-0 text-slate-400" />
                  <span className="truncate">{tooltip.appt.type}</span>
                </div>
              )}
              {tooltip.appt.room && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                  <span className="truncate">
                    {tooltip.appt.room.name}{tooltip.appt.room.cidade ? ` — ${tooltip.appt.room.cidade}` : ''}
                  </span>
                </div>
              )}
              {tooltip.appt.createdBy && (
                <div className="flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3 flex-shrink-0 text-slate-400" />
                  <span className="truncate">
                    Agendado por{' '}
                    <span className="font-medium text-slate-700">
                      {tooltip.appt.createdById === tooltip.appt.doctorId
                        ? `Dr. ${tooltip.appt.createdBy.name}`
                        : tooltip.appt.createdBy.name}
                    </span>
                    {tooltip.appt.createdById !== tooltip.appt.doctorId && (
                      <span className="text-slate-400"> (Sec.)</span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3 flex-shrink-0 text-slate-400" />
                <span>{format(parseISO(tooltip.appt.createdAt), "dd/MM/yyyy 'às' HH:mm")}</span>
              </div>
            </div>
            <StatusBadge status={tooltip.appt.status} />
          </div>
        </div>,
        document.body
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedAppt(null) }}
        title={selectedAppt ? 'Editar Consulta' : 'Novo Agendamento'}
        size="lg"
      >
        <AppointmentForm
          appointment={selectedAppt}
          defaultDate={selectedSlot?.date}
          doctors={doctors}
          patients={patients}
          appointmentTypes={appointmentTypes}
          rooms={myRooms}
          currentUser={user}
          onSubmit={data => {
            const payload = {
              ...data,
              date: new Date(data.date as string).toISOString(),
            }
            saveMutation.mutate(payload as Record<string, unknown>)
          }}
          onDelete={selectedAppt ? () => deleteMutation.mutate(selectedAppt.id) : undefined}
          loading={saveMutation.isPending}
        />
      </Modal>

      <Modal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        title="Bloquear Horário"
      >
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-800 flex items-center gap-2">
            <Lock className="w-4 h-4 flex-shrink-0" />
            O horário bloqueado ficará visível para secretárias como indisponível.
          </p>
        </div>
        <BlockForm
          doctors={doctors}
          currentUser={user}
          onSubmit={d => {
            // Same UTC conversion — "2026-06-09T13:00:00" without tz → UTC on server
            blockMutation.mutate({
              ...d,
              date: new Date(d.date).toISOString(),
              endDate: new Date(d.endDate).toISOString(),
            } as Record<string, unknown>)
          }}
          loading={blockMutation.isPending}
        />
      </Modal>
    </div>
  )
}
