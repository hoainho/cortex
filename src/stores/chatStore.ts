import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createConversationSlice } from './chat/conversationSlice'
import { createMessageSlice } from './chat/messageSlice'
import { createThinkingSlice } from './chat/thinkingSlice'
import type { ChatState } from './chat/types'

export type { StoredThinkingStep } from './chat/types'

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((...args) => ({
    ...createConversationSlice(...args),
    ...createMessageSlice(...args),
    ...createThinkingSlice(...args),
  }))
)
