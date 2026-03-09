import { useState, useRef, useEffect } from 'react'
import {
  X, Play, Loader2, Clock, Zap, Shield, Eye, PenTool,
  Type, Brain, Cpu, CheckCircle, AlertTriangle, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tooltip } from '../ui/Tooltip'

interface MultiAgentDemoProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

interface AgentOutputCard {
  role: string
  status: string
  content: string
  confidence: number
  durationMs: number
  metadata: { model?: string; tokensUsed?: { input: number; output: number }; errors?: string[] }
}

interface MultiAgentResult {
  response: string
  agentOutputs: AgentOutputCard[]
  activatedAgents: string[]
  totalDurationMs: number
  intent: { primaryIntent: string; confidence: number; complexity: number; keywords: string[] }
  aggregation: { strategy: string; conflicts: Array<{ agents: [string, string]; description: string; resolution: string }>; estimatedCost: number }
}

interface SingleResult {
  success: boolean
  content?: string
  error?: string
}

const DEMO_QUERIES = [
  { label: 'Code Review', query: 'Review this codebase for security issues, performance bottlenecks, and code quality', icon: Eye },
  { label: 'Debug', query: 'Debug tại sao search không trả kết quả đúng khi query chứa ký tự đặc biệt', icon: AlertTriangle },
  { label: 'Kiến trúc', query: 'Phân tích kiến trúc của hệ thống memory và đề xuất cải thiện', icon: Brain },
]

const ROLE_ICONS: Record<string, typeof Zap> = {
  performance: Zap,
  security: Shield,
  review: Eye,
  writer: PenTool,
  formatter: Type,
  implementation: Cpu,
  feedback: CheckCircle,
  'knowledge-crystallizer': Brain,
}

const ROLE_COLORS: Record<string, string> = {
  performance: 'text-yellow-500',
  security: 'text-red-400',
  review: 'text-blue-400',
  writer: 'text-green-400',
  formatter: 'text-purple-400',
  implementation: 'text-[var(--accent-primary)]',
  feedback: 'text-teal-400',
  'knowledge-crystallizer': 'text-pink-400',
}

