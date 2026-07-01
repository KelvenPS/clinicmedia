import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Landmark } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'

interface BankAccount {
  id: string
  name: string
  bank?: string | null
  agency?: string | null
  account?: string | null
  type: 'CHECKING' | 'SAVINGS' | 'CASH'
  balance: number
  createdAt: string
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CHECKING: 'Conta Corrente',
  SAVINGS: 'Poupança',
  CASH: 'Caixa / Dinheiro',
}

function BankAccountForm({
  account,
  onSubmit,
  loading,
}: {
  account: BankAccount | null
  onSubmit: (data: Partial<BankAccount>) => void
  loading: boolean
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [bank, setBank] = useState(account?.bank ?? '')
  const [agency, setAgency] = useState(account?.agency ?? '')
  const [accountNum, setAccountNum] = useState(account?.account ?? '')
  const [type, setType] = useState<'CHECKING' | 'SAVINGS' | 'CASH'>(account?.type ?? 'CHECKING')
  const [balance, setBalance] = useState(account?.balance?.toString() ?? '0')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Nome obrigatório'); return }
    onSubmit({
      name: name.trim(),
      bank: bank.trim() || undefined,
      agency: agency.trim() || undefined,
      account: accountNum.trim() || undefined,
      type,
      balance: parseFloat(balance) || 0,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nome da Conta *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input-field"
          placeholder="Ex: Conta Principal, Caixa Clínica"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Tipo de Conta *</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as 'CHECKING' | 'SAVINGS' | 'CASH')}
          className="input-field"
        >
          <option value="CHECKING">Conta Corrente</option>
          <option value="SAVINGS">Poupança</option>
          <option value="CASH">Caixa / Dinheiro</option>
        </select>
      </div>

      {type !== 'CASH' && (
        <>
          <div>
            <label className="label">Banco</label>
            <input
              type="text"
              value={bank}
              onChange={e => setBank(e.target.value)}
              className="input-field"
              placeholder="Ex: Bradesco, Itaú, Nubank..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Agência</label>
              <input
                type="text"
                value={agency}
                onChange={e => setAgency(e.target.value)}
                className="input-field"
                placeholder="0000"
              />
            </div>
            <div>
              <label className="label">Número da Conta</label>
              <input
                type="text"
                value={accountNum}
                onChange={e => setAccountNum(e.target.value)}
                className="input-field"
                placeholder="00000-0"
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="label">Saldo Inicial (R$)</label>
        <input
          type="number"
          step="0.01"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          className="input-field"
          placeholder="0,00"
        />
        <p className="text-xs text-slate-400 mt-1">Saldo atual ou inicial da conta</p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : account ? 'Atualizar Conta' : 'Criar Conta'}
      </button>
    </form>
  )
}

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function ContasBancarias() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<BankAccount | null>(null)

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get('/financial/bank-accounts').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Partial<BankAccount>) =>
      editItem
        ? api.put(`/financial/bank-accounts/${editItem.id}`, data)
        : api.post('/financial/bank-accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
      toast.success(editItem ? 'Conta atualizada!' : 'Conta criada!')
      setModalOpen(false)
      setEditItem(null)
    },
    onError: () => toast.error('Erro ao salvar conta'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/bank-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
      toast.success('Conta removida')
    },
    onError: () => toast.error('Erro ao remover conta'),
  })

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Contas Bancárias"
        subtitle="Gerencie suas contas bancárias e saldos"
        actions={
          <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nova Conta
          </button>
        }
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <Landmark className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">Nenhuma conta bancária cadastrada</p>
            <p className="text-slate-400 text-sm mt-1">Adicione contas para controlar seus saldos</p>
            <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="mt-4 btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" />
              Nova Conta
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="table-head-cell">Nome</th>
                  <th className="table-head-cell hidden md:table-cell">Banco</th>
                  <th className="table-head-cell hidden lg:table-cell">Agência / Conta</th>
                  <th className="table-head-cell">Tipo</th>
                  <th className="table-head-cell text-right">Saldo</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, idx) => (
                  <tr key={acc.id} className="table-row group" style={{ animationDelay: `${idx * 0.03}s` }}>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Landmark className="w-4 h-4 text-blue-600" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">{acc.name}</p>
                      </div>
                    </td>
                    <td className="table-cell text-slate-600 hidden md:table-cell">
                      {acc.bank ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-cell text-slate-500 text-xs hidden lg:table-cell">
                      {acc.agency && acc.account
                        ? `Ag. ${acc.agency} / CC ${acc.account}`
                        : acc.agency || acc.account || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-cell">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                        {ACCOUNT_TYPE_LABEL[acc.type]}
                      </span>
                    </td>
                    <td className={`table-cell text-right font-bold tabular-nums ${acc.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {currency(acc.balance)}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditItem(acc); setModalOpen(true) }}
                          className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('Remover esta conta?')) deleteMutation.mutate(acc.id) }}
                          className="btn-icon w-7 h-7 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        title={editItem ? 'Editar Conta' : 'Nova Conta Bancária'}
      >
        <BankAccountForm
          account={editItem}
          onSubmit={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
