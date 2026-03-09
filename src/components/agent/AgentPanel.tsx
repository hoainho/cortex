import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Bot, Trash2, Loader2, Square,
  ChevronDown, CheckCircle, AlertCircle, Zap,
  Wrench, Lightbulb, Blocks, Shield, Gauge, Eye,
  PenTool, Type, Brain, Cpu, ChevronRight, Play
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'

interface AgentPanelProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

interface AgentStep {
  step: string
  type: string
  content: string
  timestamp: number
}

interface AgentInfo {
  role: string
  name: string
  description: string
  icon: typeof Bot
  color: string
  category: 'named' | 'core' | 'background'
  mechanism: string
}

const ALL_AGENTS: AgentInfo[] = [
  {
    role: 'sisyphus',
    name: 'Sisyphus — Ultraworker',
    description: 'Relentless orchestrator that handles any task with persistence.',
    icon: Zap,
    color: 'text-amber-500',
    category: 'named',
    mechanism: 'Breaks complex tasks into atomic steps. Delegates to specialized sub-agents, verifies output, and keeps pushing until the task is fully complete. Activated via /agents popup badge.'
  },
  {
    role: 'hephaestus',
    name: 'Hephaestus — Deep Agent',
    description: 'Goal-oriented autonomous problem solver for hairy problems.',
    icon: Wrench,
    color: 'text-orange-500',
    category: 'named',
    mechanism: 'Researches thoroughly before acting — examines all angles, dependencies, and root causes. Prefers understanding over quick fixes. Activated via /agents popup badge.'
  },
  {
    role: 'prometheus',
    name: 'Prometheus — Strategic Planner',
    description: 'Analyzes features and creates architecture proposals with execution blueprints.',
    icon: Lightbulb,
    color: 'text-yellow-500',
    category: 'named',
    mechanism: 'Produces detailed execution plans with architecture decisions, task breakdowns, risk assessments, and dependency graphs. Plans before anyone builds. Activated via /agents popup badge.'
  },
  {
    role: 'atlas',
    name: 'Atlas — Heavy Lifter',
    description: 'Handles large-scale tasks across multiple files and systems.',
    icon: Blocks,
    color: 'text-indigo-500',
    category: 'named',
    mechanism: 'Built for parallel execution across codebases. Handles the heaviest workloads with systematic, methodical precision. Activated via /agents popup badge.'
  },
  {
    role: 'implementation',
    name: 'Implementation Engineer',
    description: 'Handles code generation, debugging, and complex technical tasks.',
    icon: Cpu,
    color: 'text-[var(--accent-primary)]',
    category: 'core',
    mechanism: 'Primary coding agent. Activated automatically for implementation/debugging intents. Generates code, fixes bugs, and handles technical operations. Runs as the lead in the implementation agent team.'
  },
  {
    role: 'review',
    name: 'Code Reviewer',
    description: 'Reviews code quality, patterns, maintainability, and best practices.',
    icon: Eye,
    color: 'text-blue-400',
    category: 'core',
    mechanism: 'Activated for code_review, architecture, and complex_analysis intents. Evaluates code structure, naming conventions, SOLID principles, and identifies anti-patterns.'
  },
  {
    role: 'security',
    name: 'Security Auditor',
    description: 'Identifies security vulnerabilities, injection risks, and authentication issues.',
    icon: Shield,
    color: 'text-red-400',
    category: 'core',
    mechanism: 'Runs in parallel with implementation/review agents. Scans for SQL injection, XSS, CSRF, insecure auth patterns, and exposed secrets. Triggers conflict detection if risks are found but not addressed.'
  },
  {
    role: 'performance',
    name: 'Performance Analyzer',
    description: 'Analyzes code for bottlenecks, memory leaks, and optimization opportunities.',
    icon: Gauge,
    color: 'text-yellow-500',
    category: 'core',
    mechanism: 'Activated for debugging, code_review, and architecture intents. Detects N+1 queries, O(n²) algorithms, memory leaks, and unnecessary re-renders. Raises conflicts with implementation agent if bottlenecks are unaddressed.'
  },
  {
    role: 'writer',
    name: 'Response Writer',
    description: 'Crafts clear, well-structured responses tailored to the user query.',
    icon: PenTool,
    color: 'text-green-400',
    category: 'core',
    mechanism: 'Activated for simple questions, general chat, and as support in code review teams. Synthesizes information from other agents into coherent, readable responses.'
  },
  {
    role: 'formatter',
    name: 'Output Formatter',
    description: 'Ensures consistent formatting, markdown structure, and readability.',
    icon: Type,
    color: 'text-purple-400',
    category: 'core',
    mechanism: 'Runs on almost every agent team as the final pass. Standardizes markdown headings, code blocks, lists, and ensures visual consistency. Never appears in aggregated output sections.'
  },
  {
    role: 'feedback',
    name: 'Feedback Collector',
    description: 'Analyzes response quality and user satisfaction signals.',
    icon: CheckCircle,
    color: 'text-teal-400',
    category: 'background',
    mechanism: 'Async agent — runs in the background after the main response is delivered. Collects implicit signals (follow-up timing, copy actions) and explicit feedback (thumbs up/down) for the learning engine.'
  },
  {
    role: 'knowledge-crystallizer',
    name: 'Knowledge Crystallizer',
    description: 'Extracts and stores structured knowledge from every response.',
    icon: Brain,
    color: 'text-pink-400',
    category: 'background',
    mechanism: 'Async agent — runs in the background after every interaction. Distills key facts, decisions, and patterns into archival memory for future recall. Powers the nano-brain long-term memory system.'
  },
]

