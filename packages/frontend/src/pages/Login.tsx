import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Eye, EyeOff, Lock, Mail, AlertCircle, LogIn,
  KeyRound, X, Send, MessageSquare, CalendarCheck,
  DollarSign, BarChart3, Headphones, TrendingUp,
  Shield, Sparkles, ArrowRight, Play,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { ClinicIcon } from '../components/ui/ClinicLogo'

/* ─── Schema ─── */
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type LoginForm = z.infer<typeof loginSchema>

/* ─── Greeting helper ─── */
function getGreeting(name: string) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  return `${greeting}, ${name.split(' ')[0]}!`
}

/* ─── Floating card data ─── */
const FLOATING_CARDS = [
  {
    icon: MessageSquare,
    title: 'Pré-agendamento recebido',
    subtitle: 'via WhatsApp · agora',
    accent: 'from-green-400 to-emerald-500',
    accentBg: 'bg-green-500/15',
    accentText: 'text-green-400',
    dot: 'bg-green-400',
    badge: 'Novo',
    badgeColor: 'bg-green-500/20 text-green-300',
  },
  {
    icon: CalendarCheck,
    title: 'Consulta confirmada',
    subtitle: 'Dr. Oliveira · 14:30',
    accent: 'from-blue-400 to-cyan-500',
    accentBg: 'bg-blue-500/15',
    accentText: 'text-blue-400',
    dot: 'bg-blue-400',
    badge: 'Agenda',
    badgeColor: 'bg-blue-500/20 text-blue-300',
  },
  {
    icon: DollarSign,
    title: 'Pagamento recebido',
    subtitle: 'R$ 350,00 · Cartão',
    accent: 'from-emerald-400 to-teal-500',
    accentBg: 'bg-emerald-500/15',
    accentText: 'text-emerald-400',
    dot: 'bg-emerald-400',
    badge: 'R$ 350',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
  },
  {
    icon: BarChart3,
    title: 'Relatório atualizado',
    subtitle: 'Mensal · Julho 2026',
    accent: 'from-violet-400 to-purple-500',
    accentBg: 'bg-violet-500/15',
    accentText: 'text-violet-400',
    dot: 'bg-violet-400',
    badge: 'Pronto',
    badgeColor: 'bg-violet-500/20 text-violet-300',
  },
  {
    icon: Headphones,
    title: 'Secretária online',
    subtitle: '3 chats ativos',
    accent: 'from-cyan-400 to-sky-500',
    accentBg: 'bg-cyan-500/15',
    accentText: 'text-cyan-400',
    dot: 'bg-cyan-400 animate-pulse',
    badge: 'Online',
    badgeColor: 'bg-cyan-500/20 text-cyan-300',
  },
  {
    icon: TrendingUp,
    title: 'Taxa de ocupação',
    subtitle: '87% da agenda preenchida',
    accent: 'from-amber-400 to-orange-500',
    accentBg: 'bg-amber-500/15',
    accentText: 'text-amber-400',
    dot: 'bg-amber-400',
    badge: '87%',
    badgeColor: 'bg-amber-500/20 text-amber-300',
  },
]

