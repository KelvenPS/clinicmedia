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
  Table2,
  Eye,
  Code2,
  Briefcase,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Info,
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

interface SchemaFunction {
  name: string
  type: string
}

interface SchemaData {
  tables: string[]
  views: string[]
  functions: SchemaFunction[]
}

interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
}

// ─── Schema Sidebar ───────────────────────────────────────────────────────────

interface SchemaSidebarProps {
  onInsertQuery: (sql: string) => void
}

function SchemaSidebar({ onInsertQuery }: SchemaSidebarProps) {
  const qc = useQueryClient()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tables']))
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({})
  const [schemaSearch, setSchemaSearch] = useState('')

  const {
    data: schema,
    isLoading: schemaLoading,
    isFetching: schemaFetching,
  } = useQuery<SchemaData>({
    queryKey: ['admin-sql-schema'],
    queryFn: () => api.get('/admin/sql/schema').then(r => r.data),
    staleTime: 60000,
  })

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const handleTableExpand = async (tableName: string) => {
    if (expandedTables.has(tableName)) {
      setExpandedTables(prev => {
        const s = new Set(prev)
        s.delete(tableName)
        return s
      })
      return
    }
    if (!tableColumns[tableName]) {
      try {
        const res = await api.get(`/admin/sql/schema/${encodeURIComponent(tableName)}/columns`)
        setTableColumns(prev => ({ ...prev, [tableName]: res.data }))
      } catch {
        // ignore column fetch errors
      }
    }
    setExpandedTables(prev => new Set(prev).add(tableName))
  }

  const handleTableClick = (tableName: string) => {
    onInsertQuery(`SELECT * FROM "${tableName}" LIMIT 50;`)
  }

  const handleViewClick = (viewName: string) => {
    onInsertQuery(`SELECT * FROM "${viewName}" LIMIT 50;`)
  }

  const handleFunctionClick = (fn: SchemaFunction) => {
    onInsertQuery(
      `-- Function: ${fn.name}\nSELECT routine_definition FROM information_schema.routines WHERE routine_name = '${fn.name}';`
    )
  }

  const searchLower = schemaSearch.toLowerCase()
  const filteredTables = (schema?.tables ?? []).filter(t => t.toLowerCase().includes(searchLower))
  const filteredViews = (schema?.views ?? []).filter(v => v.toLowerCase().includes(searchLower))
  const filteredFunctions = (schema?.functions ?? []).filter(f =>
    f.name.toLowerCase().includes(searchLower)
  )

  // Skeleton rows for loading state
  const SkeletonRows = ({ count }: { count: number }) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
          <div className="w-3 h-3 rounded bg-slate-700 animate-pulse flex-shrink-0" />
          <div
            className="h-3 rounded bg-slate-700 animate-pulse"
            style={{ width: `${50 + (i * 23) % 40}%` }}
          />
        </div>
      ))}
    </>
  )

  const SectionHeader = ({
    id,
    label,
    count,
    icon: Icon,
  }: {
    id: string
    label: string
    count: number
    icon: React.ElementType
  }) => {
    const open = expandedSections.has(id)
    return (
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700/80 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex-1">
          {label}
        </span>
        <span className="text-xs text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded font-mono">
          {count}
        </span>
      </button>
    )
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-white/10 bg-slate-900/50 overflow-hidden">
      {/* Fixed header */}
      <div className="flex-shrink-0 border-b border-white/10 px-3 py-2.5 flex items-center gap-2 bg-slate-900">
        <Database className="w-4 h-4 text-violet-400 flex-shrink-0" />
        <span className="text-sm font-bold text-white flex-1">Schema</span>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['admin-sql-schema'] })}
          disabled={schemaFetching}
          title="Recarregar schema"
          className="p-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-slate-400 ${schemaFetching ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Search input */}
      <div className="flex-shrink-0 border-b border-white/10 px-2 py-2 bg-slate-900">
        <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2 py-1.5">
          <Search className="w-3 h-3 text-slate-500 flex-shrink-0" />
          <input
            type="text"
            value={schemaSearch}
            onChange={e => setSchemaSearch(e.target.value)}
            placeholder="Filtrar..."
            className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 outline-none min-w-0"
          />
          {schemaSearch && (
            <button
              onClick={() => setSchemaSearch('')}
              className="text-slate-500 hover:text-slate-300 text-xs leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">

        {/* ── Tables ── */}
        <SectionHeader
          id="tables"
          label="Tabelas"
          count={filteredTables.length}
          icon={Table2}
        />
        {expandedSections.has('tables') && (
          <div className="pb-1">
            {schemaLoading ? (
              <SkeletonRows count={6} />
            ) : filteredTables.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-600 italic">Nenhuma tabela</p>
            ) : (
              filteredTables.map(tableName => (
                <div key={tableName}>
                  {/* Table row */}
                  <div className="flex items-center group hover:bg-slate-700/50 transition-colors">
                    {/* Expand chevron */}
                    <button
                      onClick={() => handleTableExpand(tableName)}
                      className="flex-shrink-0 pl-2 pr-1 py-1.5 text-slate-600 hover:text-slate-300"
                      title="Expandir colunas"
                    >
                      {expandedTables.has(tableName) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    {/* Table name — click to insert SELECT */}
                    <button
                      onClick={() => handleTableClick(tableName)}
                      className="flex-1 min-w-0 flex items-center gap-1.5 pr-2 py-1.5 text-left"
                      title={`SELECT * FROM "${tableName}" LIMIT 50;`}
                    >
                      <Table2 className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span className="text-xs font-mono text-slate-300 group-hover:text-white truncate transition-colors">
                        {tableName}
                      </span>
                    </button>
                  </div>
                  {/* Column sub-items */}
                  {expandedTables.has(tableName) && (
                    <div className="ml-3 border-l border-slate-700/50 pl-2 pb-1">
                      {tableColumns[tableName] ? (
                        tableColumns[tableName].map(col => (
                          <div
                            key={col.column_name}
                            className="flex items-center gap-1.5 py-0.5 px-1"
                          >
                            <span className="text-xs font-mono text-slate-500 truncate flex-1">
                              {col.column_name}
                            </span>
                            <span
                              className="text-xs bg-slate-800 text-slate-600 px-1 py-0.5 rounded font-mono flex-shrink-0 max-w-[70px] truncate"
                              title={col.data_type}
                            >
                              {col.data_type}
                            </span>
                          </div>
                        ))
                      ) : (
                        <SkeletonRows count={3} />
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Views ── */}
        <SectionHeader
          id="views"
          label="Views"
          count={filteredViews.length}
          icon={Eye}
        />
        {expandedSections.has('views') && (
          <div className="pb-1">
            {schemaLoading ? (
              <SkeletonRows count={3} />
            ) : filteredViews.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-600 italic">Nenhuma view</p>
            ) : (
              filteredViews.map(viewName => (
                <button
                  key={viewName}
                  onClick={() => handleViewClick(viewName)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-700/50 transition-colors text-left group"
                  title={`SELECT * FROM "${viewName}" LIMIT 50;`}
                >
                  <Eye className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-mono text-slate-400 group-hover:text-white truncate transition-colors">
                    {viewName}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Procedures / Functions ── */}
        <SectionHeader
          id="procedures"
          label="Procedures"
          count={filteredFunctions.length}
          icon={Code2}
        />
        {expandedSections.has('procedures') && (
          <div className="pb-1">
            {schemaLoading ? (
              <SkeletonRows count={2} />
            ) : filteredFunctions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-600 italic">Nenhuma function</p>
            ) : (
              filteredFunctions.map(fn => (
                <button
                  key={fn.name}
                  onClick={() => handleFunctionClick(fn)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-700/50 transition-colors text-left group"
                  title={fn.name}
                >
                  <Code2 className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-mono text-slate-400 group-hover:text-white truncate transition-colors flex-1">
                    {fn.name}
                  </span>
                  <span className="text-xs text-slate-600 flex-shrink-0 uppercase">
                    {fn.type === 'PROCEDURE' ? 'proc' : 'fn'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Jobs ── */}
        <SectionHeader id="jobs" label="Jobs" count={0} icon={Briefcase} />
        {expandedSections.has('jobs') && (
          <div className="px-3 py-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-snug">
              Nenhum job configurado. Use pg_cron para agendar tarefas.
            </p>
          </div>
        )}

      </div>
    </div>
  )
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
    <div className="flex h-[calc(100vh-64px)]">

      {/* ── Left Sidebar: Schema Explorer ── */}
      <SchemaSidebar onInsertQuery={setQuery} />

      {/* ── Right Panel: Editor + Results + History ── */}
      <div className="flex-1 overflow-auto p-6 space-y-6 animate-fade-in">

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

          {/* PostgreSQL tip */}
          <div className="border-b border-white/10 px-4 py-2.5 bg-slate-800/60 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Tabelas <span className="font-mono text-violet-300">TBL*</span> são auto-cotadas pelo servidor — escreva com ou sem aspas:{' '}
              <span className="font-mono text-emerald-400">SELECT * FROM TBLSALA</span>
              {' '}ou{' '}
              <span className="font-mono text-emerald-400">SELECT * FROM "TBLSALA"</span>
              {' '}· Clique na tabela na sidebar para gerar a query.
            </p>
          </div>

          {/* Textarea */}
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder={'SELECT * FROM "TBLUSUARIO" LIMIT 10;'}
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
    </div>
  )
}
