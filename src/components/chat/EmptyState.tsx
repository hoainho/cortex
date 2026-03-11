import { Brain, FolderOpen, Github, Sparkles, Bot, Zap, Search, Shield } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'
import { APP_VERSION } from '../../lib/version'

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
      <div className="flex-1 flex items-center justify-center">
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
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-[420px] px-6">
        <div className="w-14 h-14 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-5">
          <Brain size={28} className="text-[var(--accent-primary)]" />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-tight mb-1">
          {activeProject.brainName}
        </h2>
        <p className="text-[var(--text-tertiary)] text-[13px] mb-3">
          {activeProject.name}
        </p>
        <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed">
          Hỏi bất kỳ điều gì về dự án. Tôi đã phân tích toàn bộ source code và sẵn sàng trả lời.
        </p>
      </div>
    </div>
  )
}
