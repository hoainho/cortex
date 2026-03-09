import { Brain, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Tooltip } from '../ui/Tooltip'
import type { Project } from '../../types'

interface ProjectCardProps {
  project: Project
  active: boolean
  collapsed: boolean
  onClick: () => void
  onDelete?: (id: string) => void
}

export function ProjectCard({ project, active, collapsed, onClick, onDelete }: ProjectCardProps) {
  const statusColor = {
    ready: 'bg-[var(--status-success-text)]',
    indexing: 'bg-[var(--status-warning-text)]',
    error: 'bg-[var(--status-error-text)]',
    idle: 'bg-[var(--status-neutral-text)]'
  }

  if (collapsed) {
    return (
      <Tooltip content={project.name} side="right">
        <button
          onClick={onClick}
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center mx-auto',
            'text-[13px] font-semibold',
            'transition-all duration-100',
            active
              ? 'bg-[var(--accent-light)] text-[var(--accent-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sidebar-hover)]'
          )}
        >
          {project.brainName.charAt(0)}
        </button>
      </Tooltip>
    )
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-xl',
        'transition-all duration-100',
        'group relative',
        active
          ? 'bg-[var(--bg-sidebar-active)]'
          : 'hover:bg-[var(--bg-sidebar-hover)]'
      )}
    >
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-primary)]" />
      )}

      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            active ? 'bg-[var(--accent-light)]' : 'bg-[var(--bg-secondary)]'
          )}
        >
          {project.brainStatus === 'indexing' ? (
            <RefreshCw
              size={14}
              className="text-[var(--status-warning-text)] animate-spin"
            />
          ) : (
            <Brain
              size={14}
              className={cn(
                active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)]'
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'text-[13px] font-medium truncate leading-tight',
              active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            )}
          >
            {project.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor[project.brainStatus])}
            />
            <span className="text-[11px] text-[var(--text-tertiary)] truncate">
              {project.brainName}
            </span>
          </div>
        </div>
      </div>

      {/* Delete button — visible on hover */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(project.id)
          }}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg',
            'text-[var(--text-tertiary)] hover:text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)]',
            'opacity-0 group-hover:opacity-100 transition-all duration-100'
          )}
          title="Xóa dự án"
        >
          <Trash2 size={13} />
        </button>
      )}
    </button>
  )
}
