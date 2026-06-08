import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Search, UserCheck, UserX, Edit2, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { User } from '../types'
import Modal from '../components/ui/Modal'
import UserForm from '../components/Users/UserForm'

const roleConfig: Record<string, { label: string; className: string }> = {
  ADMIN: { label: 'Admin', className: 'bg-purple-100 text-purple-700' },
  DOCTOR: { label: 'Médico', className: 'bg-blue-100 text-blue-700' },
  SECRETARY: { label: 'Secretária', className: 'bg-emerald-100 text-emerald-700' },
}

export default function Usuarios() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editUser ? api.put(`/users/${editUser.id}`, data) : api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(editUser ? 'Usuário atualizado!' : 'Usuário criado!')
      setModalOpen(false)
      setEditUser(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao salvar usuário')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/toggle`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      const u = users.find(u => u.id === id)
      toast.success(`Usuário ${u?.active ? 'desativado' : 'ativado'}`)
    },
  })

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: users.length,
    doctors: users.filter(u => u.role === 'DOCTOR').length,
    secretaries: users.filter(u => u.role === 'SECRETARY').length,
    inactive: users.filter(u => !u.active).length,
  }

  const handleEdit = (u: User) => { setEditUser(u); setModalOpen(true) }
  const handleNew = () => { setEditUser(null); setModalOpen(true) }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="page-subtitle">Gerencie usuários e permissões de acesso</p>
        </div>
        <button onClick={handleNew} className="btn-primary self-start">
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900', bg: 'bg-slate-100' },
          { label: 'Médicos', value: stats.doctors, color: 'text-blue-700', bg: 'bg-blue-100' },
          { label: 'Secretárias', value: stats.secretaries, color: 'text-emerald-700', bg: 'bg-emerald-100' },
          { label: 'Inativos', value: stats.inactive, color: 'text-red-700', bg: 'bg-red-100' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="card text-center py-4">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuários..."
              className="input-field pl-9 py-2"
            />
          </div>
          <Shield className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500">{filtered.length} usuários</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Perfil</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Especialidade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cadastro</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">Nenhum usuário encontrado</td>
                </tr>
              ) : (
                filtered.map(u => {
                  const initials = u.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                  const role = roleConfig[u.role]
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.active ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${u.active ? 'bg-blue-600' : 'bg-slate-300'}`}>
                            <span className="text-white text-sm font-bold">{initials}</span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`status-badge ${role.className}`}>{role.label}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {u.specialty || '–'}
                        {u.crm && <span className="text-xs text-slate-400 block">{u.crm}</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{u.phone || '–'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {u.createdAt ? format(new Date(u.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '–'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`status-badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {u.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleMutation.mutate(u.id)}
                            className={`p-1.5 rounded-lg transition-colors ${u.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                            title={u.active ? 'Desativar' : 'Ativar'}
                          >
                            {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditUser(null) }}
        title={editUser ? 'Editar Usuário' : 'Novo Usuário'}
      >
        <UserForm
          user={editUser}
          onSubmit={(data) => saveMutation.mutate(data as Record<string, unknown>)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
