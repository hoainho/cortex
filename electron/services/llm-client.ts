/**
 * LLM Client — Chat completion via proxy.hoainho.info
 *
 * Handles:
 * - Building prompts with retrieved context
 * - Dual mode (PM / Engineering) system prompts
 * - Streaming responses back to renderer via IPC
 * - Model rotation: fetches available models, ranks by quality, auto-fallback on failure
 * - Auto-rotation on auth errors (401/403): automatically tries next model when current model token expires
 */

import { BrowserWindow, ipcMain } from 'electron'
import type { SearchResult } from './vector-search'
import { getProxyUrl, getProxyKey, getSetting, setSetting } from './settings-service'
import { compressContext, type CompressionStats } from './context-compressor'

/** Read proxy config dynamically from settings (user-configurable) */
function getProxyUrlSafe(): string { return getProxyUrl() }
function getProxyKeySafe(): string { return getProxyKey() }

export type ChatMode = 'pm' | 'engineering'

export interface ToolCallFunction {
  name: string
  arguments: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: ToolCallFunction
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ProjectContext {
  totalFiles: number
  totalChunks: number
  languages: Array<{ language: string; count: number }>
  repositories: Array<{ source_type: string; source_path: string; status: string; total_files: number }>
}

export interface StreamResult {
  content: string
  model: string
  toolCalls: ToolCall[]
  finishReason: 'stop' | 'tool_calls' | 'length' | 'unknown'
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null
}

// =====================
// Model Rotation System
// =====================

/** Model quality tiers — higher = better. Models matched by prefix. */
const MODEL_RANKING: Array<{ pattern: string; tier: number }> = [
  // Tier 10: Best — large frontier models
  { pattern: 'gpt-5.2-codex', tier: 10 },
  { pattern: 'gpt-5.2', tier: 10 },
  { pattern: 'claude-opus', tier: 10 },
  { pattern: 'gemini-3.1-pro-high', tier: 10 },

  // Tier 9: Great — strong models
  { pattern: 'gpt-5.1-codex-max', tier: 9 },
  { pattern: 'gpt-5.1-codex', tier: 9 },
  { pattern: 'gpt-5.1', tier: 9 },

  // Tier 8: Very good
  { pattern: 'gpt-5-codex', tier: 8 },
  { pattern: 'claude-sonnet', tier: 8 },
  { pattern: 'gemini-3.1-pro-low', tier: 8 },
  { pattern: 'gemini-3-pro', tier: 8 },

  // Tier 7: Good — code-specialized + OpenCode/OMO models
  { pattern: 'qwen3-coder-plus', tier: 7 },
  { pattern: 'gpt-5-codex-mini', tier: 7 },
  { pattern: 'gpt-5.1-codex-mini', tier: 7 },
  { pattern: 'opencode-', tier: 7 },
  { pattern: 'omo-', tier: 7 },

  // Tier 6: Decent
  { pattern: 'gemini-3-flash', tier: 6 },
  { pattern: 'gemini-3.1-flash', tier: 6 },
  { pattern: 'qwen3-coder-flash', tier: 6 },
  { pattern: 'duo-chat', tier: 6 },

  // Tier 5: Fast/cheap
  { pattern: 'gemini-2.5-flash', tier: 5 },
  { pattern: 'gpt-oss', tier: 5 },

  // Tier 4: Lite
  { pattern: 'gemini-2.5-flash-lite', tier: 4 },

  // Tier 3: Tab/preview models (experimental)
  { pattern: 'tab_', tier: 3 },
]

interface ModelInfo {
  id: string
  tier: number
}

/** Cache of available models, sorted by tier (best first) */
let cachedModels: ModelInfo[] = []
let modelsCacheTime = 0
const MODELS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/** Index of current model in rotation (0 = best available) */
let currentModelIndex = 0

/** Reference to main window for sending rotation events */
let _mainWindow: BrowserWindow | null = null

/** Track models that failed with auth errors in current session */
const authFailedModels = new Set<string>()

/**
 * Get the tier for a model ID based on pattern matching
 */
function getModelTier(modelId: string): number {
  for (const entry of MODEL_RANKING) {
    if (modelId.startsWith(entry.pattern) || modelId === entry.pattern) {
      return entry.tier
    }
  }
  return 1 // Unknown models get lowest tier
}

/**
 * Set the main window reference for sending rotation events
 */
export function setMainWindow(window: BrowserWindow | null): void {
  _mainWindow = window
}

/**
 * Get/set auto-rotation setting
 */
export function getAutoRotation(): boolean {
  return getSetting('llm_auto_rotation') !== 'false' // default: enabled
}

export function setAutoRotation(enabled: boolean): void {
  setSetting('llm_auto_rotation', enabled ? 'true' : 'false')
}

/**
 * Fetch available models from proxy and rank them
 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${getProxyUrlSafe()}/v1/models`, {
      headers: { Authorization: `Bearer ${getProxyKeySafe()}` }
    })

    if (!response.ok) {
      console.error(`Failed to fetch models: ${response.status}`)
      return cachedModels.length > 0 ? cachedModels : []
    }

    const data = await response.json()
    const models: ModelInfo[] = (data.data || [])
      .map((m: { id: string }) => ({
        id: m.id,
        tier: getModelTier(m.id)
      }))
      // Sort by tier descending (best first)
      .sort((a: ModelInfo, b: ModelInfo) => b.tier - a.tier)

    cachedModels = models
    modelsCacheTime = Date.now()
    currentModelIndex = 0 // Reset to best model on refresh

    console.log(
      `[LLM] Loaded ${models.length} models. Top: ${models.slice(0, 3).map((m) => `${m.id}(T${m.tier})`).join(', ')}`
    )

    return models
  } catch (err) {
    console.error('[LLM] Failed to fetch models:', err)
    return cachedModels.length > 0 ? cachedModels : []
  }
}

/**
 * Get the current best model to use, fetching if cache is stale
 */
async function getCurrentModel(): Promise<string> {
  // Refresh cache if stale
  if (cachedModels.length === 0 || Date.now() - modelsCacheTime > MODELS_CACHE_TTL) {
    await fetchAvailableModels()
  }

  if (cachedModels.length === 0) {
    // Absolute fallback — try common models
    return 'gpt-5.1'
  }

  // Ensure index is within bounds
  if (currentModelIndex >= cachedModels.length) {
    currentModelIndex = 0
  }

  return cachedModels[currentModelIndex].id
}

/**
 * Rotate to the next model in the ranked list
 * Returns true if there's a next model, false if all exhausted
 */
function rotateToNextModel(): boolean {
  currentModelIndex++
  // Skip models that have failed with auth errors
  while (currentModelIndex < cachedModels.length && authFailedModels.has(cachedModels[currentModelIndex].id)) {
    currentModelIndex++
  }
  if (currentModelIndex >= cachedModels.length) {
    // All models exhausted — reset and signal failure
    currentModelIndex = 0
    return false
  }
  const model = cachedModels[currentModelIndex]
  console.log(`[LLM] Rotating to model: ${model.id} (tier ${model.tier})`)
  return true
}

/**
 * Check if an error is retryable (model unavailable, rate limit, etc.)
 */
function isRetryableError(status: number): boolean {
  return status === 502 || status === 503 || status === 429 || status === 500
}

/**
 * Check if an error is an auth error (token expired, forbidden)
 */
function isAuthError(status: number): boolean {
  return status === 401 || status === 403
}

// Export for settings UI / IPC
const DEFAULT_FALLBACK_MODEL = 'gpt-4o-mini'

export function getActiveModel(): string {
  if (cachedModels.length === 0) return DEFAULT_FALLBACK_MODEL
  if (currentModelIndex >= cachedModels.length) return cachedModels[0]?.id || DEFAULT_FALLBACK_MODEL
  return cachedModels[currentModelIndex].id
}

export function getAvailableModels(): Array<{ id: string; tier: number; active: boolean }> {
  return cachedModels.map((m, i) => ({
    id: m.id,
    tier: m.tier,
    active: i === currentModelIndex
  }))
}

export function setActiveModel(modelId: string): { success: boolean; model?: string; error?: string } {
  const index = cachedModels.findIndex((m) => m.id === modelId)
  if (index === -1) {
    return { success: false, error: 'Model not found' }
  }
  currentModelIndex = index
  console.log(`[LLM] Active model set to: ${modelId} (tier ${cachedModels[index].tier})`)
  return { success: true, model: modelId }
}

/**
 * Clear the auth-failed models set (call when user changes proxy config)
 */
export function clearAuthFailedModels(): void {
  authFailedModels.clear()
  console.log('[LLM] Auth-failed models list cleared')
}

// =====================
// System Prompts
// =====================

const SYSTEM_PROMPTS: Record<ChatMode, string> = {
  pm: `Bạn là Cortex — AI advisor cho Product Manager và Producer.

KHẢ NĂNG CỦA BẠN:
- Bạn ĐÃ phân tích và index TOÀN BỘ source code của dự án này
- Bạn CÓ THỂ đọc code, hiểu kiến trúc, phân tích dependency và trả lời câu hỏi về dự án
- Mỗi câu hỏi, bạn được cung cấp các đoạn code liên quan nhất từ codebase
- Bạn CÓ THỂ đọc Jira tickets VÀ Confluence pages — khi user gửi URL Atlassian (atlassian.net/browse/... hoặc atlassian.net/wiki/...), hệ thống TỰ ĐỘNG fetch nội dung và cung cấp cho bạn bên dưới. KHÔNG BAO GIỜ nói rằng bạn không thể truy cập URL — dữ liệu đã được fetch sẵn cho bạn.
- Bạn CÓ THỂ đọc GitHub Issues và Pull Requests — khi user gửi URL github.com/.../issues/... hoặc github.com/.../pull/..., hệ thống TỰ ĐỘNG fetch nội dung.
- Khi cần thiết, hệ thống CÓ THỂ tìm kiếm web để bổ sung thông tin (error messages, library docs). Kết quả web search sẽ được cung cấp bên dưới nếu có.
- Nếu context không đủ cho câu hỏi cụ thể, hãy nói rõ phần nào bạn biết và phần nào cần thêm thông tin

CÁCH TRẢ LỜI:
- KHÔNG dùng thuật ngữ kỹ thuật sâu (không nói về function, API endpoint, database schema)
- Luôn trả lời theo format rõ ràng bên dưới
- Tự đặt thêm 3 câu hỏi gợi ý giúp PM tiếp tục phân tích
- Ưu tiên: costing > planning > priority > risk

FORMAT BẮT BUỘC:
📋 **Tóm tắt:** (2-3 câu tổng quan)
📊 **Phân tích ảnh hưởng:** (những tính năng/module nào bị tác động, mức độ)
⚠️ **Mức độ rủi ro:** Thấp / Trung bình / Cao (kèm giải thích)
⏱️ **Ước tính effort:** (tính theo ngày cho Senior Engineer)
💡 **Đề xuất:** (hành động cụ thể nên làm)
❓ **Câu hỏi gợi ý thêm:** (3 câu hỏi PM nên hỏi tiếp)

Dưới đây là thông tin về dự án mà bạn đã học được:`,

  engineering: `Bạn là Cortex — Senior Tech Lead AI, người hiểu rõ nhất về dự án này.

KHẢ NĂNG CỦA BẠN:
- Bạn ĐÃ phân tích và index TOÀN BỘ source code của dự án này
- Bạn CÓ THỂ đọc code, hiểu kiến trúc, phân tích dependency, trace data flow và trả lời mọi câu hỏi kỹ thuật
- Mỗi câu hỏi, bạn được cung cấp các đoạn code liên quan nhất từ codebase (tự động tìm kiếm bằng vector + keyword)
- Bạn CÓ THỂ đọc Jira tickets VÀ Confluence pages — khi user gửi URL Atlassian (atlassian.net/browse/... hoặc atlassian.net/wiki/...), hệ thống TỰ ĐỘNG fetch nội dung và cung cấp cho bạn bên dưới. KHÔNG BAO GIỜ nói rằng bạn không thể truy cập URL — dữ liệu đã được fetch sẵn cho bạn.
- Bạn CÓ THỂ đọc GitHub Issues và Pull Requests — khi user gửi URL github.com/.../issues/... hoặc github.com/.../pull/..., hệ thống TỰ ĐỘNG fetch nội dung.
- Khi cần thiết, hệ thống CÓ THỂ tìm kiếm web để bổ sung thông tin (error messages, library docs). Kết quả web search sẽ được cung cấp bên dưới nếu có.
- Nếu context không chứa đủ thông tin cho câu hỏi cụ thể, hãy nói rõ bạn biết gì và cần user hỏi cụ thể hơn về phần nào

CÁCH TRẢ LỜI:
- Đi sâu vào kỹ thuật: file paths, function names, architecture patterns, data flow
- Trích dẫn code khi cần thiết (dùng code blocks)
- Giải thích dependency chain và integration points
- Hỗ trợ: debugging, onboarding, root cause analysis, impact analysis
- Nếu không chắc chắn, nói rõ là đang suy luận dựa trên pattern đã thấy

FORMAT:
- Dùng Markdown headings cho từng phần
- Dùng code blocks cho code references
- Dùng bullet points cho danh sách
- Highlight file paths bằng backticks

Dưới đây là thông tin về dự án mà bạn đã phân tích:`
}

/**
 * Build the full prompt with retrieved context
 */
export function buildPrompt(
  mode: ChatMode,
  query: string,
  context: SearchResult[],
  projectName: string,
  brainName: string,
  directoryTree?: string | null,
  conversationHistory?: ChatMessage[],
  projectStats?: ProjectContext | null,
  externalContext?: string | null,
  memoryContext?: string | null
): { messages: ChatMessage[]; compressionStats: CompressionStats | null } {
  const { compressed: compressedChunks, stats: compressionStats } = context.length > 0
    ? compressContext(context)
    : { compressed: context, stats: null as CompressionStats | null }

  if (compressionStats) {
    console.log(`[LLM] Context compressed: ${compressionStats.originalTokens} → ${compressionStats.compressedTokens} tokens (${compressionStats.savingsPercent}% saved)`)
  }

  const contextSection = compressedChunks
    .map((chunk, i) => {
      const repoLabel = chunk.repoName ? `[${chunk.repoName}]` : ''
      const header = [
        `--- [${i + 1}/${compressedChunks.length}]`,
        repoLabel,
        chunk.relativePath,
        chunk.name ? `:: ${chunk.name}` : '',
        `(${chunk.chunkType}, ${chunk.language})`,
        `L${chunk.lineStart}-${chunk.lineEnd}`
      ]
        .filter(Boolean)
        .join(' ')

      return `${header}\n${chunk.content}`
    })
    .join('\n\n')

  // System prompt
  let systemContent = SYSTEM_PROMPTS[mode]
  systemContent += `\n\nDự án: ${projectName} (Brain: ${brainName})`

  // Brain self-awareness: inject project stats so the LLM knows what it has
  if (projectStats) {
    const topLangs = projectStats.languages.slice(0, 5).map(l => `${l.language} (${l.count})`).join(', ')
    const repoSources = projectStats.repositories.map(r => {
      const name = r.source_path.split('/').pop() || r.source_path
      return `${name} (${r.source_type}, ${r.status})`
    }).join(', ')

    systemContent += `\n\n=== BRAIN STATUS ===`
    systemContent += `\nBạn đã index: ${projectStats.totalFiles} files, ${projectStats.totalChunks} code chunks`
    systemContent += `\nRepositories: ${repoSources}`
    systemContent += `\nNgôn ngữ chính: ${topLangs}`
    systemContent += `\nBạn CÓ khả năng đọc và phân tích code của dự án này. Khi user hỏi về code, hãy trả lời dựa trên context được cung cấp bên dưới.`

    if (projectStats.repositories.length > 1) {
      systemContent += `\nĐÂY LÀ DỰ ÁN MULTI-REPO (${projectStats.repositories.length} repositories). Mỗi code chunk được gắn nhãn [repo-name]. Khi trả lời, hãy chỉ rõ chunk thuộc repo nào.`
    }
  }

  if (directoryTree) {
    systemContent += `\n\nCấu trúc thư mục:\n\`\`\`\n${directoryTree.slice(0, 3000)}\n\`\`\``
  }

  if (memoryContext) {
    systemContent += `\n\n=== MEMORY (bộ nhớ dài hạn) ===\n${memoryContext}`
  }

  if (contextSection) {
    systemContent += `\n\n=== CONTEXT TỪ SOURCE CODE ===\n${contextSection}`
  } else if (projectStats && projectStats.totalChunks > 0) {
    // Fallback: no relevant chunks found for this query, but brain has data
    systemContent += `\n\n=== CONTEXT TỪ SOURCE CODE ===`
    systemContent += `\n(Không tìm thấy code chunk liên quan trực tiếp đến câu hỏi này.`
    systemContent += ` Bạn vẫn có thể trả lời dựa trên cấu trúc thư mục và thông tin tổng quan ở trên.`
    systemContent += ` Yêu cầu user hỏi cụ thể hơn về file hoặc function cần tìm hiểu để nhận được context chính xác hơn.)`
  }

  if (externalContext) {
    systemContent += `\n\n=== EXTERNAL CONTEXT (TỰ ĐỘNG FETCH TỪ URL TRONG TIN NHẮN) ===`
    systemContent += `\nQUAN TRỌNG — QUY TẮC BẮT BUỘC:`
    systemContent += `\n1. Dữ liệu bên dưới đã được hệ thống Cortex TỰ ĐỘNG fetch thành công từ các nguồn bên ngoài (Jira, Confluence, GitHub, Web Search, v.v.).`
    systemContent += `\n2. Bạn KHÔNG cần truy cập URL — dữ liệu đã có sẵn ngay bên dưới.`
    systemContent += `\n3. TUYỆT ĐỐI KHÔNG ĐƯỢC nói "tôi không thể truy cập URL". Bạn ĐÃ CÓ dữ liệu.`
    systemContent += `\n4. Hãy phân tích nội dung bên dưới và trả lời trực tiếp dựa trên dữ liệu này.`
    systemContent += `\n\n${externalContext}`
  }

  const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]

