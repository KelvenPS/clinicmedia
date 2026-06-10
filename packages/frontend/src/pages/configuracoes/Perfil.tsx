import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, Award, Shield, EyeOff, Eye, Save, CheckCircle2, LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import type { AuthUser } from '../../types'
import PageHeader from '../../components/ui/PageHeader'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  specialty: z.string().optional(),
  crm: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const roleLabels: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ADMIN: { label: 'Administrador', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  DOCTOR: { label: 'Médico', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  SECRETARY: { label: 'Secretária', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
}

const avatarGradients: Record<string, string> = {
  ADMIN: 'from-purple-500 to-purple-700',
  DOCTOR: 'from-blue-500 to-blue-700',
  SECRETARY: 'from-emerald-500 to-emerald-700',
}

export default function Perfil() {
  const { user, updateUser } = useAuthStore()
  const [showNewPass, setShowNewPass] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: profile } = useQuery<AuthUser>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })

  const { register, handleSubmit, watch, formState: { errors, isDirty }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const watchedSpecialty = watch('specialty')

  useEffect(() => {
    if (profile) {
      setValue('name', profile.name)
      setValue('email', profile.email)
      setValue('phone', profile.phone || '')
      setValue('specialty', profile.specialty || '')
      setValue('crm', profile.crm || '')
    }
  }, [profile, setValue])

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => api.put(`/users/${user?.id}`, data),
    onSuccess: (res) => {
      updateUser({ name: res.data.name, phone: res.data.phone })
      toast.success('Perfil atualizado com sucesso!')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: () => toast.error('Erro ao atualizar perfil'),
  })

  const roleInfo = user?.role ? roleLabels[user.role] : null
  const gradient = user?.role ? avatarGradients[user.role] : 'from-blue-500 to-blue-700'
  const initials = user?.name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  const displayRole = user?.role === 'DOCTOR' && watchedSpecialty
    ? watchedSpecialty
    : roleInfo?.label

  return (
    <div className="max-w-3xl mx-auto space-y-6 page-stagger">
      <PageHeader
        title="Meu Perfil"
        subtitle="Gerencie suas informações pessoais e profissionais"
      />

      {/* Avatar card */}
      <div className="card overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0 self-start sm:self-auto">
            <div className={`w-20 h-20 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center shadow-xl shadow-blue-600/20 transition-transform duration-300 hover:scale-105`}>
              <span className="text-white text-2xl font-bold tracking-tight">{initials}</span>
            </div>
            {roleInfo && (
              <div className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg ${roleInfo.bg} border ${roleInfo.border} flex items-center justify-center shadow-sm`}>
                <Shield className={`w-3.5 h-3.5 ${roleInfo.color}`} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900 leading-tight">{user?.name}</h2>
                <p className="text-slate-500 text-sm mt-0.5">{user?.email}</p>
              </div>
              {isDirty && !saved && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium animate-fade-in">
                  Alterações pendentes
                </span>
              )}
              {saved && (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3 h-3" />
                  Salvo
                </span>
              )}
            </div>
            {roleInfo && displayRole && (
              <span className={`inline-flex items-center gap-1.5 mt-3 text-xs font-semibold px-3 py-1 rounded-full border ${roleInfo.bg} ${roleInfo.border} ${roleInfo.color}`}>
                <Shield className="w-3 h-3" />
                {displayRole}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-5">

        {/* Personal info */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2.5 pb-1">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            Informações Pessoais
          </h3>

          <div>
            <label className="label">Nome completo *</label>
            <input {...register('name')} className="input-field" placeholder="Seu nome completo" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
              </label>
              <input {...register('email')} type="email" className="input-field" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Telefone
              </label>
              <input {...register('phone')} className="input-field" placeholder="(11) 99999-0000" />
            </div>
          </div>

          {user?.role === 'DOCTOR' && (
            <div className="space-y-4 pt-3 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 bg-cyan-50 rounded-lg flex items-center justify-center border border-cyan-100">
                  <Award className="w-3.5 h-3.5 text-cyan-600" />
                </div>
                Dados Profissionais
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Especialidade</label>
                  <input {...register('specialty')} className="input-field" placeholder="Ex: Cardiologia" />
                </div>
                <div>
                  <label className="label">Registro Profissional</label>
                  <input {...register('crm')} className="input-field" placeholder="Ex: CRM/SP 12345" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Password section */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2.5 pb-1">
            <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
              <LockKeyhole className="w-4 h-4 text-slate-500" />
            </div>
            Alterar Senha
          </h3>
          <p className="text-sm text-slate-400">Deixe em branco para manter a senha atual</p>

          <div>
            <label className="label">Nova Senha</label>
            <div className="relative">
              <input
                {...register('newPassword')}
                type={showNewPass ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="btn-primary w-full sm:w-auto"
          >
            {saveMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
