import React from 'react'

interface ClinicLogoProps {
  className?: string
  iconOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function ClinicIcon({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const boxSizes = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-11 h-11 rounded-2xl',
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <div
      className={`${boxSizes[size]} bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-cyan-600/30 flex-shrink-0 transition-transform duration-200 hover:scale-105 ${className}`}
    >
      <svg
        className={`${iconSizes[size]} text-white`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cruz Médica Moderna com Cantos Arredondados */}
        <path
          d="M9.5 2H14.5C15.3284 2 16 2.67157 16 3.5V8H20.5C21.3284 8 22 8.67157 22 9.5V14.5C22 15.3284 21.3284 16 20.5 16H16V20.5C16 21.3284 15.3284 22 14.5 22H9.5C8.67157 22 8 21.3284 8 20.5V16H3.5C2.67157 16 2 15.3284 2 14.5V9.5C2 8.67157 2.67157 8 3.5 8H8V3.5C8 2.67157 8.67157 2 9.5 2Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
        {/* Cruz central sólida */}
        <path
          d="M10.5 4H13.5V9.5H19V12.5H13.5V18H10.5V12.5H5V9.5H10.5V4Z"
          fill="currentColor"
        />
        {/* Linha de Pulso / Batimento Cardíaco cruzando o centro */}
        <path
          d="M3 11H6.5L8.5 7L11.5 15L14.5 9.5L16 11H21"
          stroke="#38bdf8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export default function ClinicLogo({ className = '', iconOnly = false, size = 'md' }: ClinicLogoProps) {
  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ClinicIcon size={size} />

      {!iconOnly && (
        <div className="overflow-hidden whitespace-nowrap select-none">
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`font-bold text-white tracking-tight ${titleSizes[size]}`}>ClinIQ</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-extrabold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase tracking-wider">
              PRO
            </span>
          </div>
          <p className="text-[10.5px] font-medium text-slate-400 tracking-wide mt-1">Gestão Clínica</p>
        </div>
      )}
    </div>
  )
}
