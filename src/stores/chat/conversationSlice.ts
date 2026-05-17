import type { StateCreator } from 'zustand'
import type { ChatState, ConversationSlice } from './types'
import { mapDbConversation, mapDbMessage } from './mappers'
import type { Message } from '../../types'

export const createConversationSlice: StateCreator<
  ChatState,
  [],
  [],
  ConversationSlice
> = (set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoadingConversations: false,

  loadConversations: async (projectId) => {
    if (!window.electronAPI?.getConversationsByProject) return
    set({ isLoadingConversations: true })
    try {
      const rows = await window.electronAPI.getConversationsByProject(projectId)
      set({ conversations: (rows as Record<string, unknown>[]).map(r => mapDbConversation(r)) })
    } catch (err) {
      console.error('[ChatStore] Failed to load conversations:', err)
    } finally {
      set({ isLoadingConversations: false })
    }
  },

  loadMessagesForConversation: async (conversationId) => {
    if (!window.electronAPI?.getMessagesByConversation) return
    const existing = get().conversations.find(c => c.id === conversationId)
    if (!existing || existing.messages.length > 0) return
    try {
      const rows = await window.electronAPI.getMessagesByConversation(conversationId)
      const messages = (rows as Record<string, unknown>[])
        .map(mapDbMessage)
        .filter((m: Message) => m.content !== '')
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? { ...c, messages } : c
        )
      }))
    } catch (err) {
      console.error('[ChatStore] Failed to load messages:', err)
    }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  getProjectConversations: (projectId) =>
    get().conversations.filter(c => c.projectId === projectId),

  createConversation: async (projectId, mode, branch) => {
    if (!window.electronAPI?.createConversation) return null
    try {
      const row = await window.electronAPI.createConversation(projectId, 'Cuộc trò chuyện mới', mode, branch)
      if (!row) return null
      const conversation = mapDbConversation(row as Record<string, unknown>)
      set(state => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id
      }))
      return conversation.id
    } catch (err) {
      console.error('[ChatStore] Failed to create conversation:', err)
      return null
    }
  },

  renameConversation: async (conversationId, newTitle) => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    if (window.electronAPI?.updateConversationTitle) {
      try {
        await window.electronAPI.updateConversationTitle(conversationId, trimmed)
      } catch (err) {
        console.error('[ChatStore] Failed to rename conversation:', err)
        return
      }
    }
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId ? { ...c, title: trimmed } : c
      )
    }))
  },

  deleteConversation: async (conversationId) => {
    if (!window.electronAPI?.deleteConversation) return
    try {
      await window.electronAPI.deleteConversation(conversationId)
      set(state => ({
        conversations: state.conversations.filter(c => c.id !== conversationId),
        activeConversationId:
          state.activeConversationId === conversationId ? null : state.activeConversationId
      }))
    } catch (err) {
      console.error('[ChatStore] Failed to delete conversation:', err)
    }
  },

  pinConversation: async (conversationId) => {
    if (!window.electronAPI?.pinConversation) return
    try {
      await window.electronAPI.pinConversation(conversationId)
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? { ...c, pinned: !c.pinned } : c
        )
      }))
    } catch (err) {
      console.error('[ChatStore] Failed to pin conversation:', err)
    }
  }
})
