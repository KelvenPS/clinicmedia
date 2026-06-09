import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * Wraps page content and applies an entrance animation on route change.
 * Uses CSS `animate-page-enter` (defined in tailwind.config.ts keyframes).
 */
export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Re-trigger animation by removing and re-adding class
    el.classList.remove('animate-page-enter')
    // Force reflow
    void el.offsetWidth
    el.classList.add('animate-page-enter')
  }, [location.pathname])

  return (
    <div ref={containerRef} className="animate-page-enter">
      {children}
    </div>
  )
}
