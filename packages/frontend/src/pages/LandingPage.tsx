import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap,
  Calendar,
  Brain,
  FileText,
  DollarSign,
  Users,
  Link2,
  ChevronRight,
  Star,
  Check,
  ArrowRight,
  Menu,
  X,
  Linkedin,
  Instagram,
  Shield,
  Clock,
  CreditCard,
} from 'lucide-react'

// ─── Navigation ────────────────────────────────────────────────────────────────

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'Funcionalidades', href: '#funcionalidades' },
    { label: 'Planos', href: '#planos' },
    { label: 'Suporte', href: '#suporte' },
  ]

  const handleAnchorClick = (href: string) => {
    setMenuOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60 shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-18">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-500/50 transition-shadow">
                <Zap size={16} className="text-white fill-white" />
              </div>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              ClinIQ Pro
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleAnchorClick(link.href)}
                className="text-slate-400 hover:text-white text-sm font-medium transition-colors duration-200 cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 flex items-center gap-1.5"
            >
              Acessar Plataforma
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-slate-950/98 backdrop-blur-md border-t border-slate-800/60">
          <div className="px-4 py-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleAnchorClick(link.href)}
                className="text-left text-slate-300 hover:text-white py-2 text-sm font-medium transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-2 border-t border-slate-800">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="block w-full text-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all"
              >
                Acessar Plataforma
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-600/12 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/8 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,179,237,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,179,237,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-24 pb-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-sm font-medium mb-8">
          <Zap size={14} className="fill-cyan-400" />
          Gestão Clínica Inteligente
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 tracking-tight">
          Eleve o padrão{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-blue-600 bg-clip-text text-transparent">
            da sua clínica
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Plataforma completa para psicólogos, neuropsicólogos e profissionais de saúde. Agenda
          inteligente, prontuário eletrônico, laudos cognitivos e controle financeiro em um só lugar.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-base hover:from-cyan-400 hover:to-blue-500 transition-all duration-200 shadow-xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:-translate-y-0.5"
          >
            Começar gratuitamente
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <button
            onClick={() => {
              document.querySelector('#funcionalidades')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-base hover:border-slate-500 hover:text-white hover:bg-slate-800/50 transition-all duration-200"
          >
            Ver demonstração
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Social proof */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-10">
          <div className="flex items-center gap-3">
            {/* Avatar group */}
            <div className="flex -space-x-2">
              {['C', 'A', 'R', 'M', 'L'].map((initial, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-slate-950 flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    background: `hsl(${190 + i * 20}, 70%, 45%)`,
                  }}
                >
                  {initial}
                </div>
              ))}
            </div>
            <span className="text-slate-400 text-sm">
              <span className="text-white font-semibold">+500</span> profissionais de saúde confiam no
              ClinIQ Pro
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
            ))}
            <span className="text-slate-400 text-sm ml-1">4.9/5</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {[
            { icon: Clock, label: '30 dias grátis' },
            { icon: CreditCard, label: 'Sem cartão de crédito' },
            { icon: Shield, label: 'Suporte em português' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-400 text-sm">
              <Icon size={15} className="text-cyan-500" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features ──────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Calendar,
    title: 'Agenda Inteligente',
    description:
      'Controle sua agenda com bloqueio de horários, confirmações automáticas e visualização diária/semanal.',
    color: 'from-cyan-500 to-cyan-600',
    glow: 'group-hover:shadow-cyan-500/20',
  },
  {
    icon: Brain,
    title: 'Laudos Cognitivos',
    description:
      'Correção automatizada de WISC-IV, WASI, WAIS-III e outros instrumentos psicológicos.',
    color: 'from-purple-500 to-purple-600',
    glow: 'group-hover:shadow-purple-500/20',
  },
  {
    icon: FileText,
    title: 'Prontuário Eletrônico',
    description:
      'Registros por profissional com anamnese, evolução, prescrições e histórico completo.',
    color: 'from-blue-500 to-blue-600',
    glow: 'group-hover:shadow-blue-500/20',
  },
  {
    icon: DollarSign,
    title: 'Controle Financeiro',
    description:
      'Gestão de receitas e despesas, planos de saúde, convênios e relatórios financeiros.',
    color: 'from-emerald-500 to-emerald-600',
    glow: 'group-hover:shadow-emerald-500/20',
  },
  {
    icon: Users,
    title: 'Gestão de Equipe',
    description:
      'Gerencie médicos e secretárias com controle de acesso por função e permissões granulares.',
    color: 'from-orange-500 to-orange-600',
    glow: 'group-hover:shadow-orange-500/20',
  },
  {
    icon: Link2,
    title: 'Integrações',
    description:
      'Conecte com Google Calendar, WhatsApp e outros sistemas via webhooks e API aberta.',
    color: 'from-pink-500 to-rose-500',
    glow: 'group-hover:shadow-pink-500/20',
  },
]

function Features() {
  return (
    <section id="funcionalidades" className="py-24 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-sm font-medium mb-4">
            Funcionalidades
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Tudo que você precisa{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              em um só lugar
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Uma plataforma unificada desenvolvida exclusivamente para profissionais de saúde
            brasileiros.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`group relative p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${feature.glow}`}
            >
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}
              >
                <feature.icon size={20} className="text-white" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How it works ──────────────────────────────────────────────────────────────

const steps = [
  {
    number: '01',
    title: 'Crie sua conta',
    description: 'Cadastre-se gratuitamente e configure seu perfil profissional em minutos.',
    color: 'from-cyan-500 to-cyan-600',
  },
  {
    number: '02',
    title: 'Configure sua clínica',
    description: 'Adicione sua equipe, salas, convênios e tipos de atendimento.',
    color: 'from-blue-500 to-blue-600',
  },
  {
    number: '03',
    title: 'Comece a atender',
    description: 'Gerencie sua agenda, prontuários e finanças de qualquer dispositivo.',
    color: 'from-violet-500 to-violet-600',
  },
]

function HowItWorks() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-sm font-medium mb-4">
            Como funciona
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Três passos para{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              transformar sua clínica
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Configure em menos de 5 minutos e comece a ver resultados imediatamente.
          </p>
        </div>

        <div className="relative flex flex-col lg:flex-row items-start gap-8 lg:gap-0">
          {/* Connecting line (desktop) */}
          <div className="hidden lg:block absolute top-10 left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] h-px bg-gradient-to-r from-cyan-500/40 via-blue-500/40 to-violet-500/40" />

          {steps.map((step, index) => (
            <div key={step.number} className="relative flex-1 flex flex-col items-center text-center px-6">
              {/* Number circle */}
              <div
                className={`relative z-10 w-20 h-20 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-2xl`}
              >
                <span className="text-white text-2xl font-black">{index + 1}</span>
              </div>
              <h3 className="text-white font-bold text-xl mb-3">{step.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">{step.description}</p>
            </div>
          ))}
        </div>

        {/* CTA below steps */}
        <div className="text-center mt-14">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5"
          >
            Criar conta gratuitamente
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

const trialFeatures = [
  'Agenda completa',
  'Prontuário eletrônico',
  'Laudos cognitivos (WISC-IV, WASI)',
  'Suporte por e-mail',
  '1 profissional incluído',
]

const proFeatures = [
  'Tudo do Trial incluído',
  'Profissionais ilimitados',
  'Controle financeiro avançado',
  'Integrações (WhatsApp, Google)',
  'Suporte prioritário 24/7',
  'Relatórios e analytics avançados',
  'API e webhooks',
]

function Pricing() {
  const [annual, setAnnual] = useState(false)

  return (
    <section id="planos" className="py-24 bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-sm font-medium mb-4">
            Planos
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Simples e{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              transparentes
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto mb-8">
            Comece gratuitamente, sem cartão de crédito. Faça upgrade quando quiser.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                !annual ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                annual ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Anual
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-semibold">
                -17%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Trial */}
          <div className="relative p-8 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col">
            <div className="mb-6">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-bold tracking-widest uppercase mb-4">
                Trial
              </span>
              <div className="text-3xl font-black text-white mb-1">Grátis</div>
              <div className="text-slate-400 text-sm">por 30 dias, sem cartão</div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {trialFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-slate-300 text-sm">
                  <Check size={16} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to="/login"
              className="block w-full text-center px-6 py-3 rounded-xl border border-slate-600 text-white font-semibold hover:border-slate-400 hover:bg-slate-700/50 transition-all"
            >
              Começar grátis
            </Link>
          </div>

          {/* Pro */}
          <div className="relative p-8 rounded-2xl bg-gradient-to-b from-blue-950/80 to-slate-900/80 border border-blue-500/40 flex flex-col shadow-2xl shadow-blue-900/30">
            {/* Popular badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-block px-4 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/30">
                Mais popular
              </span>
            </div>

            <div className="mb-6">
              <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold tracking-widest uppercase mb-4">
                Pro
              </span>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-3xl font-black text-white">
                  {annual ? 'R$ 970' : 'R$ 97'}
                </span>
                <span className="text-slate-400 text-sm mb-1">{annual ? '/ano' : '/mês'}</span>
              </div>
              {annual && (
                <div className="text-emerald-400 text-sm font-medium">
                  Equivale a R$ 80,83/mês — economize R$ 194/ano
                </div>
              )}
              {!annual && (
                <div className="text-slate-400 text-sm">
                  ou R$ 970/ano e economize R$ 194
                </div>
              )}
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-slate-200 text-sm">
                  <Check size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to="/login"
              className="block w-full text-center px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40"
            >
              Assinar agora
            </Link>
          </div>
        </div>

        {/* Guarantee */}
        <p className="text-center text-slate-500 text-sm mt-8">
          <Shield size={14} className="inline-block mr-1.5 text-emerald-500" />
          Garantia de satisfação de 30 dias · Cancele a qualquer momento · Dados exportáveis
        </p>
      </div>
    </section>
  )
}

// ─── Testimonials ──────────────────────────────────────────────────────────────

const testimonials = [
  {
    name: 'Dr. Carlos Mendes',
    role: 'Psicólogo — CRP/SP',
    initial: 'C',
    color: '#0891b2',
    quote:
      'O ClinIQ Pro transformou minha gestão de consultório. Economizo 2 horas por dia com a agenda automatizada e confirmações via WhatsApp.',
  },
  {
    name: 'Dra. Ana Ribeiro',
    role: 'Neuropsicóloga — CRM/RJ',
    initial: 'A',
    color: '#2563eb',
    quote:
      'Os laudos do WISC-IV e WAIS-III são gerados automaticamente. Redução de 80% no tempo de elaboração e muito mais precisão.',
  },
  {
    name: 'Clínica Saúde Integrada',
    role: 'Equipe multidisciplinar — SP',
    initial: 'S',
    color: '#7c3aed',
    quote:
      'Gerenciamos 5 profissionais na mesma plataforma. Controle total das finanças, agendas e prontuários em tempo real.',
  },
]

function Testimonials() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm font-medium mb-4">
            Depoimentos
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Quem já usa{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              aprova
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Profissionais de saúde em todo o Brasil confiam no ClinIQ Pro.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col gap-4 hover:border-slate-600/70 transition-colors"
            >
              {/* Stars */}
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-slate-300 text-sm leading-relaxed flex-1">"{t.quote}"</p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-700/60">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: t.color }}
                >
                  {t.initial}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{t.name}</div>
                  <div className="text-slate-500 text-xs">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ─────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="py-24 bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyan-500/8 rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-sm font-medium mb-6">
          <Zap size={14} className="fill-cyan-400" />
          Comece hoje
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
          Comece a transformar{' '}
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            sua clínica hoje
          </span>
        </h2>
        <p className="text-slate-400 text-lg mb-10">
          30 dias grátis, sem cartão de crédito. Configure em menos de 5 minutos.
        </p>

        <Link
          to="/login"
          className="group inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:-translate-y-0.5"
        >
          Criar conta gratuita
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-8 mt-10">
          {[
            { icon: Clock, label: '30 dias grátis' },
            { icon: CreditCard, label: 'Sem cartão de crédito' },
            { icon: Shield, label: 'Dados seguros e criptografados' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-400 text-sm">
              <Icon size={15} className="text-cyan-500" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  const handleAnchorClick = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer id="suporte" className="bg-slate-950 border-t border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <Zap size={16} className="text-white fill-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                ClinIQ Pro
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              Plataforma completa de gestão clínica para profissionais de saúde brasileiros. Agenda,
              prontuário, laudos e finanças em um só lugar.
            </p>
            <div className="flex gap-3 mt-5">
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                aria-label="LinkedIn"
              >
                <Linkedin size={16} />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                aria-label="Instagram"
              >
                <Instagram size={16} />
              </a>
            </div>
          </div>

          {/* Plataforma */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
              Plataforma
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Funcionalidades', href: '#funcionalidades', anchor: true },
                { label: 'Planos', href: '#planos', anchor: true },
                { label: 'Entrar', href: '/login', anchor: false },
              ].map((item) => (
                <li key={item.label}>
                  {item.anchor ? (
                    <button
                      onClick={() => handleAnchorClick(item.href)}
                      className="text-slate-400 hover:text-white text-sm transition-colors cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      to={item.href}
                      className="text-slate-400 hover:text-white text-sm transition-colors"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
              Suporte
            </h4>
            <ul className="space-y-2.5">
              {[
                'Central de ajuda',
                'Documentação',
                'Tutoriais',
                'Status do sistema',
                'Contato',
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">
            © 2024 ClinIQ Pro. Todos os direitos reservados.
          </p>
          <p className="text-slate-500 text-sm">
            Desenvolvido com ❤️ para profissionais de saúde brasileiros
          </p>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 antialiased">
      <style>{`html { scroll-behavior: smooth; }`}</style>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  )
}
