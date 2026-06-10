interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  )
}
