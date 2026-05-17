import { useState } from 'react'
import { GitBranch, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useChatStore } from '../../stores/chatStore'
import { useProjectStore } from '../../stores/projectStore'

interface ForkButtonProps {
  messageId: string
  conversationId: string
  className?: string
}

export function ForkButton({ messageId, conversationId, className }: ForkButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const setActiveConversation = useChatStore(s => s.setActiveConversation)
  const loadConversations = useChatStore(s => s.loadConversations)
  const conversations = useChatStore(s => s.conversations)
  const activeProjectId = useProjectStore(s => s.activeProjectId)

  const fork = async () => {
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv || !activeProjectId) return

    setStatus('loading')
    try {
      const result = await window.electronAPI?.forkConversation?.({
        projectId: activeProjectId,
        parentConversationId: conversationId,
        sourceMessageId: messageId,
        branchType: 'continuation',
        title: `⎇ ${conv.title.slice(0, 40)}`,
        mode: conv.mode,
        copyMessages: true
      })
      if (result?.id) {
        await loadConversations(activeProjectId)
        setActiveConversation(result.id)
        setStatus('done')
        setTimeout(() => setStatus('idle'), 2000)
      }
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button
      onClick={fork}
      disabled={status === 'loading'}
      title="Fork conversation from this message"
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors',
        'text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-light)]',
        status === 'done' && 'text-green-500',
        status === 'error' && 'text-red-500',
        className
      )}
    >
      {status === 'loading'
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <GitBranch className="w-3 h-3" />
      }
      {status === 'done' ? 'Forked!' : status === 'error' ? 'Failed' : 'Fork'}
    </button>
  )
}
