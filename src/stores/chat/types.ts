import type { Conversation, Message, ResponseMode, ThinkingStep, ChatAttachment } from '../../types'

export interface StoredThinkingStep {
  step: ThinkingStep['step']
  status: ThinkingStep['status']
  label: string
  detail?: string
  durationMs?: number
}

export interface ConversationSlice {
  conversations: Conversation[]
  activeConversationId: string | null
  isLoadingConversations: boolean

  loadConversations: (projectId: string) => Promise<void>
  loadMessagesForConversation: (conversationId: string) => Promise<void>
  setActiveConversation: (id: string | null) => void
  getProjectConversations: (projectId: string) => Conversation[]
  createConversation: (projectId: string, mode: ResponseMode, branch?: string) => Promise<string | null>
  renameConversation: (conversationId: string, newTitle: string) => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
  pinConversation: (conversationId: string) => Promise<void>
}

export interface MessageSlice {
  addMessage: (conversationId: string, role: Message['role'], content: string, mode: ResponseMode, attachments?: ChatAttachment[]) => Promise<string | null>
  updateLastMessage: (conversationId: string, content: string) => void
  setMessageStreaming: (conversationId: string, messageId: string, isStreaming: boolean) => void
}

export interface ThinkingSlice {
  thinkingSteps: Map<string, StoredThinkingStep[]>
  pushThinkingStep: (conversationId: string, step: StoredThinkingStep) => void
  clearThinkingSteps: (conversationId: string) => void
  getThinkingSteps: (conversationId: string) => StoredThinkingStep[]
}

export type ChatState = ConversationSlice & MessageSlice & ThinkingSlice
