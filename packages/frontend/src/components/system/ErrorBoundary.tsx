import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, Home } from 'lucide-react'
import { handlePossibleChunkError } from '../../lib/chunkErrorRecovery'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Erro capturado:', error.message, info.componentStack)
    // Se for um erro de asset desatualizado após deploy, tenta recarregar uma vez antes de mostrar o fallback.
    handlePossibleChunkError(error.message)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">
            A Clinic Pro recebeu uma atualização e precisa recarregar alguns recursos
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Clique em atualizar para continuar. Caso o problema persista, entre em contato com o suporte.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar página
            </button>
            <button
              onClick={() => { window.location.href = '/' }}
              className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Home className="w-4 h-4" />
              Voltar para o início
            </button>
          </div>
        </div>
      </div>
    )
  }
}
