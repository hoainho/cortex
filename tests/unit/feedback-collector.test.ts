const { mockRun, mockGet, mockAll } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn().mockReturnValue([])
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-1234')
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/cortex-test') }
}))

vi.mock('better-sqlite3', () => {
  const MockDatabase = vi.fn(function (this: any) {
    this.pragma = vi.fn()
    this.exec = vi.fn()
    this.prepare = vi.fn().mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    this.close = vi.fn()
    this.transaction = vi.fn((fn: Function) => fn)
  })
  return { default: MockDatabase }
})

import {
  recordFeedbackSignal,
  convertSignalsToTrainingPairs,
  getFeedbackStats,
  getRecentFeedback
} from '../../electron/services/feedback-collector'

describe('FeedbackCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordFeedbackSignal', () => {
    it('inserts a feedback signal into the database', () => {
      recordFeedbackSignal({
        projectId: 'proj-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        signalType: 'thumbs_up',
        query: 'how does auth work?',
        chunkIds: ['chunk-1', 'chunk-2']
      })

      expect(mockRun).toHaveBeenCalledWith(
        'test-uuid-1234',
        'proj-1',
        'msg-1',
        'conv-1',
        'thumbs_up',
        'how does auth work?',
        '["chunk-1","chunk-2"]',
        '{}'
      )
    })

    it('handles metadata parameter', () => {
      recordFeedbackSignal({
        projectId: 'proj-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        signalType: 'copy',
        query: 'test',
        chunkIds: [],
        metadata: { source: 'clipboard' }
      })

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'msg-1',
        'conv-1',
        'copy',
        'test',
        '[]',
        '{"source":"clipboard"}'
      )
    })

    it('does not throw on database errors', () => {
      mockRun.mockImplementationOnce(() => { throw new Error('DB error') })
      expect(() => {
        recordFeedbackSignal({
          projectId: 'proj-1',
          messageId: 'msg-1',
          conversationId: 'conv-1',
          signalType: 'thumbs_down',
          query: 'test',
          chunkIds: []
        })
      }).not.toThrow()
    })
  })

  describe('convertSignalsToTrainingPairs', () => {
    it('returns 0 when no signals exist', () => {
      mockAll.mockReturnValueOnce([])
      const result = convertSignalsToTrainingPairs('proj-1')
      expect(result.converted).toBe(0)
    })

    it('converts thumbs_up signals to positive training pairs', () => {
      mockAll.mockReturnValueOnce([
        {
          id: 'sig-1',
          project_id: 'proj-1',
          signal_type: 'thumbs_up',
          query: 'auth question',
          chunk_ids: '["chunk-1"]',
          metadata: '{}'
        }
      ])

      const result = convertSignalsToTrainingPairs('proj-1')
      expect(result.converted).toBe(1)
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'auth question',
        'chunk-1',
        1.0,
        'thumbs_up',
        1.0
      )
    })

    it('converts thumbs_down signals to negative training pairs', () => {
      mockAll.mockReturnValueOnce([
        {
          id: 'sig-2',
          project_id: 'proj-1',
          signal_type: 'thumbs_down',
          query: 'bad query',
          chunk_ids: '["chunk-2"]',
          metadata: '{}'
        }
      ])

      const result = convertSignalsToTrainingPairs('proj-1')
      expect(result.converted).toBe(1)
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'bad query',
        'chunk-2',
        -1.0,
        'thumbs_down',
        1.0
      )
    })

    it('skips signals with no chunk_ids', () => {
      mockAll.mockReturnValueOnce([
        { id: 'sig-3', project_id: 'proj-1', signal_type: 'thumbs_up', query: 'q', chunk_ids: '[]', metadata: '{}' }
      ])

      const result = convertSignalsToTrainingPairs('proj-1')
      expect(result.converted).toBe(0)
    })
  })

  describe('getFeedbackStats', () => {
    it('returns correct counts', () => {
      mockGet.mockReturnValueOnce({ count: 10 }).mockReturnValueOnce({ count: 5 })
      mockAll.mockReturnValueOnce([{ id: '1' }, { id: '2' }]).mockReturnValueOnce([{ id: '3' }])

      const stats = getFeedbackStats('proj-1')
      expect(stats.totalFeedback).toBe(10)
      expect(stats.totalTrainingPairs).toBe(5)
      expect(stats.positiveCount).toBe(2)
      expect(stats.negativeCount).toBe(1)
    })

    it('handles zero feedback', () => {
      mockGet.mockReturnValueOnce({ count: 0 }).mockReturnValueOnce({ count: 0 })
      mockAll.mockReturnValueOnce([]).mockReturnValueOnce([])

      const stats = getFeedbackStats('proj-1')
      expect(stats.totalFeedback).toBe(0)
      expect(stats.positiveCount).toBe(0)
    })
  })

  describe('getRecentFeedback', () => {
    it('returns signals from database', () => {
      const signals = [{ id: 'sig-1', signal_type: 'thumbs_up' }]
      mockAll.mockReturnValueOnce(signals)

      const result = getRecentFeedback('proj-1', 10)
      expect(result).toEqual(signals)
    })
  })
})
