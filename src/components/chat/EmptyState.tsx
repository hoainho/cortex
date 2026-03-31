import { Brain, FolderOpen, Github, Sparkles, Bot, Zap, Search, Shield, Code, Bug, ListChecks, Wrench } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'
import { APP_VERSION } from '../../lib/version'

const QUICK_ACTIONS = [
  { icon: Code, label: 'Architecture', color: 'text-blue-500' },
  { icon: Bug, label: 'Find bugs', color: 'text-red-400' },
  { icon: ListChecks, label: 'Review', color: 'text-green-500' },
  { icon: Wrench, label: 'Refactor', color: 'text-amber-500' },
]

const V3_FEATURES = [
  { icon: Bot, label: 'Agent Modes', detail: 'Sisyphus, Hephaestus, Prometheus, Atlas' },
  { icon: Zap, label: 'Smart Routing', detail: 'GitLab-first model priority & auto-rotation' },
  { icon: Search, label: 'Agentic RAG', detail: 'Multi-step retrieval with confidence scoring' },
  { icon: Shield, label: 'Hook System', detail: 'Cost guard, cache, context-window monitor' },
]

export function EmptyState() {
  const { activeProjectId, projects } = useProjectStore()
  const { openNewProjectModal } = useUIStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-[460px] px-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-6">
            <Brain size={32} className="text-[var(--accent-primary)]" />
          </div>
          <h2 className="text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-1">
            Cortex
          </h2>
          <p className="text-[12px] text-[var(--accent-primary)] font-medium mb-3">
            v{APP_VERSION}
          </p>
          <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed mb-8">
            Bộ não AI hiểu toàn bộ codebase của bạn. Chọn dự án hoặc tạo mới để bắt đầu.
          </p>

          <button
            onClick={openNewProjectModal}
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-medium text-[14px] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all duration-100"
          >
            <Sparkles size={18} />
            Tạo dự án mới
          </button>

          <div className="mt-6 flex items-center justify-center gap-6 text-[var(--text-tertiary)] text-[13px]">
            <div className="flex items-center gap-1.5">
              <FolderOpen size={14} />
              Import từ máy
            </div>
            <div className="flex items-center gap-1.5">
              <Github size={14} />
              Import từ GitHub
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 text-left">
            {V3_FEATURES.map(({ icon: Icon, label, detail }) => (
              <div
                key={label}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]"
              >
                <div className="w-7 h-7 rounded-lg bg-[var(--accent-light)] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={14} className="text-[var(--accent-primary)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-tight">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-[400px] px-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Brain size={30} className="text-[var(--accent-primary)]" />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-tight mb-1">
          {activeProject.brainName}
        </h2>
        <p className="text-[var(--text-tertiary)] text-[12px] mb-4">
          {activeProject.name}
        </p>
        <p className="text-[var(--text-secondary)] text-[14px] leading-relaxed mb-8">
          Hỏi bất kỳ điều gì về dự án — tôi đã sẵn sàng.
        </p>

        <div className="flex items-center justify-center gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--accent-light)]/20 transition-all duration-150 cursor-default"
            >
              <Icon size={16} className={color} />
              <span className="text-[10px] font-medium text-[var(--text-tertiary)]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
