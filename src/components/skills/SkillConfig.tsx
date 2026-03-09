import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import type { SkillInfo } from '../../stores/skillStore'

interface SkillConfigProps {
  skill: SkillInfo | null
  onClose: () => void
}

export function SkillConfig({ skill, onClose }: SkillConfigProps) {
  if (!skill) return null

  const successRate = skill.metrics.totalCalls > 0
    ? ((skill.metrics.successCount / skill.metrics.totalCalls) * 100).toFixed(1)
    : '—'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn(
        'relative w-[440px] bg-[var(--bg-primary)]',
        'border border-[var(--border-primary)] rounded-2xl',
        'shadow-2xl overflow-hidden'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{skill.name}</h3>
            <p className="text-[12px] text-[var(--text-tertiary)]">v{skill.version} • {skill.category}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Description */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Mô tả
            </label>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">{skill.description}</p>
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Trạng thái
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                'w-2 h-2 rounded-full',
                skill.status === 'active' ? 'bg-green-500' : skill.status === 'error' ? 'bg-[var(--status-error-text)]' : 'bg-[var(--text-tertiary)]'
              )} />
              <span className="text-[13px] text-[var(--text-primary)] capitalize">{skill.status}</span>
            </div>
          </div>

          {/* Metrics */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Hiệu suất
            </label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5">
                <span className="text-[11px] text-[var(--text-tertiary)]">Tổng gọi</span>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{skill.metrics.totalCalls}</p>
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5">
                <span className="text-[11px] text-[var(--text-tertiary)]">Tỷ lệ thành công</span>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{successRate}%</p>
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5">
                <span className="text-[11px] text-[var(--text-tertiary)]">Trung bình latency</span>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{skill.metrics.avgLatencyMs.toFixed(0)}ms</p>
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5">
                <span className="text-[11px] text-[var(--text-tertiary)]">Lần dùng cuối</span>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {skill.metrics.lastUsed ? new Date(skill.metrics.lastUsed).toLocaleDateString('vi-VN') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Dependencies */}
          {skill.dependencies.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Phụ thuộc
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {skill.dependencies.map((dep) => (
                  <span key={dep} className="text-[11px] bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-0.5 rounded">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {skill.lastError && (
            <div className="bg-[var(--danger-bg)] border border-[var(--status-error-text)] rounded-lg p-3">
              <label className="text-[11px] font-semibold text-[var(--status-error-text)] uppercase tracking-wider">
                Lỗi gần nhất
              </label>
              <p className="text-[12px] text-[var(--status-error-text)] mt-1">{skill.lastError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
