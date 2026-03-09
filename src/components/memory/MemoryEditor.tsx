import { useState } from 'react'
import { Save, X, Edit3 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import type { CoreMemorySection } from '../../stores/memoryStore'

interface MemoryEditorProps {
  section: CoreMemorySection
  content: string
  onSave: (section: CoreMemorySection, content: string) => void
  onDelete: (section: CoreMemorySection) => void
}

const SECTION_LABELS: Record<CoreMemorySection, string> = {
  user_profile: 'Hồ sơ người dùng',
  project_context: 'Ngữ cảnh dự án',
  preferences: 'Tùy chọn',
  coding_style: 'Phong cách code',
  tool_preferences: 'Công cụ ưa thích'
}

export function MemoryEditor({ section, content, onSave, onDelete }: MemoryEditorProps) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)

  const handleSave = () => {
    onSave(section, editContent)
    setEditing(false)
  }

  const handleCancel = () => {
    setEditContent(content)
    setEditing(false)
  }

  return (
    <div className="border border-[var(--border-primary)] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {SECTION_LABELS[section]}
        </span>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button variant="ghost" size="icon" onClick={handleSave}>
                <Save size={14} />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => { setEditing(true); setEditContent(content) }}>
                <Edit3 size={14} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(section)}>
                <X size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className={cn(
            'w-full min-h-[80px] rounded-lg p-2 text-[13px]',
            'bg-[var(--bg-secondary)] text-[var(--text-primary)]',
            'border border-[var(--border-primary)]',
            'focus:outline-none focus:border-[var(--accent-primary)]',
            'resize-y'
          )}
        />
      ) : (
        <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
          {content || 'Chưa có nội dung'}
        </p>
      )}
    </div>
  )
}
