import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, Award, Shield, Eye, EyeOff, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import type { AuthUser } from '../../types'

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

const roleLabels: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN: { label: 'Administrador', color: 'text-purple-700', bg: 'bg-purple-100' },
  DOCTOR: { label: 'Médico', color: 'text-blue-700', bg: 'bg-blue-100' },
  SECRETARY: { label: 'Secretária', color: 'text-emerald-700', bg: 'bg-emerald-100' },
}

export default function Perfil() {
  const { user, updateUser } = useAuthStore()
  const [showNewPass, setShowNewPass] = useState(false)

  const { data: profile } = useQuery<AuthUser>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })

  const { register, handleSubmit, formState: { errors, isDirty }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

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
    },
    onError: () => toast.error('Erro ao atualizar perfil'),
  })

  const roleInfo = user?.role ? roleLabels[user.role] : null
  const initials = user?.name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  return (
    <div className="max-w-2xl space-y-6 animate-page-enter">
      <div className="animate-stagger-1">
        <h1 className="page-title">Meu Perfil</h1>
        <p className="page-subtitle">Gerencie suas informações pessoais e profissionais</p>
      </div>

      {/* Avatar card */}
      <div className="card animate-stagger-2">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl shadow-blue-600/25">
            <span className="text-white text-2xl font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{user?.name}</h2>
            <p className="text-slate-500 text-sm mt-0.5">{user?.email}</p>
            {roleInfo && (
              <span className={`inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-3 py-1 rounded-full ${roleInfo.bg} ${roleInfo.color}`}>
                <Shield className="w-3 h-3" />
                {roleInfo.label}
              </span>
            )}
          </div>
          {isDirty && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
              Alterado
            </span>
          )}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-5">
        <div className="card space-y-4 animate-stagger-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            Informações Pessoais
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nome completo</label>
              <input {...register('name')} className="input-field" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div className="col-span-2">
              <label className="label flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
              </label>
              <input {...register('email')} type="email" className="input-field" />
            </div>

            <div>
              <label className="label flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Telefone
              </label>
              <input {...register('phone')} className="input-field" placeholder="(11) 99999-0000" />
            </div>
          </div>

          {user?.role === 'DOCTOR' && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <h4 className="col-span-2 text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-blue-600" /> Dados Profissionais
              </h4>
              <div>
                <label className="label">Especialidade</label>
                <input {...register('specialty')} className="input-field" placeholder="Ex: Cardiologia" />
              </div>
              <div>
                <label className="label">Registro Profissional</label>
                <input {...register('crm')} className="input-field" placeholder="Ex: CRM/SP 12345, CRP 67890" />
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-4 animate-stagger-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center">
              <Eye className="w-4 h-4 text-slate-500" />
            </div>
            Alterar Senha
          </h3>
          <p className="text-sm text-slate-500">Deixe em branco para manter a senha atual</p>

          <div>
            <label className="label">Nova Senha</label>
            <div className="relative">
              <input
                {...register('newPassword')}
                type={showNewPass ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
          {saveMutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Alterações
            </>
          )}
        </button>
      </form>
    </div>
  )
}
