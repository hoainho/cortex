import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { cn } from '../../lib/utils'
import type { Message } from '../../types'

const PAGE_SIZE = 50

interface MessageListProps {
  messages: Message[]
  onFeedback?: (messageId: string, type: 'thumbs_up' | 'thumbs_down') => void
  onCopy?: (messageId: string) => void
  searchMatchIds?: string[]
  searchCurrentId?: string | null
  searchQuery?: string
}

export function MessageList({ messages, onFeedback, onCopy, searchMatchIds, searchCurrentId, searchQuery }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const visibleMessages = useMemo(() => {
    if (searchCurrentId && searchMatchIds && searchMatchIds.length > 0) {
      return messages
    }
    return messages.slice(-visibleCount)
  }, [messages, visibleCount, searchCurrentId, searchMatchIds])

  const hasHiddenMessages = messages.length > visibleCount && !searchCurrentId

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [messages.length === 0])

  const scrollToBottom = useCallback(() => {
    isUserScrolledUp.current = false
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100
    if (isAtBottom) {
      isUserScrolledUp.current = false
      setShowScrollButton(false)
    } else {
      isUserScrolledUp.current = true
      setShowScrollButton(true)
    }
    if (el.scrollTop < 200 && messages.length > visibleCount) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, messages.length))
    }
  }, [messages.length, visibleCount])

  useEffect(() => {
    if (!isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (!searchCurrentId) return
    const el = document.getElementById(`msg-${searchCurrentId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchCurrentId])

  return (
    <div className="relative h-full">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="w-full max-w-[900px] mx-auto px-5 xl:px-6">
          {hasHiddenMessages && (
            <div className="text-center py-3">
              <button
                onClick={() => setVisibleCount(prev => Math.min(prev + PAGE_SIZE, messages.length))}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                ↑ Tải thêm {Math.min(PAGE_SIZE, messages.length - visibleCount)} tin nhắn cũ hơn
              </button>
            </div>
          )}
          {visibleMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onFeedback={onFeedback}
              onCopy={onCopy}
              isSearchMatch={!!searchMatchIds?.includes(message.id)}
              isSearchCurrent={searchCurrentId === message.id}
              searchQuery={searchQuery ?? ''}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <button
        onClick={scrollToBottom}
        className={cn(
          'absolute bottom-4 right-6 z-10',
          'w-8 h-8 rounded-full flex items-center justify-center',
          'bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-md',
          'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
          'transition-all duration-200',
          showScrollButton
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
        title="Cuộn xuống dưới"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  )
}
