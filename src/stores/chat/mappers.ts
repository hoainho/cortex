import type { Conversation, Message, ResponseMode } from '../../types'

export function mapDbConversation(row: Record<string, unknown>, messages: Message[] = []): Conversation {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    title: row.title as string,
    mode: row.mode as ResponseMode,
    branch: (row.branch as string) || 'main',
    pinned: row.pinned === 1,
    messages,
    createdAt: row.created_at as number
  }
}

export function mapDbMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as Message['role'],
    content: row.content as string,
    mode: row.mode as ResponseMode,
    createdAt: row.created_at as number
  }
}
