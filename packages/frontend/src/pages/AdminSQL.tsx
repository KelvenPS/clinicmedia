import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { Navigate } from 'react-router-dom'
import {
  Database,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  History,
  AlertTriangle,
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SQLResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
  durationMs: number
}

interface SQLError {
  message: string
  durationMs?: number
}

interface HistoryEntry {
  id: string
  query: string
  rowCount: number | null
  durationMs: number | null
  success: boolean
  error: string | null
  createdAt: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSQL() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  // Guard: only ADMIN
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  const [query, setQuery] = useState('')
  const [allowWrites, setAllowWrites] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [result, setResult] = useState<SQLResult | null>(null)
  const [execError, setExecError] = useState<SQLError | null>(null)

  // ── History query ──
  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ['admin-sql-history'],
    queryFn: () => api.get('/admin/sql/history').then(r => r.data),
  })

  // ── Execute mutation ──
  const executeMutation = useMutation<SQLResult, AxiosError<SQLError>, { query: string; allowWrites?: boolean }>({
    mutationFn: payload => api.post<SQLResult>('/admin/sql/execute', payload).then(r => r.data),
    onSuccess: data => {
      setResult(data)
      setExecError(null)
      qc.invalidateQueries({ queryKey: ['admin-sql-history'] })
    },
    onError: (err) => {
      setResult(null)
      const errData = err.response?.data
      setExecError(errData ?? { message: 'Erro desconhecido ao executar query.' })
      qc.invalidateQueries({ queryKey: ['admin-sql-history'] })
    },
  })

  const handleExecute = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    executeMutation.mutate({ query: trimmed, allowWrites })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter to execute
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
    }
    // Tab inserts spaces instead of switching focus
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const newVal = query.substring(0, start) + '  ' + query.substring(end)
      setQuery(newVal)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center">
          <Database className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">SQL Admin</h1>
          <p className="text-sm text-slate-400">Execute queries diretamente no banco de dados</p>
        </div>
      </div>

      {/* ── Write-mode warning ── */}
      {allowWrites && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">
            Modo escrita ativo — operações destrutivas serão executadas diretamente no banco
          </p>
        </div>
      )}

      {/* ── Editor card ── */}
      <div className="rounded-xl border border-white/10 overflow-hidden shadow-xl">
        {/* Editor header bar */}
        <div className="bg-slate-800 border-b border-white/10 px-4 py-2 flex items-center gap-3">
          <Database className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SQL Editor</span>
          <span className="ml-auto text-xs text-slate-600">Ctrl+Enter para executar</span>
        </div>

        {/* Textarea */}
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder="SELECT * FROM &quot;User&quot; LIMIT 10;"
          className="w-full bg-slate-900 text-slate-100 font-mono text-sm px-4 py-4 outline-none resize-vertical placeholder:text-slate-600 leading-relaxed"
          style={{ minHeight: 160 }}
        />

        {/* Editor footer / actions */}
        <div className="bg-slate-800 border-t border-white/10 px-4 py-3 flex flex-wrap items-center gap-4">
          {/* Allow writes checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowWrites}
              onChange={e => setAllowWrites(e.target.checked)}
              className="w-4 h-4 accent-red-500 cursor-pointer"
            />
            <span className={`text-sm font-medium ${allowWrites ? 'text-red-400' : 'text-slate-400'}`}>
              Permitir escrita
            </span>
          </label>

          <button
            onClick={handleExecute}
            disabled={executeMutation.isPending || !query.trim()}
            className="ml-auto flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {executeMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Executar
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Error box ── */}
      {execError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-4">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300 mb-1">Erro na query</p>
            <pre className="text-xs text-red-400 whitespace-pre-wrap break-all font-mono">{execError.message}</pre>
            {execError.durationMs != null && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {execError.durationMs} ms
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          {/* Results header */}
          <div className="bg-slate-800 border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">Query executada com sucesso</span>
            </div>
            <div className="flex items-center gap-4 ml-auto text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                {result.rowCount} {result.rowCount === 1 ? 'linha' : 'linhas'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {result.durationMs} ms
              </span>
            </div>
          </div>

          {/* Table */}
          {result.columns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-white/10">
                    {result.columns.map(col => (
                      <th
                        key={col}
                        className="px-4 py-2.5 text-left text-slate-300 font-semibold uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-slate-900">
                  {result.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={result.columns.length}
                        className="px-4 py-6 text-center text-slate-500 italic"
                      >
                        Nenhum resultado retornado
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={rowIdx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/40'}
                      >
                        {result.columns.map(col => {
                          const val = row[col]
                          const display =
                            val === null || val === undefined
                              ? 'NULL'
                              : typeof val === 'object'
                              ? JSON.stringify(val)
                              : String(val)
                          return (
                            <td
                              key={col}
                              className={`px-4 py-2 font-mono whitespace-nowrap max-w-xs truncate ${
                                val === null || val === undefined
                                  ? 'text-slate-600 italic'
                                  : 'text-slate-200'
                              }`}
                              title={display}
                            >
                              {display}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-4 text-sm text-slate-400 font-mono bg-slate-900">
              {result.rowCount} {result.rowCount === 1 ? 'linha afetada' : 'linhas afetadas'}
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* History header (collapsible) */}
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full bg-slate-800 hover:bg-slate-700/80 transition-colors px-4 py-3 flex items-center gap-3 text-left"
        >
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">Histórico de queries</span>
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {history.length} entr{history.length === 1 ? 'ada' : 'adas'}
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {historyOpen && (
          <div className="bg-slate-900 divide-y divide-white/5">
            {historyLoading ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">Carregando histórico...</div>
            ) : history.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">Nenhuma query executada ainda.</div>
            ) : (
              history.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => setQuery(entry.query)}
                  className="w-full px-4 py-3 flex flex-wrap items-start gap-3 text-left hover:bg-slate-800/60 transition-colors group"
                >
                  {/* Success/fail icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {entry.success ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>

                  {/* Query preview */}
                  <span className="flex-1 min-w-0 font-mono text-xs text-slate-300 group-hover:text-white transition-colors truncate">
                    {entry.query.length > 80 ? entry.query.slice(0, 80) + '…' : entry.query}
                  </span>

                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0 ml-auto">
                    {entry.success ? (
                      <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-xs font-medium">
                        OK
                      </span>
                    ) : (
                      <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded text-xs font-medium">
                        ERRO
                      </span>
                    )}
                    {entry.rowCount != null && (
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {entry.rowCount}
                      </span>
                    )}
                    {entry.durationMs != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {entry.durationMs} ms
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

    </div>
  )
}
