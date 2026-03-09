import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

interface MessageListProps {
  messages: Message[]
  onFeedback?: (messageId: string, type: 'thumbs_up' | 'thumbs_down') => void
  onCopy?: (messageId: string) => void
}

export function MessageList({ messages, onFeedback, onCopy }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6">
      <div className="max-w-[720px] mx-auto">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onFeedback={onFeedback} onCopy={onCopy} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
