import { render, screen } from '@testing-library/react'
import { useChatStore } from '../../src/stores/chatStore'
import type { Message } from '../../src/types'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

vi.mock('../../src/components/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) => (
    <div data-testid={`msg-${message.id}`} data-role={message.role}>
      {message.content}
    </div>
  )
}))

import { MessageList } from '../../src/components/chat/MessageList'

function makeMessage(i: number, role: 'user' | 'assistant' = 'user'): Message {
  return {
    id: `msg-${i}`,
    conversationId: 'conv-1',
    role,
    content: `Message content ${i}`,
    mode: 'engineering',
    createdAt: Date.now() + i
  }
}

describe('MessageList — render correctness (guards virtualization fix)', () => {
  it('renders all provided messages', () => {
    const messages = [makeMessage(1), makeMessage(2), makeMessage(3)]
    render(<MessageList messages={messages} />)

    expect(screen.getByTestId('msg-msg-1')).toBeInTheDocument()
    expect(screen.getByTestId('msg-msg-2')).toBeInTheDocument()
    expect(screen.getByTestId('msg-msg-3')).toBeInTheDocument()
  })

  it('renders empty list without crashing', () => {
    const { container } = render(<MessageList messages={[]} />)
    expect(container).toBeInTheDocument()
  })

  it('renders exactly as many message elements as provided', () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeMessage(i))
    render(<MessageList messages={messages} />)
    const rendered = screen.getAllByTestId(/^msg-msg-/)
    expect(rendered).toHaveLength(10)
  })

  it('passes correct message content to each bubble', () => {
    const messages = [makeMessage(1), makeMessage(2)]
    render(<MessageList messages={messages} />)
    expect(screen.getByText('Message content 1')).toBeInTheDocument()
    expect(screen.getByText('Message content 2')).toBeInTheDocument()
  })

  it('renders messages from different roles', () => {
    const messages = [
      makeMessage(1, 'user'),
      makeMessage(2, 'assistant'),
      makeMessage(3, 'user')
    ]
    render(<MessageList messages={messages} />)
    expect(screen.getByTestId('msg-msg-1')).toHaveAttribute('data-role', 'user')
    expect(screen.getByTestId('msg-msg-2')).toHaveAttribute('data-role', 'assistant')
  })

  it('re-renders correctly when messages array grows (streaming simulation)', () => {
    const { rerender } = render(<MessageList messages={[makeMessage(1)]} />)
    expect(screen.getAllByTestId(/^msg-msg-/)).toHaveLength(1)

    rerender(<MessageList messages={[makeMessage(1), makeMessage(2)]} />)
    expect(screen.getAllByTestId(/^msg-msg-/)).toHaveLength(2)

    rerender(<MessageList messages={[makeMessage(1), makeMessage(2), makeMessage(3)]} />)
    expect(screen.getAllByTestId(/^msg-msg-/)).toHaveLength(3)
  })

  it('scroll-to-bottom button is hidden initially', () => {
    const messages = [makeMessage(1)]
    render(<MessageList messages={messages} />)
    const btn = screen.getByRole('button', { name: /cuộn xuống/i })
    expect(btn).toHaveClass('opacity-0')
  })
})

describe('chatStore — message accumulation (guards lazy-load fix)', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      thinkingSteps: new Map()
    })
  })

  it('pushThinkingStep stores steps per conversation', () => {
    useChatStore.getState().pushThinkingStep('conv-1', {
      step: 'rag_search',
      status: 'done',
      label: 'Searching',
      durationMs: 100
    })
    const steps = useChatStore.getState().getThinkingSteps('conv-1')
    expect(steps).toHaveLength(1)
    expect(steps[0].step).toBe('rag_search')
  })

  it('pushThinkingStep updates existing step by step key (no duplicates)', () => {
    useChatStore.getState().pushThinkingStep('conv-1', {
      step: 'rag_search',
      status: 'pending',
      label: 'Searching...'
    })
    useChatStore.getState().pushThinkingStep('conv-1', {
      step: 'rag_search',
      status: 'done',
      label: 'Search complete'
    })
    const steps = useChatStore.getState().getThinkingSteps('conv-1')
    expect(steps).toHaveLength(1)
    expect(steps[0].status).toBe('done')
  })

  it('clearThinkingSteps removes all steps for a conversation', () => {
    useChatStore.getState().pushThinkingStep('conv-1', {
      step: 'rag_search',
      status: 'done',
      label: 'Done'
    })
    useChatStore.getState().clearThinkingSteps('conv-1')
    expect(useChatStore.getState().getThinkingSteps('conv-1')).toHaveLength(0)
  })

  it('getThinkingSteps returns empty array for unknown conversation', () => {
    expect(useChatStore.getState().getThinkingSteps('unknown-conv')).toEqual([])
  })

  it('thinking steps are isolated per conversation', () => {
    useChatStore.getState().pushThinkingStep('conv-A', {
      step: 'rag_search',
      status: 'done',
      label: 'A done'
    })
    useChatStore.getState().pushThinkingStep('conv-B', {
      step: 'intent_classify',
      status: 'pending',
      label: 'B pending'
    })

    expect(useChatStore.getState().getThinkingSteps('conv-A')).toHaveLength(1)
    expect(useChatStore.getState().getThinkingSteps('conv-B')).toHaveLength(1)
    expect(useChatStore.getState().getThinkingSteps('conv-A')[0].step).toBe('rag_search')
    expect(useChatStore.getState().getThinkingSteps('conv-B')[0].step).toBe('intent_classify')
  })

  it('clearThinkingSteps for conv-A does not affect conv-B', () => {
    useChatStore.getState().pushThinkingStep('conv-A', {
      step: 'rag_search',
      status: 'done',
      label: 'A'
    })
    useChatStore.getState().pushThinkingStep('conv-B', {
      step: 'rag_search',
      status: 'done',
      label: 'B'
    })

    useChatStore.getState().clearThinkingSteps('conv-A')
    expect(useChatStore.getState().getThinkingSteps('conv-A')).toHaveLength(0)
    expect(useChatStore.getState().getThinkingSteps('conv-B')).toHaveLength(1)
  })

  it('conversations from different projects stay isolated', () => {
    useChatStore.setState({
      conversations: [
        {
          id: 'conv-proj-A',
          projectId: 'proj-A',
          title: 'Conv A',
          mode: 'engineering',
          branch: 'main',
          createdAt: Date.now(),
          messages: [makeMessage(1), makeMessage(2)]
        },
        {
          id: 'conv-proj-B',
          projectId: 'proj-B',
          title: 'Conv B',
          mode: 'pm',
          branch: 'main',
          createdAt: Date.now(),
          messages: [makeMessage(3)]
        }
      ],
      activeConversationId: null,
      thinkingSteps: new Map()
    })

    const projAConvs = useChatStore.getState().getProjectConversations('proj-A')
    const projBConvs = useChatStore.getState().getProjectConversations('proj-B')

    expect(projAConvs).toHaveLength(1)
    expect(projBConvs).toHaveLength(1)
    expect(projAConvs[0].messages).toHaveLength(2)
    expect(projBConvs[0].messages).toHaveLength(1)
  })
})
