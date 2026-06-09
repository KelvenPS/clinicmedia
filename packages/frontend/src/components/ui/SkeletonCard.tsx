interface SkeletonCardProps {
  rows?: number
  showAvatar?: boolean
  className?: string
}

/**
 * Animated skeleton card for loading states.
 * Usage: <SkeletonCard rows={3} showAvatar />
 */
export function SkeletonCard({ rows = 3, showAvatar = false, className = '' }: SkeletonCardProps) {
  return (
    <div className={`card animate-fade-in ${className}`}>
      <div className="flex items-start gap-3">
        {showAvatar && (
          <div className="skeleton-circle w-10 h-10 flex-shrink-0" />
        )}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="skeleton-text w-2/3" />
          {Array.from({ length: rows - 1 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-text"
              style={{ width: `${85 - i * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  cols?: number
}

/**
 * Animated skeleton for table rows.
 */
export function SkeletonTable({ rows = 5, cols = 5 }: SkeletonTableProps) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-6 py-4 border-b border-slate-100"
          style={{ animationDelay: `${i * 0.04}s` }}
        >
          <div className="skeleton-circle w-8 h-8 flex-shrink-0" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <div key={j} className="skeleton-text flex-1" style={{ maxWidth: `${120 - j * 10}px` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

interface SkeletonStatsProps {
  count?: number
}

/**
 * Skeleton for stats/metric cards in a grid.
 */
export function SkeletonStats({ count = 4 }: SkeletonStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`card animate-stagger-${Math.min(i + 1, 4) as 1 | 2 | 3 | 4}`}>
          <div className="flex items-start gap-4">
            <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="skeleton-text w-3/4" />
              <div className="skeleton w-16 h-7 rounded-lg" />
              <div className="skeleton-text w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
