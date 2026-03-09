import { Brain, FolderOpen, Github, Sparkles } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useUIStore } from '../../stores/uiStore'

export function EmptyState() {
  const { activeProjectId, projects } = useProjectStore()
  const { openNewProjectModal } = useUIStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  // No project selected
  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-[400px] px-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-6">
            <Brain size={32} className="text-[var(--accent-primary)]" />
          </div>
          <h2 className="text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-2">
            Chào mừng đến Cortex
          </h2>
          <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed mb-8">
            Chọn một dự án từ sidebar hoặc tạo dự án mới để bắt đầu trò chuyện với bộ não AI của bạn.
          </p>

          <button
            onClick={openNewProjectModal}
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-medium text-[14px] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all duration-100"
          >
            <Sparkles size={18} />
            Tạo dự án đầu tiên
          </button>

          <div className="mt-10 flex items-center justify-center gap-6 text-[var(--text-tertiary)] text-[13px]">
            <div className="flex items-center gap-1.5">
              <FolderOpen size={14} />
              Import từ máy
            </div>
            <div className="flex items-center gap-1.5">
              <Github size={14} />
              Import từ GitHub
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Project selected but no conversation
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
