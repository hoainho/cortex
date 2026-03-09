import { cn } from '../../lib/utils'
import type { ResponseMode } from '../../types'

interface ToggleProps {
  mode: ResponseMode
  onChange: (mode: ResponseMode) => void
  collapsed?: boolean
}

export function Toggle({ mode, onChange, collapsed }: ToggleProps) {
  if (collapsed) {
    return (
      <button
        onClick={() => onChange(mode === 'pm' ? 'engineering' : 'pm')}
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold',
          'transition-all duration-100',
          mode === 'pm'
            ? 'bg-[var(--accent-light)] text-[var(--accent-primary)]'
            : 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
        )}
        title={mode === 'pm' ? 'Product Manager Mode' : 'Engineering Mode'}
      >
        {mode === 'pm' ? 'PM' : 'EN'}
      </button>
    )
  }

  return (
    <div className="flex items-center bg-[var(--bg-sidebar-hover)] rounded-xl p-1 gap-0.5">
      <button
        onClick={() => onChange('pm')}
        className={cn(
          'flex-1 py-1.5 px-3 rounded-lg text-[12px] font-medium transition-all duration-200',
          'whitespace-nowrap',
          mode === 'pm'
            ? 'bg-[var(--bg-primary)] text-[var(--accent-primary)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        )}
      >
        PM Mode
      </button>
      <button
        onClick={() => onChange('engineering')}
        className={cn(
          'flex-1 py-1.5 px-3 rounded-lg text-[12px] font-medium transition-all duration-200',
          'whitespace-nowrap',
          mode === 'engineering'
            ? 'bg-[var(--bg-primary)] text-[var(--status-info-text)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        )}
      >
        Engineer
      </button>
    </div>
  )
}