export function MultiAgentDemo({ open, onClose, projectId }: MultiAgentDemoProps) {
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [singleResult, setSingleResult] = useState<SingleResult | null>(null)
  const [multiResult, setMultiResult] = useState<MultiAgentResult | null>(null)
  const [singleDuration, setSingleDuration] = useState(0)
  const [multiDuration, setMultiDuration] = useState(0)
  const [singleRunning, setSingleRunning] = useState(false)
  const [multiRunning, setMultiRunning] = useState(false)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())
  const [elapsedSingle, setElapsedSingle] = useState(0)
  const [elapsedMulti, setElapsedMulti] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const singleStartRef = useRef(0)
  const multiStartRef = useRef(0)

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      const now = Date.now()
      if (singleRunning && singleStartRef.current) setElapsedSingle(now - singleStartRef.current)
      if (multiRunning && multiStartRef.current) setElapsedMulti(now - multiStartRef.current)
    }, 100)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running, singleRunning, multiRunning])

  const toggleAgent = (role: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  const handleRun = async () => {
    if (!projectId || !query.trim()) return
    setRunning(true)
    setSingleResult(null)
    setMultiResult(null)
    setSingleDuration(0)
    setMultiDuration(0)
    setElapsedSingle(0)
    setElapsedMulti(0)
    setSingleRunning(true)
    setMultiRunning(true)
    setExpandedAgents(new Set())

    const singleStart = Date.now()
    const multiStart = Date.now()
    singleStartRef.current = singleStart
    multiStartRef.current = multiStart

    const tempConvId = 'demo-' + Date.now()

    const singlePromise = window.electronAPI?.sendChatMessage?.(projectId, tempConvId, query.trim(), 'engineering', [])
      .then((res: SingleResult) => {
        const dur = Date.now() - singleStart
        setSingleDuration(dur)
        setSingleResult(res)
        setSingleRunning(false)
        return res
      })
      .catch((err: Error) => {
        setSingleDuration(Date.now() - singleStart)
        setSingleResult({ success: false, error: err.message })
        setSingleRunning(false)
      })

    const multiPromise = window.electronAPI?.agentsOrchestrate?.({ query: query.trim(), projectId, mode: 'engineering' })
      .then((res: MultiAgentResult) => {
        const dur = Date.now() - multiStart
        setMultiDuration(dur)
        setMultiResult(res)
        setMultiRunning(false)
        return res
      })
      .catch((err: Error) => {
        setMultiDuration(Date.now() - multiStart)
        setMultiResult({ response: `Error: ${err.message}`, agentOutputs: [], activatedAgents: [], totalDurationMs: 0, intent: { primaryIntent: 'error', confidence: 0, complexity: 0, keywords: [] }, aggregation: { strategy: 'single', conflicts: [], estimatedCost: 0 } })
        setMultiRunning(false)
      })

    await Promise.allSettled([singlePromise, multiPromise])
    setRunning(false)
  }

  if (!open) return null

  const formatMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className={cn(
        'relative mx-auto mt-8 mb-8 w-[95vw] max-w-[1400px] h-[calc(100vh-64px)]',
        'bg-[var(--bg-primary)] rounded-2xl',
        'border border-[var(--border-primary)]',
        'flex flex-col overflow-hidden shadow-2xl',
        'animate-in zoom-in-95 duration-200'
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-3">
            <Cpu size={22} className="text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">So sánh Single LLM vs Multi-Agent</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">Cùng 1 câu hỏi, 2 pipeline khác nhau — chạy song song để thấy sự khác biệt</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-3 border-b border-[var(--border-primary)]">
          <div className="flex gap-2 mb-2">
            {DEMO_QUERIES.map(dq => (
              <button
                key={dq.label}
                onClick={() => setQuery(dq.query)}
                disabled={running}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                  'border border-[var(--border-primary)]',
                  query === dq.query
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 text-[var(--accent-primary)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]',
                  running && 'opacity-50 cursor-not-allowed'
                )}
              >
                <dq.icon size={12} />
                {dq.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !running && handleRun()}
              placeholder="Nhập câu hỏi để so sánh 2 pipeline..."
              disabled={running}
              className="flex-1"
            />
            <Button variant="primary" onClick={handleRun} disabled={running || !query.trim() || !projectId}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              <span className="ml-1.5">{running ? 'Đang chạy...' : 'Chạy so sánh'}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r border-[var(--border-primary)] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', singleRunning ? 'bg-yellow-400 animate-pulse' : singleResult ? 'bg-green-400' : 'bg-[var(--text-tertiary)]/30')} />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Single LLM</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">1 model, tuần tự</span>
              </div>
              <div className="flex items-center gap-2">
                {(singleRunning || singleDuration > 0) && (
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] flex items-center gap-1">
                    <Clock size={10} />
                    {singleRunning ? formatMs(elapsedSingle) : formatMs(singleDuration)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!singleResult && !singleRunning && (
                <div className="text-center py-16 text-[var(--text-tertiary)]">
                  <PenTool size={28} className="mx-auto mb-3 opacity-30" />
                  <p className="text-[13px]">Kết quả Single LLM sẽ hiển thị ở đây</p>
                </div>
              )}
              {singleRunning && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
                  <span className="ml-2 text-[13px] text-[var(--text-tertiary)]">Đang gọi LLM...</span>
                </div>
              )}
              {singleResult && (
                <div className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {singleResult.success ? singleResult.content : `Error: ${singleResult.error}`}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', multiRunning ? 'bg-yellow-400 animate-pulse' : multiResult ? 'bg-green-400' : 'bg-[var(--text-tertiary)]/30')} />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Multi-Agent</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">8+1 agents, song song</span>
              </div>
              <div className="flex items-center gap-2">
                {multiResult && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-medium">
                    {multiResult.activatedAgents.length} agents
                  </span>
                )}
                {(multiRunning || multiDuration > 0) && (
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] flex items-center gap-1">
                    <Clock size={10} />
                    {multiRunning ? formatMs(elapsedMulti) : formatMs(multiDuration)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!multiResult && !multiRunning && (
                <div className="text-center py-16 text-[var(--text-tertiary)]">
                  <Cpu size={28} className="mx-auto mb-3 opacity-30" />
                  <p className="text-[13px]">Kết quả Multi-Agent sẽ hiển thị ở đây</p>
                </div>
              )}
              {multiRunning && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
                  <span className="ml-2 text-[13px] text-[var(--text-tertiary)]">Đang chạy {'>'}8 agents song song...</span>
                </div>
              )}
              {multiResult && (
                <div className="space-y-4">
                  {multiResult.intent && (
                    <div className="rounded-xl bg-[var(--bg-secondary)] p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Brain size={12} className="text-[var(--accent-primary)]" />
                        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase">Intent Classification</span>
                      </div>
                      <div className="flex items-center gap-3 text-[12px]">
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-medium">
                          {multiResult.intent.primaryIntent}
                        </span>
                        <span className="text-[var(--text-tertiary)]">
                          confidence: {(multiResult.intent.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="text-[var(--text-tertiary)]">
                          complexity: {(multiResult.intent.complexity * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {multiResult.agentOutputs.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase">Agent Breakdown</span>
                      {multiResult.agentOutputs.map(agent => {
                        const IconComp = ROLE_ICONS[agent.role] || Cpu
                        const colorClass = ROLE_COLORS[agent.role] || 'text-[var(--text-tertiary)]'
                        const isExpanded = expandedAgents.has(agent.role)
                        return (
                          <div key={agent.role} className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
                            <button
                              onClick={() => toggleAgent(agent.role)}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)] transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={12} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={12} className="text-[var(--text-tertiary)]" />}
                              <IconComp size={13} className={colorClass} />
                              <span className="text-[12px] font-medium text-[var(--text-primary)] capitalize">{agent.role}</span>
                              <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded', agent.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400')}>
                                {agent.status}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{formatMs(agent.durationMs)}</span>
                              <span className="text-[10px] text-[var(--text-tertiary)]">{(agent.confidence * 100).toFixed(0)}%</span>
                            </button>
                            {isExpanded && agent.content && (
                              <div className="px-3 py-2 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">
                                  {agent.content.slice(0, 2000)}
                                  {agent.content.length > 2000 && '...'}
                                </pre>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {multiResult.aggregation.conflicts.length > 0 && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={12} className="text-yellow-500" />
                        <span className="text-[11px] font-semibold text-yellow-600 uppercase">Xung đột giữa Agents</span>
                      </div>
                      {multiResult.aggregation.conflicts.map((c, i) => (
                        <div key={i} className="text-[11px] text-[var(--text-secondary)] mb-1">
                          <span className="font-medium">{c.agents[0]} vs {c.agents[1]}</span>: {c.description}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl bg-[var(--bg-secondary)] p-3">
                    <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase block mb-2">Kết quả tổng hợp</span>
                    <div className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                      {multiResult.response.slice(0, 5000)}
                      {multiResult.response.length > 5000 && '...'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {(singleResult || multiResult) && (
          <div className="px-6 py-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] flex items-center justify-between">
            <div className="flex items-center gap-6 text-[12px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[var(--text-tertiary)]">Single LLM:</span>
                <span className="font-mono font-medium text-[var(--text-primary)]">{singleDuration > 0 ? formatMs(singleDuration) : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                <span className="text-[var(--text-tertiary)]">Multi-Agent:</span>
                <span className="font-mono font-medium text-[var(--text-primary)]">{multiDuration > 0 ? formatMs(multiDuration) : '—'}</span>
                {multiResult && (
                  <span className="text-[var(--text-tertiary)]">
                    ({multiResult.activatedAgents.length} agents, {multiResult.aggregation.strategy})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
              {multiResult && multiResult.aggregation.estimatedCost > 0 && (
                <span>Chi phí ước tính: ${multiResult.aggregation.estimatedCost.toFixed(4)}</span>
              )}
              {singleDuration > 0 && multiDuration > 0 && (
                <span className={cn(
                  'px-2 py-0.5 rounded-full font-medium',
                  multiDuration < singleDuration
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-yellow-500/10 text-yellow-600'
                )}>
                  Multi-Agent {multiDuration < singleDuration ? 'nhanh hơn' : 'chậm hơn'} {Math.abs(((multiDuration - singleDuration) / singleDuration) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
