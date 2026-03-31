import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface MessageBlockProps {
  title: string
  content: string
  renderContent?: (content: string) => React.ReactNode
}

export function MessageBlock({ title, content, renderContent }: MessageBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border-primary)] my-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-sidebar)] border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Text</span>
          {title && <>
            <span className="text-[11px] text-[var(--text-tertiary)]">·</span>
            <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate max-w-[360px]">{title}</span>
          </>}
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all duration-200',
            copied
              ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
              : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="px-4 py-3 text-[14px] leading-[1.8] text-[var(--text-primary)] prose-cortex break-words">
        {renderContent ? renderContent(content) : content}
      </div>
    </div>
  )
}
