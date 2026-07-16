import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Users,
  UserPlus,
  Link2,
  Trash2,
  Mail,
  Phone,
  ShieldCheck,
  ShieldOff,
  X,
  Plus,
  UserCircle2,
  Settings2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { DoctorSecretary } from '../../types'
import Modal from '../../components/ui/Modal'
import { SECRETARY_PERMISSION_KEYS, SECRETARY_PERMISSION_LABELS, PERMISSION_KEY_TO_INTEGRATION_TYPE, type SecretaryPermissionKey, type SecretaryPermissions } from '../../hooks/useSecretaryPermissions'

const createSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  phone: z.string().optional(),
})

const linkSchema = z.object({
  email: z.string().email('Email inválido'),
})

type CreateForm = z.infer<typeof createSchema>
type LinkForm = z.infer<typeof linkSchema>

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-violet-500 to-violet-700',
  'from-cyan-500 to-cyan-700',
  'from-emerald-500 to-emerald-700',
  'from-rose-500 to-rose-700',
]

export default function Equipe() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'list' | 'create' | 'link'>('list')
  const [accessLink, setAccessLink] = useState<DoctorSecretary | null>(null)

  const { data: activeAddonTypes = [] } = useQuery<{ type: string; status: string }[]>({
    queryKey: ['integration-addons'],
    queryFn: () => api.get('/integration-addons').then(r => r.data),
  })
  const activeTypeSet = new Set(activeAddonTypes.filter(a => a.status === 'ACTIVE').map(a => a.type))
  const visiblePermissionKeys = SECRETARY_PERMISSION_KEYS.filter(key => {
    const integrationType = PERMISSION_KEY_TO_INTEGRATION_TYPE[key]
    return !integrationType || activeTypeSet.has(integrationType)
  })

  const { data: team = [], isLoading } = useQuery<DoctorSecretary[]>({
    queryKey: ['team'],
    queryFn: () => api.get('/team').then(r => r.data),
  })

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const linkForm = useForm<LinkForm>({ resolver: zodResolver(linkSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/team/secretary', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      toast.success('Secretaria criada e vinculada com sucesso!')
      createForm.reset()
      setMode('list')
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao criar secretaria')
    },
  })

  const linkMutation = useMutation({
    mutationFn: (data: LinkForm) => api.post('/team/link', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      toast.success('Secretaria vinculada com sucesso!')
      linkForm.reset()
      setMode('list')
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao vincular secretaria')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (linkId: string) => api.patch(`/team/${linkId}/toggle`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: () => toast.error('Erro ao alterar status'),
  })

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => api.delete(`/team/${linkId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      toast.success('Secretaria desvinculada')
    },
    onError: () => toast.error('Erro ao desvincular'),
  })

  const permissionsMutation = useMutation({
    mutationFn: ({ linkId, permissions }: { linkId: string; permissions: SecretaryPermissions }) =>
      api.patch(`/team/${linkId}/permissions`, permissions).then(r => r.data),
    onSuccess: (updated: DoctorSecretary) => {
      qc.invalidateQueries({ queryKey: ['team'] })
      setAccessLink(updated)
      toast.success('Acessos atualizados')
    },
    onError: () => toast.error('Erro ao atualizar acessos'),
  })

  const activeCount = team.filter(t => t.active).length

  return (
    <div className="max-w-2xl mx-auto space-y-6 page-stagger">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-stagger-1">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Minha Equipe
          </h1>
          <p className="page-subtitle">Gerencie as secretarias vinculadas à sua agenda</p>
        </div>
        {mode === 'list' && (
          <div className="flex gap-2 self-start sm:self-auto">
            <button onClick={() => setMode('link')} className="btn-secondary">
              <Link2 className="w-3.5 h-3.5" />
              Vincular
            </button>
            <button onClick={() => setMode('create')} className="btn-primary">
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nova secretaria</span>
              <span className="sm:hidden">Nova</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      {mode === 'list' && (
        <div className="grid grid-cols-2 gap-4 animate-stagger-2">
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 flex-shrink-0">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{team.length}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Vinculadas</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{activeCount}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Ativas</p>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {mode === 'create' && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
            <h3 className="text-slate-900 font-bold flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              Criar nova secretaria
            </h3>
            <button
              onClick={() => setMode('list')}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nome completo *</label>
                <input
                  {...createForm.register('name')}
                  placeholder="Nome da secretaria"
                  className="input-field w-full"
                />
                {createForm.formState.errors.name && (
                  <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Telefone</label>
                <input
                  {...createForm.register('phone')}
                  placeholder="(00) 00000-0000"
                  className="input-field w-full"
                />
              </div>
            </div>
            <div>
              <label className="label">Email de acesso *</label>
              <input
                {...createForm.register('email')}
                type="email"
                placeholder="secretaria@email.com"
                className="input-field w-full"
              />
              {createForm.formState.errors.email && (
                <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="label">Senha de acesso *</label>
              <input
                {...createForm.register('password')}
                type="password"
                placeholder="Mínimo 6 caracteres"
                className="input-field w-full"
              />
              {createForm.formState.errors.password && (
                <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
              <p className="font-semibold text-blue-900">Regras da Conta:</p>
              <p>A secretaria poderá acessar a agenda, pacientes e prontuários. Ela <strong className="text-blue-950">não terá acesso</strong> ao financeiro e nem aos laudos.</p>
              <p>Horários bloqueados aparecerão como <strong className="text-blue-950">"Bloqueado"</strong> para ela.</p>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setMode('list')} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Criando...
                  </>
                ) : 'Criar e vincular'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Link form */}
      {mode === 'link' && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
            <h3 className="text-slate-900 font-bold flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
                <Link2 className="w-4 h-4 text-blue-600" />
              </div>
              Vincular secretaria existente
            </h3>
            <button
              onClick={() => setMode('list')}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={linkForm.handleSubmit(d => linkMutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Email da secretaria *</label>
              <input
                {...linkForm.register('email')}
                type="email"
                placeholder="Digite o email da secretaria cadastrada"
                className="input-field w-full"
              />
              {linkForm.formState.errors.email && (
                <p className="text-red-500 text-xs mt-1">{linkForm.formState.errors.email.message}</p>
              )}
            </div>
            <p className="text-xs text-slate-500">
              A secretaria deve já ter um cadastro com perfil "Secretaria" no sistema.
            </p>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setMode('list')} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={linkMutation.isPending} className="btn-primary">
                {linkMutation.isPending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Vinculando...
                  </>
                ) : 'Vincular'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Team list */}
      {mode === 'list' && (
        <div className="space-y-3 animate-stagger-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card flex items-center gap-4 py-4" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="skeleton-circle w-11 h-11 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-text w-2/5" />
                  <div className="skeleton-text w-3/5" />
                </div>
              </div>
            ))
          ) : team.length === 0 ? (
            <div className="card border-2 border-dashed border-slate-200 bg-slate-50/40 p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-float">
                <UserCircle2 className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-600 font-semibold">Nenhuma secretaria vinculada</p>
              <p className="text-slate-400 text-sm mt-1">
                Crie um acesso ou vincule uma secretaria já cadastrada
              </p>
              <div className="flex gap-3 justify-center mt-5">
                <button onClick={() => setMode('link')} className="btn-secondary">
                  <Link2 className="w-3.5 h-3.5" />
                  Vincular existente
                </button>
                <button onClick={() => setMode('create')} className="btn-primary">
                  <UserPlus className="w-3.5 h-3.5" />
                  Criar nova
                </button>
              </div>
            </div>
          ) : (
            team.map((link, idx) => (
              <div
                key={link.id}
                className={`card p-4 flex items-center gap-4 group transition-all duration-200 hover:border-slate-300 hover:shadow-md ${
                  link.active ? 'border-slate-200' : 'opacity-60 bg-slate-50'
                }`}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm ${link.active ? `bg-gradient-to-br ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} text-white` : 'bg-slate-200 text-slate-400'}`}>
                  {link.secretary.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-900 font-semibold">{link.secretary.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${link.active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {link.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {link.secretary.email}
                    </span>
                    {link.secretary.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {link.secretary.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setAccessLink(link)}
                    title="Gestão de acessos"
                    className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate(link.id)}
                    disabled={toggleMutation.isPending}
                    title={link.active ? 'Desativar acesso' : 'Ativar acesso'}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
                  >
                    {link.active ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ShieldOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Desvincular ${link.secretary.name}?`)) {
                        unlinkMutation.mutate(link.id)
                      }
                    }}
                    disabled={unlinkMutation.isPending}
                    title="Desvincular secretaria"
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Access rules note */}
      {mode === 'list' && team.length > 0 && (
        <div className="card bg-blue-50 border-blue-200 p-5 animate-stagger-4">
          <p className="text-xs text-blue-900 font-bold uppercase tracking-wider mb-3">
            Regras de acesso da secretaria
          </p>
          <ul className="space-y-2">
            {[
              { color: 'bg-blue-500', text: 'Visualiza a agenda apenas do médico vinculado' },
              { color: 'bg-blue-500', text: 'Pode agendar, confirmar e cancelar consultas' },
              { color: 'bg-blue-500', text: 'Pode criar pré-cadastros e finalizar cadastros pendentes' },
              { color: 'bg-emerald-500', text: 'Acesso ao Financeiro configurável em "Gestão de Acessos"' },
              { color: 'bg-red-500', text: 'Não acessa laudos e avaliações' },
              { color: 'bg-red-500', text: 'Configurações financeiras (categorias, contas) são exclusivas do médico' },
              { color: 'bg-amber-500', text: 'Horários bloqueados pelo médico aparecem como "Bloqueado"' },
            ].map(({ color, text }) => (
              <li key={text} className="flex items-start gap-2 text-sm text-blue-700">
                <span className={`w-1.5 h-1.5 rounded-full ${color} flex-shrink-0 mt-1.5`} />
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Access management modal */}
      <Modal
        isOpen={!!accessLink}
        onClose={() => setAccessLink(null)}
        title="Gestão de Acessos"
        subtitle={accessLink ? accessLink.secretary.name : undefined}
      >
        {accessLink && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Marque as telas e funcionalidades que <strong>{accessLink.secretary.name}</strong> pode acessar.
              Agenda, Pacientes e Prontuário já estão sempre liberados. Avaliações e agendas de outros médicos/salas continuam sempre bloqueados.
            </p>
            <div className="space-y-2">
              {visiblePermissionKeys.map((key: SecretaryPermissionKey) => {
                const checked = !!accessLink.permissions?.[key]
                return (
                  <label
                    key={key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={permissionsMutation.isPending}
                      onChange={(e) =>
                        permissionsMutation.mutate({
                          linkId: accessLink.id,
                          permissions: { [key]: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{SECRETARY_PERMISSION_LABELS[key]}</span>
                  </label>
                )
              })}
            </div>
            {activeTypeSet.size === 0 && (
              <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                Nenhuma integração contratada ainda — contrate em Configurações → Integrações para liberar o acesso de secretárias a elas.
              </p>
            )}
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setAccessLink(null)} className="btn-secondary">
                Concluído
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
