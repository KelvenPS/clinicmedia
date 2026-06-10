import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTransitionProps {
  children: React.ReactNode
}

export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayChildren, setDisplayChildren] = useState(children)
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const prevDepth = prevPathRef.current.split('/').filter(Boolean).length
    const nextDepth = location.pathname.split('/').filter(Boolean).length

    const isDeeper = nextDepth > prevDepth
    const isSameDepth = nextDepth === prevDepth

    el.style.transition = 'none'
    el.style.opacity = '0'
    el.style.transform = isDeeper
      ? 'translateY(10px) scale(0.99)'
      : isSameDepth
      ? 'translateY(8px)'
      : 'translateY(-6px)'

    void el.offsetWidth

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.32s cubic-bezier(.22,1,.36,1), transform 0.38s cubic-bezier(.22,1,.36,1)'
        el.style.opacity = '1'
        el.style.transform = 'translateY(0) scale(1)'
      })
    })

    setDisplayChildren(children)
    prevPathRef.current = location.pathname
  }, [location.pathname, children])

  return (
    <div
      ref={containerRef}
      style={{
        opacity: 1,
        transform: 'translateY(0) scale(1)',
        willChange: 'opacity, transform',
      }}
    >
      {displayChildren}
    </div>
  )
}
