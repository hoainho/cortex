import { useState, useEffect } from 'react'
import {
  X, Puzzle, RefreshCw, Loader2,
  Zap, Activity, ChevronDown, ChevronRight,
  Search
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { SkillConfig } from './SkillConfig'
import { useSkillStore, type SkillInfo, type SkillCategory } from '../../stores/skillStore'

interface SkillManagerProps {
  open: boolean
  onClose: () => void
}

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  rag: 'RAG',
  memory: 'Bộ nhớ',
  agent: 'Agent',
  code: 'Phân tích code',
  learning: 'Học máy',
  efficiency: 'Hiệu suất',
  reasoning: 'Suy luận',
  tool: 'Công cụ'
}

const CATEGORY_ICONS: Record<SkillCategory, typeof Puzzle> = {
  rag: Search,
  memory: Activity,
  agent: Zap,
  code: Puzzle,
  learning: Activity,
  efficiency: Zap,
  reasoning: Activity,
  tool: Puzzle
}

export function SkillManager({ open, onClose }: SkillManagerProps) {
  const { skills, healthReport, loading, loadSkills, activateSkill, deactivateSkill, loadHealth } = useSkillStore()
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [filterCategory, setFilterCategory] = useState<SkillCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['rag', 'reasoning', 'agent']))

  useEffect(() => {
    if (!open) return
    loadSkills()
    loadHealth()
  }, [open, loadSkills, loadHealth])

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const filteredSkills = skills.filter((s) => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Group by category
  const grouped = new Map<SkillCategory, SkillInfo[]>()
  for (const skill of filteredSkills) {
    const list = grouped.get(skill.category) || []
    list.push(skill)
    grouped.set(skill.category, list)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div className={cn(
          'relative ml-auto w-[560px] h-full bg-[var(--bg-primary)]',
          'border-l border-[var(--border-primary)]',
          'flex flex-col overflow-hidden',
          'animate-in slide-in-from-right duration-300'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-2.5">
              <Puzzle size={20} className="text-[var(--accent-primary)]" />
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Kỹ năng</h2>
              <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                {skills.filter(s => s.status === 'active').length}/{skills.length} hoạt động
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => { loadSkills(); loadHealth() }} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Search + filter */}
          <div className="px-5 py-3 border-b border-[var(--border-primary)]">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kỹ năng..."
                className="flex-1"
              />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as SkillCategory | 'all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px]',
                  'bg-[var(--bg-secondary)] text-[var(--text-primary)]',
                  'border border-[var(--border-primary)]'
                )}
              >
                <option value="all">Tất cả</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Skill list */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
              </div>
            )}

            {!loading && filteredSkills.length === 0 && (
              <div className="text-center py-8">
                <Puzzle size={28} className="text-[var(--text-tertiary)] mx-auto mb-2 opacity-40" />
                <p className="text-[13px] text-[var(--text-tertiary)]">Không tìm thấy kỹ năng</p>
              </div>
            )}

            {!loading && Array.from(grouped.entries()).map(([category, categorySkills]) => {
              const Icon = CATEGORY_ICONS[category] || Puzzle
              const isExpanded = expandedCategories.has(category)

              return (
                <div key={category} className="mb-4">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex items-center gap-2 w-full text-left py-1.5"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Icon size={14} className="text-[var(--accent-primary)]" />
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">({categorySkills.length})</span>
                  </button>

                  {isExpanded && (
                    <div className="ml-6 space-y-1.5 mt-1">
                      {categorySkills.map((skill) => (
                        <div
                          key={skill.name}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                            'border border-[var(--border-primary)]',
                            'hover:bg-[var(--bg-secondary)] transition-all duration-100',
                            'cursor-pointer'
                          )}
                          onClick={() => setSelectedSkill(skill)}
                        >
                          <span className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            skill.status === 'active' ? 'bg-green-500'
                              : skill.status === 'error' ? 'bg-[var(--status-error-text)]'
                              : 'bg-[var(--text-tertiary)]'
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                                {skill.name}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)]">v{skill.version}</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-tertiary)] truncate">{skill.description}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (skill.status === 'active') deactivateSkill(skill.name)
                              else activateSkill(skill.name)
                            }}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0',
                              'transition-all duration-100',
                              skill.status === 'active'
                                ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            {skill.status === 'active' ? 'Hoạt động' : 'Bật'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Skill detail modal */}
      <SkillConfig skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </>
  )
}
