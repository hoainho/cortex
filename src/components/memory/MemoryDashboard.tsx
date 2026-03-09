import { useState, useEffect } from 'react'
import {
  X, Brain, Database, MessageSquare, Search,
  RefreshCw, Plus, Trash2, Loader2, Archive,
  Clock, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { MemoryEditor } from './MemoryEditor'
import { useMemoryStore, type CoreMemorySection } from '../../stores/memoryStore'

interface MemoryDashboardProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

const CORE_SECTIONS: CoreMemorySection[] = ['user_profile', 'project_context', 'preferences', 'coding_style', 'tool_preferences']

export function MemoryDashboard({ open, onClose, projectId }: MemoryDashboardProps) {
  const {
    coreMemory, archivalMemory, recallMemory, searchResults, stats, loading, searching,
    loadCoreMemory, updateCoreMemory, deleteCoreMemory,
    loadArchivalMemory, addArchivalMemory, deleteArchivalMemory,
    loadRecallMemory, searchMemory, loadStats, migrateMemory, clearSearch
  } = useMemoryStore()

  const [activeTab, setActiveTab] = useState<'core' | 'archival' | 'recall' | 'search'>('core')
  const [searchQuery, setSearchQuery] = useState('')
  const [newArchivalContent, setNewArchivalContent] = useState('')
  const [addingArchival, setAddingArchival] = useState(false)
  const [coreOpen, setCoreOpen] = useState(true)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    if (!open || !projectId) return
    loadCoreMemory(projectId)
    loadArchivalMemory(projectId, 50)
    loadRecallMemory(projectId, 50)
    loadStats(projectId)
  }, [open, projectId, loadCoreMemory, loadArchivalMemory, loadRecallMemory, loadStats])

  const handleSearch = () => {
    if (!projectId || !searchQuery.trim()) return
    searchMemory(projectId, searchQuery.trim(), 20)
    setActiveTab('search')
  }

  const handleAddArchival = async () => {
    if (!projectId || !newArchivalContent.trim()) return
    setAddingArchival(true)
    await addArchivalMemory(projectId, newArchivalContent.trim())
    setNewArchivalContent('')
    setAddingArchival(false)
  }

  const handleMigrate = async () => {
    if (!projectId) return
    setMigrating(true)
    await migrateMemory(projectId)
    await loadStats(projectId)
    setMigrating(false)
  }

  if (!open) return null

  const tabs = [
    { id: 'core' as const, label: 'Core', icon: Brain },
    { id: 'archival' as const, label: 'Archival', icon: Archive },
    { id: 'recall' as const, label: 'Recall', icon: Clock },
    { id: 'search' as const, label: 'Tìm kiếm', icon: Search }
  ]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        className={cn(
          'relative ml-auto w-[560px] h-full bg-[var(--bg-primary)]',
          'border-l border-[var(--border-primary)]',
          'flex flex-col overflow-hidden',
          'animate-in slide-in-from-right duration-300'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2.5">
            <Brain size={20} className="text-[var(--accent-primary)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Bộ nhớ</h2>
            {stats && (
              <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                {stats.coreEntries + stats.archivalEntries + stats.recallEntries} mục
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleMigrate} disabled={migrating}>
              {migrating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-1.5">
              <Brain size={12} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-secondary)]">{stats.coreEntries} core</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Archive size={12} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-secondary)]">{stats.archivalEntries} archival</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-secondary)]">{stats.recallEntries} recall</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Database size={12} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-secondary)]">{stats.totalTokens.toLocaleString()} tokens</span>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-[var(--border-primary)]">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Tìm trong bộ nhớ..."
              className="flex-1"
            />
            <Button variant="secondary" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-primary)]">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); if (id !== 'search') clearSearch() }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium',
                'transition-all duration-100 border-b-2',
                activeTab === id
                  ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]'
                  : 'text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          )}

          {!loading && activeTab === 'core' && (
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setCoreOpen(!coreOpen)}
              >
                {coreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Core Memory</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">({coreMemory.length} mục)</span>
              </div>

              {coreOpen && (
                <div className="space-y-2">
                  {CORE_SECTIONS.map((section) => {
                    const entry = coreMemory.find((e) => e.section === section)
                    return (
                      <MemoryEditor
                        key={section}
                        section={section}
                        content={entry?.content || ''}
                        onSave={(s, c) => projectId && updateCoreMemory(projectId, s, c)}
                        onDelete={(s) => projectId && deleteCoreMemory(projectId, s)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'archival' && (
            <div className="space-y-3">
              {/* Add new */}
              <div className="border border-[var(--border-primary)] rounded-xl p-3">
                <textarea
                  value={newArchivalContent}
                  onChange={(e) => setNewArchivalContent(e.target.value)}
                  placeholder="Thêm kiến thức vào archival memory..."
                  className={cn(
                    'w-full min-h-[60px] rounded-lg p-2 text-[13px]',
                    'bg-[var(--bg-secondary)] text-[var(--text-primary)]',
                    'border border-[var(--border-primary)]',
                    'focus:outline-none focus:border-[var(--accent-primary)]',
                    'resize-y'
                  )}
                />
                <div className="flex justify-end mt-2">
                  <Button variant="primary" size="sm" onClick={handleAddArchival} disabled={addingArchival || !newArchivalContent.trim()}>
                    {addingArchival ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span className="ml-1">Thêm</span>
                  </Button>
                </div>
              </div>

              {/* List */}
              {archivalMemory.length === 0 ? (
                <div className="text-center py-8">
                  <Archive size={28} className="text-[var(--text-tertiary)] mx-auto mb-2 opacity-40" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">Chưa có archival memory</p>
                </div>
              ) : (
                archivalMemory.map((entry) => (
                  <div key={entry.id} className="border border-[var(--border-primary)] rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap flex-1 mr-2">
                        {entry.content.length > 300 ? entry.content.slice(0, 300) + '...' : entry.content}
                      </p>
                      <Button variant="ghost" size="icon" onClick={() => deleteArchivalMemory(entry.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {new Date(entry.created_at).toLocaleDateString('vi-VN')}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        Truy cập: {entry.access_count}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        Điểm: {entry.relevance_score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && activeTab === 'recall' && (
            <div className="space-y-2">
              {recallMemory.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={28} className="text-[var(--text-tertiary)] mx-auto mb-2 opacity-40" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">Chưa có recall memory</p>
                </div>
              ) : (
                recallMemory.map((entry) => (
                  <div key={entry.id} className="border border-[var(--border-primary)] rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-[11px] font-medium px-1.5 py-0.5 rounded',
                        entry.role === 'user' ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                      )}>
                        {entry.role}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {new Date(entry.timestamp).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                      {entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && activeTab === 'search' && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <div className="text-center py-8">
                  <Search size={28} className="text-[var(--text-tertiary)] mx-auto mb-2 opacity-40" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">
                    {searchQuery ? 'Không tìm thấy kết quả' : 'Nhập từ khóa để tìm kiếm'}
                  </p>
                </div>
              ) : (
                searchResults.map((result, idx) => (
                  <div key={idx} className="border border-[var(--border-primary)] rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-[11px] font-medium px-1.5 py-0.5 rounded',
                        result.tier === 'core' ? 'bg-[var(--accent-primary)] text-white'
                          : result.tier === 'archival' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      )}>
                        {result.tier}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        Điểm: {result.score.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                      {'content' in result.entry ? (result.entry.content.length > 200 ? result.entry.content.slice(0, 200) + '...' : result.entry.content) : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