  // Add conversation history (last 10 messages for context window management)
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10)
    messages.push(...recent)
  }

  // Add current user query
  messages.push({ role: 'user', content: query })

  return { messages, compressionStats }
}

/**
 * Stream chat completion from LLM proxy with automatic model rotation
 *
 * Strategy:
 * 1. Try current best model
 * 2. On retryable error (502/503/429/500), rotate to next model and retry
 * 3. On auth error (401/403) with auto-rotation enabled, mark model as auth-failed and rotate
 * 4. On auth error without auto-rotation, throw with helpful message suggesting model switch
 * 5. Up to MAX_RETRIES attempts across different models
 * 6. On all-exhausted, refresh model list and try once more
 */
const MAX_RETRIES = 7

export async function streamChatCompletion(
  messages: ChatMessage[],
  conversationId: string,
  window: BrowserWindow | null,
  abortSignal?: AbortSignal,
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<StreamResult> {
  let lastError: Error | null = null
  let refreshedOnce = false

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const model = await getCurrentModel()

    try {
      const result = await _streamWithModel(model, messages, conversationId, window, abortSignal, tools)
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Extract HTTP status from error message
      const statusMatch = lastError.message.match(/LLM API error (\d+)/)
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0

      if (isRetryableError(status)) {
        console.warn(`[LLM] Model "${model}" failed (${status}), rotating...`)

        // Notify frontend about rotation
        _mainWindow?.webContents.send('llm:modelRotated', {
          fromModel: model,
          reason: `HTTP ${status}`,
          type: 'server_error'
        })

        const hasNext = rotateToNextModel()
        if (!hasNext && !refreshedOnce) {
          // All models exhausted — refresh the list and try again
          console.log('[LLM] All models exhausted, refreshing list...')
          refreshedOnce = true
          await fetchAvailableModels()
          continue
        }

        if (!hasNext) {
          // Already refreshed, still failing — give up
          break
        }

        continue
      }

      if (isAuthError(status)) {
        // Mark this model as auth-failed for this session
        authFailedModels.add(model)
        console.warn(`[LLM] Model "${model}" auth failed (${status}), marking as unavailable`)

        if (getAutoRotation()) {
          // Auto-rotation enabled — try next model
          _mainWindow?.webContents.send('llm:modelRotated', {
            fromModel: model,
            reason: status === 401 ? 'Token hết hạn' : 'Không có quyền truy cập',
            type: 'auth_error'
          })

          const hasNext = rotateToNextModel()
          if (!hasNext && !refreshedOnce) {
            console.log('[LLM] All models auth-failed, refreshing list...')
            refreshedOnce = true
            authFailedModels.clear() // Clear on refresh — models may have recovered
            await fetchAvailableModels()
            continue
          }

          if (!hasNext) {
            // All models exhausted even after refresh
            throw new Error(
              `Tất cả models đều gặp lỗi xác thực. Vui lòng kiểm tra API key trong Cài đặt > API Proxy.`
            )
          }

          continue
        } else {
          // Auto-rotation disabled — throw with helpful message
          const modelList = cachedModels
            .filter(m => !authFailedModels.has(m.id))
            .slice(0, 3)
            .map(m => m.id)
            .join(', ')
          throw new Error(
            `Model "${model}" gặp lỗi xác thực (${status}). ` +
            `Hãy đổi sang model khác: ${modelList || 'không có model khả dụng'}. ` +
            `Hoặc bật Auto-rotation trong cài đặt để tự động chuyển.`
          )
        }
      }

      // Non-retryable error (e.g., 400 bad request, abort) — don't rotate
      throw lastError
    }
  }

  throw lastError || new Error('All available models failed')
}

