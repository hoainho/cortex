import type { TaskCategory, CategoryConfig } from './types'

export const CATEGORY_CONFIGS: Record<TaskCategory, CategoryConfig> = {
  deep: {
    category: 'deep',
    description: 'Goal-oriented autonomous problem-solving with thorough research',
    defaultModel: 'claude-sonnet-4-6',
    fallbackChain: ['gemini-3.1-pro-low', 'gemini-2.5-flash'],
    temperature: 0.3,
    maxTokens: 8192,
    thinkingBudget: 10000,
    reasoningEffort: 'high'
  },
  'visual-engineering': {
    category: 'visual-engineering',
    description: 'Frontend, UI/UX, design, styling, animation',
    defaultModel: 'claude-sonnet-4-6',
    fallbackChain: ['gemini-3.1-pro-low', 'gemini-2.5-flash'],
    temperature: 0.4,
    maxTokens: 4096,
    promptAppend: 'Focus on clean, accessible UI. Follow existing design patterns.'
  },
  ultrabrain: {
    category: 'ultrabrain',
    description: 'Hard logic, algorithms, architecture decisions',
    defaultModel: 'gemini-3.1-pro-high',
    fallbackChain: ['claude-opus-4-6-thinking', 'claude-sonnet-4-6'],
    temperature: 0.1,
    maxTokens: 16384,
    thinkingBudget: 30000,
    reasoningEffort: 'high'
  },
  artistry: {
    category: 'artistry',
    description: 'Creative problem-solving beyond standard patterns',
    defaultModel: 'claude-sonnet-4-6',
    fallbackChain: ['gemini-3.1-pro-low', 'gemini-2.5-flash'],
    temperature: 0.7,
    maxTokens: 8192
  },
  quick: {
    category: 'quick',
    description: 'Trivial single-file changes, typo fixes',
    defaultModel: 'gemini-2.5-flash',
    fallbackChain: ['qwen3-coder-flash', 'gemini-2.5-flash-lite'],
    temperature: 0.2,
    maxTokens: 2048
  },
  'unspecified-low': {
    category: 'unspecified-low',
    description: 'Generic low-effort tasks',
    defaultModel: 'gemini-2.5-flash',
    fallbackChain: ['qwen3-coder-flash', 'gemini-2.5-flash-lite'],
    temperature: 0.3,
    maxTokens: 4096
  },
  'unspecified-high': {
    category: 'unspecified-high',
    description: 'Generic high-effort tasks',
    defaultModel: 'claude-sonnet-4-6',
    fallbackChain: ['gemini-3.1-pro-low', 'gemini-2.5-flash'],
    temperature: 0.3,
    maxTokens: 8192
  },
  writing: {
    category: 'writing',
    description: 'Documentation, prose, technical writing',
    defaultModel: 'claude-sonnet-4-6',
    fallbackChain: ['gemini-3.1-pro-low', 'gemini-2.5-flash'],
    temperature: 0.5,
    maxTokens: 4096,
    promptAppend: 'Write clearly and concisely. Use proper formatting.'
  }
}