const CATEGORY_LABELS: Record<string, { title: string; subtitle: string }> = {
  named: { title: 'Named Agent Modes', subtitle: 'Kích hoạt qua /agents — chọn trong popup, hiển thị badge trên ô chat' },
  core: { title: 'Core Agents', subtitle: 'Tự động kích hoạt theo intent — chạy song song trong mỗi request' },
  background: { title: 'Background Agents', subtitle: 'Chạy async sau khi response được gửi — không ảnh hưởng tốc độ' },
}

export function AgentPanel({ open, onClose }: AgentPanelProps) {
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [activeTab, setActiveTab] = useState<'agents' | 'steps'>('agents')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<'react' | 'plan-execute' | 'reflexion'>('react')
  const stepsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const cleanup = window.electronAPI?.onAgentStep?.((data: { step: string; type: string; content: string }) => {
      setSteps((prev) => [...prev, { ...data, timestamp: Date.now() }])
      setActiveTab('steps')

      if (data.type === 'init' || data.type === 'running') {
        setIsExecuting(true)
      } else if (data.type === 'done' || data.type === 'error' || data.type === 'complete' || data.type === 'aborted') {
        setIsExecuting(false)
      }
    })
    return () => { cleanup?.() }
  }, [open])

  useEffect(() => {
    if (activeTab === 'steps') {
      stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [steps, activeTab])

  const handleAbort = useCallback(() => {
    window.electronAPI?.agentAbort?.()
    setSteps(prev => [...prev, { step: 'abort', type: 'error', content: 'Đã hủy bởi người dùng', timestamp: Date.now() }])
    setIsExecuting(false)
  }, [])

  if (!open) return null

  const stepIcon = (type: string) => {
    switch (type) {
      case 'thought': return <Zap size={12} className="text-[var(--accent-primary)]" />
      case 'action': return <Play size={12} className="text-blue-500" />
      case 'observation': return <CheckCircle size={12} className="text-green-500" />
      case 'error': return <AlertCircle size={12} className="text-[var(--status-error-text)]" />
      default: return <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
    }
  }

  const categories = ['named', 'core', 'background'] as const

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className={cn(
        'relative ml-auto w-[520px] h-full bg-[var(--bg-primary)]',
        'border-l border-[var(--border-primary)]',
        'flex flex-col overflow-hidden',
        'animate-in slide-in-from-right duration-300'
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2.5">
            <Bot size={20} className="text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Agent Mode</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">{ALL_AGENTS.length} agents — orchestrated system</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isExecuting && (
              <Button variant="ghost" size="sm" onClick={handleAbort} className="text-[var(--status-error-text)]">
                <Square size={12} />
                <span className="ml-1">Dừng</span>
              </Button>
            )}
            {steps.length > 0 && activeTab === 'steps' && (
              <Button variant="ghost" size="sm" onClick={() => setSteps([])}>
                <Trash2 size={12} />
                <span className="ml-1">Xóa</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="flex border-b border-[var(--border-primary)]">
          <button
            onClick={() => setActiveTab('agents')}
            className={cn(
              'flex-1 px-4 py-2.5 text-[12px] font-medium transition-all',
              activeTab === 'agents'
                ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            )}
          >
            Agents ({ALL_AGENTS.length})
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={cn(
              'flex-1 px-4 py-2.5 text-[12px] font-medium transition-all relative',
              activeTab === 'steps'
                ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            )}
          >
            Steps
            {steps.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)] text-white text-[10px]">
                {steps.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <span className="text-[11px] text-[var(--text-tertiary)] mr-2">Strategy:</span>
          {([
            { key: 'react' as const, label: 'ReAct' },
            { key: 'plan-execute' as const, label: 'Plan & Execute' },
            { key: 'reflexion' as const, label: 'Reflexion' },
          ]).map(s => (
            <button
              key={s.key}
              onClick={() => setSelectedStrategy(s.key)}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                selectedStrategy === s.key
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'agents' && (
            <div className="px-4 py-3 space-y-5">
              {categories.map(cat => {
                const agents = ALL_AGENTS.filter(a => a.category === cat)
                const label = CATEGORY_LABELS[cat]
                return (
                  <div key={cat}>
                    <div className="mb-2">
                      <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                        {label.title}
                      </h3>
                      <p className="text-[11px] text-[var(--text-tertiary)]">{label.subtitle}</p>
                    </div>
                    <div className="space-y-1">
                      {agents.map(agent => {
                        const isExpanded = expandedAgent === agent.role
                        return (
                          <div key={agent.role} className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
                            <button
                              onClick={() => setExpandedAgent(isExpanded ? null : agent.role)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors text-left"
                            >
                              {isExpanded
                                ? <ChevronDown size={12} className="text-[var(--text-tertiary)] shrink-0" />
                                : <ChevronRight size={12} className="text-[var(--text-tertiary)] shrink-0" />
                              }
                              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', 'bg-[var(--bg-secondary)]')}>
                                <agent.icon size={14} className={agent.color} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                                  {agent.name}
                                </span>
                                <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                                  {agent.description}
                                </p>
                              </div>
                              <span className={cn(
                                'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                                cat === 'named' && 'bg-amber-500/10 text-amber-600',
                                cat === 'core' && 'bg-blue-500/10 text-blue-500',
                                cat === 'background' && 'bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]',
                              )}>
                                {agent.role}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="px-4 py-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                                  Mechanism
                                </div>
                                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                                  {agent.mechanism}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'steps' && (
            <div className="px-5 py-4">
              {isExecuting && steps.length === 0 && (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">Agent đang khởi tạo...</p>
                </div>
              )}

              {!isExecuting && steps.length === 0 && (
                <div className="text-center py-12">
                  <Bot size={32} className="text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">
                    Chọn agent mode qua{' '}
                    <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-[12px] font-mono">/agents</code>
                    {' '}trong chat
                  </p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
                    Steps sẽ hiển thị khi agent đang xử lý
                  </p>
                </div>
              )}

              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 mb-3">
                  <div className="shrink-0 mt-1">{stepIcon(step.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase">
                        {step.step}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(step.timestamp).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap mt-0.5">
                      {step.content}
                    </p>
                  </div>
                </div>
              ))}

              <div ref={stepsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
