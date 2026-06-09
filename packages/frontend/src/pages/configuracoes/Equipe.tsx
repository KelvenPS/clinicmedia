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
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { DoctorSecretary } from '../../types'

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

export default function Equipe() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'list' | 'create' | 'link'>('list')

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

  const activeCount = team.filter(t => t.active).length

  return (
    <div className="max-w-2xl space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 animate-stagger-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Minha Equipe
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Gerencie as secretarias vinculadas à sua agenda
          </p>
        </div>
        {mode === 'list' && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode('link')}
              className="btn-secondary"
            >
              <Link2 className="w-3.5 h-3.5" />
              Vincular
            </button>
            <button
              onClick={() => setMode('create')}
              className="btn-primary"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Nova secretaria
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      {mode === 'list' && (
        <div className="grid grid-cols-2 gap-4 animate-stagger-2">
          <div className="card p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Total vinculadas</p>
            <p className="text-2xl font-bold text-slate-900">{team.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Ativas agora</p>
            <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
          </div>
        </div>
      )}

      {/* Create form */}
      {mode === 'create' && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-slate-900 font-bold flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Criar nova secretaria
            </h3>
            <button onClick={() => setMode('list')} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form
            onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))}
            className="space-y-4"
          >
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Regras da Conta:</p>
              <p>A secretaria poderá acessar a agenda, pacientes e prontuários. Ela <strong className="text-blue-950 font-bold">não terá acesso</strong> ao financeiro e nem aos laudos.</p>
              <p>Horários que você bloquear aparecerão como <strong className="text-blue-950 font-bold">"Bloqueado"</strong> para ela.</p>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar e vincular'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Link form */}
      {mode === 'link' && (
        <div className="card animate-scale-in">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-slate-900 font-bold flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              Vincular secretaria existente
            </h3>
            <button onClick={() => setMode('list')} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form
            onSubmit={linkForm.handleSubmit(d => linkMutation.mutate(d))}
            className="space-y-4"
          >
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
              <button
                type="button"
                onClick={() => setMode('list')}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={linkMutation.isPending}
                className="btn-primary"
              >
                {linkMutation.isPending ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Team list */}
      {mode === 'list' && (
        <div className="space-y-3 animate-stagger-3">
          {isLoading ? (
            <div className="text-center text-slate-500 py-8">Carregando equipe...</div>
          ) : team.length === 0 ? (
            <div className="card border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nenhuma secretaria vinculada</p>
              <p className="text-slate-400 text-sm mt-1">
                Crie um acesso ou vincule uma secretaria já cadastrada
              </p>
              <div className="flex gap-3 justify-center mt-4">
                <button
                  onClick={() => setMode('link')}
                  className="btn-secondary"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Vincular existente
                </button>
                <button
                  onClick={() => setMode('create')}
                  className="btn-primary"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Criar nova
                </button>
              </div>
            </div>
          ) : (
            team.map(link => (
              <div
                key={link.id}
                className={`card p-4 flex items-center gap-4 transition-all hover:border-slate-300 hover:shadow-md ${
                  link.active ? 'border-slate-200' : 'opacity-60 bg-slate-50'
                }`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${link.active ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {link.secretary.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-slate-900 font-semibold truncate">{link.secretary.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${link.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
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

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate(link.id)}
                    disabled={toggleMutation.isPending}
                    title={link.active ? 'Desativar acesso' : 'Ativar acesso'}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
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
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
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
          <p className="text-xs text-blue-900 font-bold uppercase tracking-wider mb-2">
            Regras de acesso da secretaria
          </p>
          <ul className="space-y-1 text-sm text-blue-700">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              Visualiza a agenda apenas do médico vinculado
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              Pode agendar, confirmar e cancelar consultas
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              Não acessa o painel financeiro
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              Não acessa laudos e avaliações
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              Horários bloqueados pelo médico aparecem como "Bloqueado"
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
