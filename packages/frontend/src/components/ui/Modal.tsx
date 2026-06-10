import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const [phase, setPhase] = useState<'hidden' | 'entering' | 'visible' | 'leaving'>('hidden')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPhase('entering')
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('visible'))
      })
      document.body.style.overflow = 'hidden'
      return () => cancelAnimationFrame(t)
    } else {
      setPhase('leaving')
      const t = setTimeout(() => {
        setPhase('hidden')
        document.body.style.overflow = ''
      }, 260)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (phase === 'hidden') return null

  const visible = phase === 'visible'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{
        transition: 'opacity 0.24s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          relative w-full ${sizes[size]} bg-white
          rounded-t-3xl sm:rounded-2xl
          shadow-2xl shadow-slate-900/25
          max-h-[95vh] sm:max-h-[90vh]
          flex flex-col overflow-hidden
        `}
        style={{
          transition: 'opacity 0.24s ease, transform 0.3s cubic-bezier(.22,1,.36,1)',
          opacity: visible ? 1 : 0,
          transform: visible
            ? 'scale(1) translateY(0)'
            : 'scale(0.96) translateY(12px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Pull indicator mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-slate-900 leading-snug">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-icon flex-shrink-0 -mt-0.5 -mr-1"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 scrollbar-none">
          {children}
        </div>

        {/* Footer opcional */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
