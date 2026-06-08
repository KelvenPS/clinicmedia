import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Eye, EyeOff, Lock, Mail, AlertCircle, UserPlus, LogIn,
  Zap, ArrowLeft, User, Phone, Award,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

const SPECIALTIES = [
  { name: 'Psicólogo', certType: 'CRP' },
  { name: 'Neuropsicólogo', certType: 'CRP' },
  { name: 'Psiquiatra', certType: 'CRM' },
  { name: 'Clínico Geral', certType: 'CRM' },
  { name: 'Cardiologista', certType: 'CRM' },
  { name: 'Neurologista', certType: 'CRM' },
  { name: 'Ortopedista', certType: 'CRM' },
  { name: 'Pediatra', certType: 'CRM' },
  { name: 'Ginecologista/Obstetra', certType: 'CRM' },
  { name: 'Dermatologista', certType: 'CRM' },
  { name: 'Médico (Outras Especialidades)', certType: 'CRM' },
  { name: 'Nutricionista', certType: 'CRN' },
  { name: 'Fisioterapeuta', certType: 'CREFITO' },
  { name: 'Fonoaudiólogo', certType: 'CRFa' },
  { name: 'Odontólogo', certType: 'CRO' },
  { name: 'Enfermeiro', certType: 'COREN' },
  { name: 'Terapeuta Ocupacional', certType: 'COFFITO' },
]

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  certNumber: z.string().optional(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

function getGreeting(name: string) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  return `${greeting}, ${name.split(' ')[0]}!`
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const watchSpecialty = registerForm.watch('specialty')
  const certType = SPECIALTIES.find(s => s.name === watchSpecialty)?.certType || 'CRM'

  const onLogin = async (data: LoginForm) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', data)
      const { token, user } = res.data
      setAuth(user, token)
      toast.success(getGreeting(user.name), {
        duration: 4000,
        style: { background: '#0f172a', color: '#f8fafc', fontSize: '15px', fontWeight: '500' },
      })
      navigate('/dashboard')
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao fazer login'
      loginForm.setError('email', { message })
    } finally {
      setLoading(false)
    }
  }

  const onRegister = async (data: RegisterForm) => {
    setLoading(true)
    try {
      const { confirmPassword: _, ...rest } = data
      const res = await api.post('/auth/register', {
        ...rest,
        certType,
        certNumber: data.certNumber,
      })
      const { token, user } = res.data
      setAuth(user, token)
      toast.success(`Bem-vindo(a), ${user.name.split(' ')[0]}!`, {
        duration: 4000,
        style: { background: '#0f172a', color: '#f8fafc', fontSize: '15px', fontWeight: '500' },
      })
      navigate('/dashboard')
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao criar conta'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-blue-600/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/30">
              <Zap className="w-7 h-7 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl tracking-tight">ClinIQ <span className="text-cyan-400 font-light">Pro</span></h1>
              <p className="text-slate-400 text-xs">Gestão Clínica Inteligente</p>
            </div>
          </div>

          <h2 className="text-white text-4xl font-bold leading-tight mb-5">
            Eleve o padrão
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">da sua clínica</span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Plataforma completa para gestão de clínicas e consultórios. Agenda, prontuário eletrônico, laudos cognitivos e muito mais.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            { icon: '🗓️', text: 'Agenda inteligente com bloqueio de horários' },
            { icon: '🧠', text: 'Correção de laudos: WISC-IV, WASI, WAIS-III' },
            { icon: '📋', text: 'Prontuário eletrônico por profissional' },
            { icon: '💰', text: 'Controle financeiro e planos de saúde' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-slate-300 text-sm">{text}</span>
            </div>
          ))}

          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-slate-500 text-xs">
              © 2024 ClinIQ Pro · Todos os direitos reservados
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-slate-900 font-bold text-xl">ClinIQ Pro</h1>
              <p className="text-slate-400 text-xs">Gestão Clínica Inteligente</p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-8">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LogIn className="w-4 h-4" />
              Entrar
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <UserPlus className="w-4 h-4" />
              Criar Conta
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Bem-vindo(a) de volta</h2>
                <p className="text-slate-500 text-sm">Acesse sua conta para continuar</p>
              </div>

              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
                <div>
                  <label className="label">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      {...loginForm.register('email')}
                      type="email"
                      placeholder="seu@email.com"
                      className={`input-field pl-10 ${loginForm.formState.errors.email ? 'border-red-300 focus:ring-red-500' : ''}`}
                      autoComplete="email"
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      {...loginForm.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={`input-field pl-10 pr-10 ${loginForm.formState.errors.password ? 'border-red-300' : ''}`}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 mt-2"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Entrando...</>
                  ) : (
                    <><LogIn className="w-4 h-4" />Entrar no sistema</>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-7">
                <button onClick={() => setMode('login')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-sm mb-4 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Criar sua conta</h2>
                <p className="text-slate-500 text-sm">Preencha seus dados profissionais</p>
              </div>

              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="label">Nome completo *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        {...registerForm.register('name')}
                        placeholder="Seu nome completo"
                        className={`input-field pl-10 ${registerForm.formState.errors.name ? 'border-red-300' : ''}`}
                      />
                    </div>
                    {registerForm.formState.errors.name && (
                      <p className="text-xs text-red-600 mt-1">{registerForm.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">E-mail *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        {...registerForm.register('email')}
                        type="email"
                        placeholder="seu@email.com"
                        className={`input-field pl-10 ${registerForm.formState.errors.email ? 'border-red-300' : ''}`}
                      />
                    </div>
                    {registerForm.formState.errors.email && (
                      <p className="text-xs text-red-600 mt-1">{registerForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Senha *</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          {...registerForm.register('password')}
                          type="password"
                          placeholder="••••••"
                          className="input-field pl-10"
                        />
                      </div>
                      {registerForm.formState.errors.password && (
                        <p className="text-xs text-red-600 mt-1">{registerForm.formState.errors.password.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="label">Confirmar *</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          {...registerForm.register('confirmPassword')}
                          type="password"
                          placeholder="••••••"
                          className="input-field pl-10"
                        />
                      </div>
                      {registerForm.formState.errors.confirmPassword && (
                        <p className="text-xs text-red-600 mt-1">{registerForm.formState.errors.confirmPassword.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label">Telefone</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        {...registerForm.register('phone')}
                        placeholder="(11) 99999-0000"
                        className="input-field pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Especialidade</label>
                    <select {...registerForm.register('specialty')} className="input-field">
                      <option value="">Selecione sua especialidade</option>
                      {SPECIALTIES.map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {watchSpecialty && (
                    <div>
                      <label className="label">
                        Número do {certType}
                      </label>
                      <div className="relative">
                        <Award className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          {...registerForm.register('certNumber')}
                          placeholder={`${certType}/SP 00/00000`}
                          className="input-field pl-10 font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 mt-2"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Criando conta...</>
                  ) : (
                    <><UserPlus className="w-4 h-4" />Criar conta</>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Ao criar uma conta, você será cadastrado como Profissional de Saúde.
                  Um administrador pode ajustar suas permissões.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
