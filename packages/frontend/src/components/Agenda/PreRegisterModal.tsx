import { useState } from 'react'
import { UserPlus, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import Modal from '../ui/Modal'
import type { Patient } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: (patient: Patient) => void
}

export default function PreRegisterModal({ isOpen, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [duplicate, setDuplicate] = useState<{
    id: string
    name: string
    phone: string
    status: string
  } | null>(null)

  const resetForm = () => {
    setName('')
    setPhone('')
    setDuplicate(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) {
      toast.error('Nome e telefone são obrigatórios')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post<Patient>('/patients/pre-register', {
        name: name.trim(),
        phone,
        origin: 'AGENDA',
      })
      toast.success('Pré-cadastro criado! Equipe será notificada para finalizar o cadastro.')
      onCreated(data)
      resetForm()
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            message?: string
            existingPatient?: { id: string; name: string; phone: string; status: string }
          }
        }
      }
      if (error.response?.data?.existingPatient) {
        setDuplicate(error.response.data.existingPatient)
      } else {
        toast.error(error.response?.data?.message || 'Erro ao criar pré-cadastro')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUseDuplicate = () => {
    if (!duplicate) return
    const patient: Patient = {
      id: duplicate.id,
      name: duplicate.name,
      phone: duplicate.phone,
      active: true,
      status: duplicate.status as Patient['status'],
      origin: 'MANUAL',
      createdAt: '',
    }
    onCreated(patient)
    resetForm()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Pré-cadastro rápido"
      subtitle="Apenas nome e telefone são necessários agora"
      size="sm"
    >
      {duplicate ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Paciente já cadastrado</p>
              <p className="text-sm text-amber-700 mt-1">{duplicate.name}</p>
              <p className="text-xs text-amber-600 mt-0.5">{duplicate.phone}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={handleUseDuplicate} className="btn-primary flex-1">
              Usar paciente existente
            </button>
            <button type="button" onClick={() => setDuplicate(null)} className="btn-secondary">
              Tentar outro
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
            <UserPlus className="w-4 h-4 text-cyan-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-700 leading-relaxed">
              O cadastro completo poderá ser finalizado depois na tela de{' '}
              <strong>Pacientes</strong>. Médico e secretaria serão notificados.
            </p>
          </div>

          <div>
            <label className="label">Nome completo *</label>
            <input
              className="input-field"
              placeholder="Nome do paciente"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="label">Telefone *</label>
            <input
              className="input-field"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : 'Salvar pré-cadastro'}
            </button>
            <button type="button" onClick={handleClose} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