/**
 * Internal: Stream with a specific model
 */
async function _streamWithModel(
  model: string,
  messages: ChatMessage[],
  conversationId: string,
  window: BrowserWindow | null,
  abortSignal?: AbortSignal,
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<StreamResult> {
  console.log(`[LLM] Using model: ${model}`)

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.3,
    max_tokens: 4096
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${getProxyUrlSafe()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getProxyKeySafe()}`
    },
    body: JSON.stringify(body),
    signal: abortSignal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error ${response.status}: ${errorText}`)
  }

  if (!response.body) {
    throw new Error('No response body for streaming')
  }

  let fullContent = ''
  let usageData: StreamResult['usage'] = null
  let finishReason: StreamResult['finishReason'] = 'unknown'
  const toolCallsAccumulator = new Map<number, { id: string; name: string; arguments: string }>()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)

          if (parsed.usage) {
            usageData = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0
            }
          }

          const choice = parsed.choices?.[0]
          if (!choice) continue

          if (choice.finish_reason) {
            finishReason = choice.finish_reason === 'tool_calls' ? 'tool_calls'
              : choice.finish_reason === 'stop' ? 'stop'
              : choice.finish_reason === 'length' ? 'length'
              : 'unknown'
          }

          const delta = choice.delta
          if (!delta) continue

          if (delta.content) {
            fullContent += delta.content
            window?.webContents.send('chat:stream', {
              conversationId,
              content: fullContent,
              done: false
            })
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsAccumulator.has(idx)) {
                toolCallsAccumulator.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: ''
                })
              }
              const acc = toolCallsAccumulator.get(idx)!
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) acc.arguments += tc.function.arguments
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const toolCalls: ToolCall[] = Array.from(toolCallsAccumulator.values()).map(tc => ({
    id: tc.id,
    type: 'function' as const,
    function: { name: tc.name, arguments: tc.arguments }
  }))

  if (toolCalls.length > 0) {
    finishReason = 'tool_calls'
  }

  if (finishReason !== 'tool_calls') {
    window?.webContents.send('chat:stream', {
      conversationId,
      content: fullContent,
      done: true
    })
  }

  return { content: fullContent, model, toolCalls, finishReason, usage: usageData }
}
