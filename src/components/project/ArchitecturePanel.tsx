import { useState, useEffect } from 'react'
import {
  X,
  FileCode,
  Braces,
  Box,
  Layers,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Network,
  Tag,
  ArrowRightFromLine
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface ArchitectureAnalysis {
  entryPoints: string[]
  hubFiles: { path: string; importedBy: number }[]
  layers: { name: string; files: string[] }[]
  dependencyGraph: { source: string; target: string }[]
  techStack: { name: string; version?: string }[]
  stats: {
    totalFiles: number
    totalFunctions: number
    totalClasses: number
    totalInterfaces: number
  }
}

interface ArchitecturePanelProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

export function ArchitecturePanel({ open, onClose, projectId }: ArchitecturePanelProps) {
  const [data, setData] = useState<ArchitectureAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !projectId) return
    setLoading(true)
    setError('')
    setData(null)

    window.electronAPI
      .analyzeArchitecture(projectId)
      .then((result) => setData(result))
      .catch((err) => setError(err instanceof Error ? err.message : 'Lỗi phân tích'))
      .finally(() => setLoading(false))
  }, [open, projectId])

  const toggleLayer = (name: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[500px] z-50',
        'bg-[var(--bg-primary)] border-l border-[var(--border-primary)]',
        'shadow-2xl flex flex-col',
        'animate-in slide-in-from-right duration-200'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2">
            <Network size={18} className="text-[var(--accent-primary)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Kiến trúc dự án</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
              <span className="ml-2 text-[13px] text-[var(--text-secondary)]">Đang phân tích...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--status-error-bg)] text-[var(--status-error-text)] text-[13px]">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!projectId && !loading && (
            <div className="text-center py-12 text-[13px] text-[var(--text-tertiary)]">
              Chọn một dự án để xem kiến trúc
            </div>
          )}

          {data && (
            <>
              {/* Stats Overview */}
              <section>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard icon={FileCode} label="Files" value={data.stats.totalFiles} />
                  <StatCard icon={Braces} label="Functions" value={data.stats.totalFunctions} />
                  <StatCard icon={Box} label="Classes" value={data.stats.totalClasses} />
                  <StatCard icon={Layers} label="Interfaces" value={data.stats.totalInterfaces} />
                </div>
              </section>

              {/* Tech Stack */}
              {data.techStack.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Tag size={16} className="text-[var(--accent-primary)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                      Tech Stack
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.techStack.map((tech, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-primary)] text-[11px] font-medium"
                      >
                        {tech.name}{tech.version ? ` ${tech.version}` : ''}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Architecture Layers */}
              {data.layers.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={16} className="text-[var(--accent-primary)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                      Layers
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {data.layers.map((layer) => (
                      <div key={layer.name}>
                        <button
                          onClick={() => toggleLayer(layer.name)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left hover:bg-[var(--bg-sidebar-hover)] transition-colors"
                        >
                          {expandedLayers.has(layer.name) ? (
                            <ChevronDown size={14} className="text-[var(--text-tertiary)] shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-[var(--text-tertiary)] shrink-0" />
                          )}
                          <span className="text-[13px] text-[var(--text-primary)] flex-1">{layer.name}</span>
                          <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
                            {layer.files.length}
                          </span>
                        </button>
                        {expandedLayers.has(layer.name) && (
                          <div className="ml-7 mt-1 mb-2 space-y-0.5">
                            {layer.files.slice(0, 20).map((file, i) => (
                              <div key={i} className="flex items-center gap-1.5 px-2 py-0.5">
                                <FileCode size={10} className="text-[var(--text-tertiary)] shrink-0" />
                                <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate">
                                  {file}
                                </span>
                              </div>
                            ))}
                            {layer.files.length > 20 && (
                              <div className="text-[11px] text-[var(--text-tertiary)] px-2 py-0.5">
                                +{layer.files.length - 20} files khác
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Hub Files */}
              {data.hubFiles.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Network size={16} className="text-[var(--accent-primary)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                      Hub Files
                    </h3>
                    <span className="text-[11px] text-[var(--text-tertiary)]">(được import nhiều nhất)</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.hubFiles.slice(0, 10).map((hub, i) => {
                      const maxImports = data.hubFiles[0]?.importedBy || 1
                      const pct = Math.round((hub.importedBy / maxImports) * 100)
                      return (
                        <div key={i} className="relative">
                          <div
                            className="absolute inset-0 rounded-lg bg-[var(--accent-light)] opacity-40"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between px-2.5 py-1.5">
                            <span className="text-[12px] text-[var(--text-primary)] font-mono truncate max-w-[350px]">
                              {hub.path}
                            </span>
                            <span className="text-[11px] text-[var(--accent-primary)] font-medium shrink-0 ml-2">
                              {hub.importedBy}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Entry Points */}
              {data.entryPoints.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightFromLine size={16} className="text-[var(--accent-primary)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                      Entry Points
                    </h3>
                    <span className="text-[11px] text-[var(--text-tertiary)]">(không được import bởi file nào)</span>
                  </div>
                  <div className="space-y-0.5">
                    {data.entryPoints.slice(0, 15).map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-0.5">
                        <FileCode size={10} className="text-[var(--text-tertiary)] shrink-0" />
                        <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate">
                          {entry}
                        </span>
                      </div>
                    ))}
                    {data.entryPoints.length > 15 && (
                      <div className="text-[11px] text-[var(--text-tertiary)] px-2 py-0.5">
                        +{data.entryPoints.length - 15} entries khác
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function StatCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof FileCode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
      <div className="w-8 h-8 rounded-lg bg-[var(--accent-light)] flex items-center justify-center">
        <Icon size={16} className="text-[var(--accent-primary)]" />
      </div>
      <div>
        <div className="text-[18px] font-semibold text-[var(--text-primary)] leading-none">{value.toLocaleString()}</div>
        <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{label}</div>
      </div>
    </div>
  )
}