/* ─── Google SVG Icon ─── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginPhase, setLoginPhase] = useState<'idle' | 'loading' | 'preparing'>('idle')
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  const onLogin = async (data: LoginForm) => {
    setLoading(true)
    setLoginPhase('loading')
    try {
      // Simulate a brief loading state for UX
      await new Promise(r => setTimeout(r, 800))
      setLoginPhase('preparing')

      const res = await api.post('/auth/login', data)
      const { token, user } = res.data
      setAuth(user, token)

      await new Promise(r => setTimeout(r, 1200))

      toast.success(getGreeting(user.name), {
        duration: 4000,
        style: { background: '#0f172a', color: '#f8fafc', fontSize: '15px', fontWeight: '500' },
      })
      navigate('/dashboard')
    } catch (error: unknown) {
      setLoginPhase('idle')
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao fazer login'
      setError('email', { message })
    } finally {
      setLoading(false)
    }
  }

  const onDemoLogin = async () => {
    setLoading(true)
    setLoginPhase('loading')
    try {
      await new Promise(r => setTimeout(r, 600))
      setLoginPhase('preparing')

      const res = await api.post('/auth/login', {
        email: 'demo@cliniqpro.com',
        password: 'demo123',
      })
      const { token, user } = res.data
      setAuth(user, token)

      await new Promise(r => setTimeout(r, 1200))

      toast.success('Bem-vindo ao modo demonstração!', {
        duration: 4000,
        style: { background: '#0f172a', color: '#f8fafc', fontSize: '15px', fontWeight: '500' },
      })
      navigate('/dashboard')
    } catch {
      setLoginPhase('idle')
      toast.error('Modo demonstração indisponível no momento')
    } finally {
      setLoading(false)
    }
  }

  const onForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail) return
    setForgotLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail })
      setForgotSuccess(true)
    } catch {
      setForgotSuccess(true)
    } finally {
      setForgotLoading(false)
    }
  }

  const closeForgotModal = () => {
    setShowForgotModal(false)
    setForgotEmail('')
    setForgotSuccess(false)
    setForgotLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* ════════════════════════════════════════════════════════
          LEFT COLUMN — Institutional / Visual (hidden on mobile,
          shown after login card on small screens via order)
          ════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col"
        style={{ background: 'linear-gradient(145deg, #0a0f1e 0%, #0f172a 35%, #0c1a3d 65%, #0d1f3c 100%)' }}
      >
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Gradient orbs */}
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)' }} />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.05]"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }} />

          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />

          {/* Floating dots */}
          <div className="absolute top-24 right-24 w-2 h-2 bg-cyan-400/40 rounded-full animate-pulse-soft" />
          <div className="absolute bottom-32 left-1/4 w-1.5 h-1.5 bg-blue-400/30 rounded-full animate-float" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-white/20 rounded-full animate-pulse-soft"
            style={{ animationDelay: '1s' }} />
          <div className="absolute top-2/3 left-1/3 w-1.5 h-1.5 bg-emerald-400/20 rounded-full animate-float-slow" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10 xl:p-14">
          {/* Top: Logo + Headline */}
          <div>
            <div className={`flex items-center gap-3.5 mb-14 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
              <ClinicIcon size="lg" />
              <div>
                <h1 className="text-white font-bold text-2xl tracking-tight">
                  Clinic <span className="text-cyan-400 font-light">Pro</span>
                </h1>
                <p className="text-slate-400 text-xs tracking-wide">Gestão Clínica Inteligente</p>
              </div>
            </div>

            <div className={`max-w-lg mb-10 transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
              <h2 className="text-white text-3xl xl:text-[2.5rem] font-bold leading-[1.15] mb-5">
                Sua clínica organizada{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  do WhatsApp ao financeiro
                </span>
              </h2>
              <p className="text-slate-400 text-base leading-relaxed max-w-md">
                Centralize agenda, atendimento, pacientes, equipe, pré-agendamentos,
                financeiro e relatórios em uma única plataforma inteligente.
              </p>
            </div>
          </div>

          {/* Middle: Floating dashboard cards */}
          <div className="flex-1 flex items-center">
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {FLOATING_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className={`group relative bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-xl p-3.5
                    hover:bg-white/[0.08] hover:border-white/[0.15] hover:shadow-lg hover:shadow-cyan-500/5
                    transition-all duration-500 cursor-default
                    ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                  style={{ transitionDelay: `${300 + i * 120}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${card.accentBg} flex items-center justify-center flex-shrink-0
                      group-hover:scale-110 transition-transform duration-300`}
                    >
                      <card.icon className={`w-4.5 h-4.5 ${card.accentText}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-white/90 text-[13px] font-medium truncate">{card.title}</p>
                      </div>
                      <p className="text-slate-500 text-[11px]">{card.subtitle}</p>
                    </div>
                  </div>
                  {/* Badge */}
                  <div className="absolute top-2.5 right-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${card.badgeColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${card.dot}`} />
                      {card.badge}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Security + Copyright */}
          <div className={`transition-all duration-700 delay-[1000ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-400/70" />
              <p className="text-slate-500 text-xs">Dados protegidos com criptografia de ponta a ponta</p>
            </div>
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-slate-600 text-xs">
                © {new Date().getFullYear()} Clinic Pro · Todos os direitos reservados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          RIGHT COLUMN — Login Card
          ════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 lg:p-12 bg-white relative min-h-screen lg:min-h-0">
        {/* Subtle background pattern for right side */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #64748b 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        <div className={`w-full max-w-[420px] relative z-10 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <ClinicIcon size="lg" />
            <div>
              <h1 className="text-slate-900 font-bold text-xl tracking-tight">
                Clinic <span className="text-cyan-600 font-light">Pro</span>
              </h1>
              <p className="text-slate-400 text-xs tracking-wide">Gestão Clínica Inteligente</p>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-sm shadow-blue-600/20 lg:hidden">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="hidden lg:flex w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-100/50 items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-600" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-[1.7rem] font-bold text-slate-900 mb-1.5 tracking-tight">
              Bem-vindo(a) à Clinic Pro
            </h2>
            <p className="text-slate-500 text-sm">
              Acesse sua clínica e continue de onde parou.
            </p>
          </div>

          {/* Google Button */}
          <button
            type="button"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-200
              rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300
              hover:shadow-sm transition-all duration-200 disabled:opacity-50 mb-5 group
              focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            id="login-google-button"
          >
            <GoogleIcon />
            <span>Entrar com Google</span>
            <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
          </button>

          {/* Divider */}
          <div className="relative flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-slate-400 text-xs font-medium">ou acesse com e-mail</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit(onLogin)} className="space-y-4" id="login-form">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                E-mail
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400
                  group-focus-within:text-cyan-500 transition-colors duration-200" />
                <input
                  {...register('email')}
                  type="email"
                  id="login-email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className={`w-full py-3 pl-11 pr-4 bg-slate-50 border rounded-xl text-sm text-slate-900
                    placeholder:text-slate-400 transition-all duration-200
                    focus:bg-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none
                    hover:border-slate-300
                    ${errors.email
                      ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-400/20'
                      : 'border-slate-200'}`}
                />
              </div>
              {errors.email && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600 animate-fade-in-fast" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400
                  group-focus-within:text-cyan-500 transition-colors duration-200" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full py-3 pl-11 pr-11 bg-slate-50 border rounded-xl text-sm text-slate-900
                    placeholder:text-slate-400 transition-all duration-200
                    focus:bg-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none
                    hover:border-slate-300
                    ${errors.password
                      ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-400/20'
                      : 'border-slate-200'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600
                    transition-colors duration-200 p-0.5 rounded-md focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
              {errors.password && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600 animate-fade-in-fast" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.password.message}
                </p>
              )}
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-cyan-600 hover:text-cyan-700 font-medium hover:underline
                    transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
                  id="forgot-password-link"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-blue-700
                hover:from-cyan-500 hover:via-blue-500 hover:to-blue-600
                text-white font-semibold rounded-xl transition-all duration-300
                disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2.5
                shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30
                hover:-translate-y-0.5 active:translate-y-0
                focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 mt-3"
              id="login-submit-button"
            >
              {loginPhase === 'preparing' ? (
                <>
                  <div className="w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="animate-pulse">Preparando sua clínica...</span>
                </>
              ) : loginPhase === 'loading' ? (
                <>
                  <div className="w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4.5 h-4.5" />
                  <span>Entrar na plataforma</span>
                </>
              )}
            </button>
          </form>

          {/* Secondary Actions */}
          <div className="mt-6 space-y-3">
            {/* Demo Mode */}
            <button
              type="button"
              onClick={onDemoLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4
                bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600
                hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800
                transition-all duration-200 disabled:opacity-50 group
                focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              id="demo-mode-button"
            >
              <Play className="w-4 h-4 text-emerald-500 group-hover:text-emerald-600 transition-colors" />
              <span>Entrar em modo demonstração</span>
            </button>

            {/* Request Demo */}
            <div className="text-center pt-1">
              <a
                href="mailto:contato@clinicpro.com.br?subject=Solicitar demonstração"
                className="text-xs text-slate-500 hover:text-cyan-600 transition-colors duration-200
                  focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm inline-flex items-center gap-1.5"
                id="request-demo-link"
              >
                <Sparkles className="w-3 h-3" />
                Solicitar demonstração personalizada
              </a>
            </div>
          </div>
        </div>

        {/* Right side footer */}
        <div className={`mt-auto pt-8 w-full max-w-[420px] transition-all duration-700 delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <span>Termos de Uso</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>Privacidade</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>Suporte</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          MOBILE BENEFITS SECTION (shown after login card)
          ════════════════════════════════════════════════════════ */}
      <div className="lg:hidden bg-gradient-to-b from-slate-900 to-slate-950 p-6 pb-10">
        <h3 className="text-white text-lg font-bold mb-1 tracking-tight">
          Tudo em uma <span className="text-cyan-400">plataforma</span>
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          Centralize a gestão da sua clínica com inteligência.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {FLOATING_CARDS.slice(0, 4).map((card) => (
            <div
              key={card.title}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl p-3 flex items-start gap-2.5"
            >
              <div className={`w-8 h-8 rounded-lg ${card.accentBg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`w-4 h-4 ${card.accentText}`} />
              </div>
              <div className="min-w-0">
                <p className="text-white/80 text-xs font-medium truncate">{card.title}</p>
                <p className="text-slate-500 text-[10px]">{card.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-400/60" />
          <p className="text-slate-500 text-[11px]">Dados protegidos com criptografia</p>
        </div>
        <p className="text-center text-slate-600 text-[11px] mt-4">
          © {new Date().getFullYear()} Clinic Pro · Todos os direitos reservados
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════
          FORGOT PASSWORD MODAL
          ════════════════════════════════════════════════════════ */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in-fast"
          onClick={(e) => { if (e.target === e.currentTarget) closeForgotModal() }}
          role="dialog"
          aria-modal="true"
          aria-label="Redefinir senha"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden animate-scale-in">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow shadow-blue-600/20">
                  <KeyRound className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="text-slate-900 font-bold text-base">Redefinir senha</h3>
                  <p className="text-slate-400 text-xs">Recuperação de acesso</p>
                </div>
              </div>
              <button
                onClick={closeForgotModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all
                  focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-6">
              {forgotSuccess ? (
                <div className="flex flex-col items-center text-center py-4 gap-4">
                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center">
                    <Mail className="w-7 h-7 text-green-500" />
                  </div>
                  <div>
                    <p className="text-slate-900 font-semibold text-base mb-1">E-mail enviado!</p>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
                    </p>
                  </div>
                  <button
                    onClick={closeForgotModal}
                    className="mt-2 w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 text-sm shadow shadow-blue-600/20
                      focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <form onSubmit={onForgotPassword} className="space-y-5">
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Digite seu e-mail e enviaremos as instruções para redefinir sua senha.
                  </p>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        id="forgot-email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full py-3 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900
                          placeholder:text-slate-400 transition-all duration-200
                          focus:bg-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeForgotModal}
                      className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-lg transition-all duration-200 text-sm
                        focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading || !forgotEmail}
                      className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow shadow-blue-600/20
                        focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      {forgotLoading ? (
                        <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</>
                      ) : (
                        <><Send className="w-3.5 h-3.5" />Enviar instruções</>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
