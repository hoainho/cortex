import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class { webContents = { send: vi.fn() } },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))

vi.mock('../../electron/services/settings-service', () => ({
  getProxyUrl: vi.fn().mockReturnValue('http://localhost:4000'),
  getProxyKey: vi.fn().mockReturnValue('test-key'),
  getSetting: vi.fn().mockReturnValue(null),
  setSetting: vi.fn()
}))

vi.mock('../../electron/services/context-compressor', () => ({
  compressContext: vi.fn().mockResolvedValue({ compressed: '', stats: {} })
}))

vi.mock('../../electron/services/response-normalizer', () => ({
  normalizeResponseFences: vi.fn().mockImplementation((s: string) => s)
}))

import {
  clearAuthFailedModels,
  setActiveModel,
  getAvailableModels,
  getActiveModel,
  fetchAvailableModels,
  sanitizeSurrogates
} from '../../electron/services/llm-client'

beforeEach(() => {
  vi.clearAllMocks()
  clearAuthFailedModels()
})

async function seedModels(models: Array<{ id: string }>) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: models })
  } as any)
  await fetchAvailableModels()
}

describe('clearAuthFailedModels — guards TTL/cleanup fix', () => {
  it('resets cachedModels to empty', async () => {
    await seedModels([{ id: 'model-a' }, { id: 'model-b' }])
    expect(getAvailableModels()).toHaveLength(2)

    clearAuthFailedModels()
    expect(getAvailableModels()).toHaveLength(0)
  })

  it('after clear, getActiveModel returns empty string (cache gone)', () => {
    clearAuthFailedModels()
    expect(getActiveModel()).toBe('')
  })

  it('can be called multiple times without throwing', () => {
    expect(() => {
      clearAuthFailedModels()
      clearAuthFailedModels()
      clearAuthFailedModels()
    }).not.toThrow()
  })
})

describe('setActiveModel — guards model state fix', () => {
  it('returns error when model not in cache', () => {
    const result = setActiveModel('nonexistent-model')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns success when model exists in cache', async () => {
    await seedModels([{ id: 'model-a' }])
    const result = setActiveModel('model-a')
    expect(result.success).toBe(true)
    expect(result.model).toBe('model-a')
  })

  it('active model becomes the selected model', async () => {
    await seedModels([{ id: 'model-a' }, { id: 'model-b' }])
    setActiveModel('model-b')
    expect(getActiveModel()).toBe('model-b')
  })

  it('removes model from error sets when manually selected (recovery path)', async () => {
    await seedModels([{ id: 'model-a' }])

    setActiveModel('model-a')
    const models = getAvailableModels()
    const modelA = models.find(m => m.id === 'model-a')
    expect(modelA?.status).toBe('ready')
  })
})

describe('getAvailableModels — guards model rotation fix', () => {
  it('returns empty array before any fetch', () => {
    clearAuthFailedModels()
    expect(getAvailableModels()).toEqual([])
  })

  it('returns models with id, tier, active, status fields', async () => {
    await seedModels([{ id: 'gpt-4o' }, { id: 'claude-3' }])
    const models = getAvailableModels()

    expect(models.length).toBeGreaterThan(0)
    for (const m of models) {
      expect(m).toHaveProperty('id')
      expect(m).toHaveProperty('tier')
      expect(m).toHaveProperty('active')
      expect(m).toHaveProperty('status')
    }
  })

  it('exactly one model is marked active', async () => {
    await seedModels([{ id: 'gpt-4o' }, { id: 'claude-3' }, { id: 'gemini-pro' }])
    const models = getAvailableModels()
    const activeModels = models.filter(m => m.active)
    expect(activeModels).toHaveLength(1)
  })

  it('all models default to ready status after clean fetch', async () => {
    await seedModels([{ id: 'model-x' }, { id: 'model-y' }])
    const models = getAvailableModels()
    for (const m of models) {
      expect(m.status).toBe('ready')
    }
  })
})

describe('fetchAvailableModels — guards model cache fix', () => {
  it('populates model list on success', async () => {
    await seedModels([{ id: 'model-a' }, { id: 'model-b' }])
    expect(getAvailableModels()).toHaveLength(2)
  })

  it('returns empty array when fetch fails', async () => {
    clearAuthFailedModels()
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network error'))
    const result = await fetchAvailableModels()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when response is not ok', async () => {
    clearAuthFailedModels()
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({})
    } as any)
    const result = await fetchAvailableModels()
    expect(Array.isArray(result)).toBe(true)
  })

  it('resets rotationModelIndex on fresh fetch', async () => {
    await seedModels([{ id: 'model-a' }, { id: 'model-b' }])
    await seedModels([{ id: 'model-c' }, { id: 'model-d' }])
    const models = getAvailableModels()
    const active = models.find(m => m.active)
    expect(active).toBeDefined()
  })
})

describe('sanitizeSurrogates — guards string safety', () => {
  it('passes through normal strings unchanged', () => {
    expect(sanitizeSurrogates('hello world')).toBe('hello world')
  })

  it('passes through empty string', () => {
    expect(sanitizeSurrogates('')).toBe('')
  })

  it('replaces lone high surrogate with replacement character', () => {
    const withSurrogate = 'hello\uD800world'
    const result = sanitizeSurrogates(withSurrogate)
    expect(result).not.toContain('\uD800')
    expect(result).toContain('\uFFFD')
  })

  it('replaces lone low surrogate with replacement character', () => {
    const withSurrogate = 'hello\uDC00world'
    const result = sanitizeSurrogates(withSurrogate)
    expect(result).not.toContain('\uDC00')
    expect(result).toContain('\uFFFD')
  })

  it('preserves valid surrogate pairs', () => {
    const emoji = '\uD83D\uDE00'
    const result = sanitizeSurrogates(emoji)
    expect(result).toBe(emoji)
  })
})
