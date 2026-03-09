import { type ReactNode, useRef, useState, useEffect } from 'react'
import { cn } from '../../lib/utils'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  delay?: number
}

const positionStyles = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2'
}

const originStyles = {
  top: 'origin-bottom',
  right: 'origin-left',
  bottom: 'origin-top',
  left: 'origin-right'
}

export function Tooltip({ content, children, side = 'right', delay = 200 }: TooltipProps) {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShow(true), delay)
  }

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setShow(false)
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      <div
        className={cn(
          'absolute z-50 px-2.5 py-1.5 rounded-lg',
          'bg-[var(--tooltip-bg)] text-[var(--tooltip-text)]',
          'text-[12px] font-medium whitespace-nowrap',
          'pointer-events-none',
          'transition-[opacity,transform] duration-100 ease-out',
          positionStyles[side],
          originStyles[side],
          show
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95'
        )}
      >
        {content}
      </div>
    </div>
  )
}
