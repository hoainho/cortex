import { FolderOpen, Github } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ImportOptionsProps {
  onSelectLocal: () => void
  onSelectGithub: () => void
  selected: 'local' | 'github' | null
}

export function ImportOptions({ onSelectLocal, onSelectGithub, selected }: ImportOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onSelectLocal}
        className={cn(
          'flex flex-col items-center gap-3 p-5 rounded-xl border-2',
          'transition-all duration-200',
          'hover:shadow-md hover:-translate-y-0.5',
          selected === 'local'
            ? 'border-[var(--accent-primary)] bg-[var(--accent-light)]'
            : 'border-[var(--border-primary)] bg-[var(--bg-input)] hover:border-[var(--border-input)]'
        )}
      >
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            selected === 'local'
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          )}
        >
          <FolderOpen size={22} />
        </div>
        <div className="text-center">
          <div className="text-[14px] font-medium text-[var(--text-primary)]">
            Từ máy tính
          </div>
          <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
            Chọn folder dự án
          </div>
        </div>
      </button>

      <button
        onClick={onSelectGithub}
        className={cn(
          'flex flex-col items-center gap-3 p-5 rounded-xl border-2',
          'transition-all duration-200',
          'hover:shadow-md hover:-translate-y-0.5',
          selected === 'github'
            ? 'border-[var(--accent-primary)] bg-[var(--accent-light)]'
            : 'border-[var(--border-primary)] bg-[var(--bg-input)] hover:border-[var(--border-input)]'
        )}
      >
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            selected === 'github'
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          )}
        >
          <Github size={22} />
        </div>
        <div className="text-center">
          <div className="text-[14px] font-medium text-[var(--text-primary)]">
            Từ GitHub
          </div>
          <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
            Nhập URL repository
          </div>
        </div>
      </button>
    </div>
  )
}
