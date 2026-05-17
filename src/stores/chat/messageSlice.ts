import type { StateCreator } from 'zustand'
import type { ChatState, MessageSlice } from './types'
import type { Message } from '../../types'

export const createMessageSlice: StateCreator<
  ChatState,
  [],
  [],
  MessageSlice
> = (set, get) => ({
  addMessage: async (conversationId, role, content, mode, attachments?) => {
    let dbMessageId: string | null = null
    if (window.electronAPI?.createMessage) {
      try {
        const result = await window.electronAPI.createMessage(conversationId, role, content, mode)
        if (result?.id) dbMessageId = result.id
      } catch (err) {
        console.error('[ChatStore] Failed to persist message:', err)
      }
    }

    const message: Message = {
      id: dbMessageId || crypto.randomUUID?.() || String(Date.now()),
      conversationId,
      role,
      content,
      mode,
      createdAt: Date.now(),
      ...(role === 'assistant' && !content ? { isStreaming: true } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {})
    }

    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              messages: [...c.messages, message],
              title: c.messages.length === 0 && role === 'user'
                ? content.slice(0, 50)
                : c.title
            }
          : c
      )
    }))

    const conv = get().conversations.find(c => c.id === conversationId)
    if (conv && conv.messages.length === 1 && role === 'user' && window.electronAPI?.updateConversationTitle) {
      window.electronAPI.updateConversationTitle(conversationId, content.slice(0, 50)).catch(() => {})
    }

    return dbMessageId
  },

  updateLastMessage: (conversationId, content) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m, i) =>
                i === c.messages.length - 1 ? { ...m, content } : m
              )
            }
          : c
      )
    }))
  },

  setMessageStreaming: (conversationId, messageId, isStreaming) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map(m =>
                m.id === messageId ? { ...m, isStreaming } : m
              )
            }
          : c
      )
    }))
  }
})
