import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import type { User } from '../../types'

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres').optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'DOCTOR', 'SECRETARY']),
  specialty: z.string().optional(),
  crm: z.string().optional(),
  phone: z.string().optional(),
}).refine(
  data => !data.password || data.password === data.confirmPassword,
  { message: 'As senhas não conferem', path: ['confirmPassword'] }
)

type FormData = z.infer<typeof schema>

interface Props {
  user: User | null
  onSubmit: (data: Omit<FormData, 'confirmPassword'>) => void
  loading: boolean
}

const rolePermissions: Record<string, string[]> = {
  ADMIN: ['Agenda', 'Pacientes', 'Financeiro', 'Usuários'],
  DOCTOR: ['Agenda', 'Pacientes', 'Financeiro (próprio)'],
  SECRETARY: ['Agenda', 'Pacientes'],
}

export default function UserForm({ user, onSubmit, loading }: Props) {
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: 'SECRETARY',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const watchRole = watch('role')
  const watchPassword = watch('password')

  useEffect(() => {
    if (user) {
      setValue('name', user.name)
      setValue('email', user.email)
      setValue('role', user.role)
      setValue('specialty', user.specialty || '')
      setValue('crm', user.crm || '')
      setValue('phone', user.phone || '')
      setValue('password', '')
      setValue('confirmPassword', '')
    }
  }, [user, setValue])

  const handleFormSubmit = (data: FormData) => {
    const { confirmPassword, ...payload } = data
    if (!payload.password) delete payload.password
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div>
        <label className="label">Nome completo *</label>
        <input {...register('name')} className="input-field" placeholder="Nome do usuário" />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label">Email *</label>
        <input {...register('email')} type="email" className="input-field" placeholder="email@exemplo.com" />
        {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
      </div>

      {/* Password + Confirm Password */}
      <div className="space-y-3">
        <div>
          <label className="label">
            {user ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPass ? 'text' : 'password'}
              className="input-field pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
        </div>

        {/* Confirm password — só aparece quando senha foi digitada */}
        {(watchPassword || !user) && (
          <div>
            <label className="label">Confirmar Senha *</label>
            <div className="relative">
              <input
                {...register('confirmPassword')}
                type={showPass ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
        )}

        {/* Checkbox exibir senha */}
        <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={showPass}
            onChange={e => setShowPass(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600"
          />
          <span className="text-sm text-slate-600">Exibir senha</span>
        </label>
      </div>

      <div>
        <label className="label">Perfil de Acesso *</label>
        <select {...register('role')} className="input-field">
          <option value="SECRETARY">Secretária</option>
          <option value="DOCTOR">Médico</option>
          <option value="ADMIN">Administrador</option>
        </select>
        {watchRole && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-600 mb-1.5">Acessos permitidos:</p>
            <div className="flex flex-wrap gap-1.5">
              {rolePermissions[watchRole]?.map(p => (
                <span key={p} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {watchRole === 'DOCTOR' && (
        <div className="grid grid-cols-2 gap-4">
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

      <div>
        <label className="label">Telefone</label>
        <input {...register('phone')} className="input-field" placeholder="(11) 99999-0000" />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : user ? 'Atualizar Usuário' : 'Criar Usuário'}
      </button>
    </form>
  )
}
