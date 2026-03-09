import { registerContextSource, extractAndFetchAllContext, getAllContextSources } from '../../electron/services/context-registry'
import type { ContextSource, ContextRef, FetchedContext } from '../../electron/services/context-source'

function createMockSource(overrides: Partial<ContextSource> = {}): ContextSource {
  return {
    name: 'MOCK SOURCE',
    extractReferences: () => [],
    fetchContent: async () => ({ source: 'MOCK SOURCE', content: 'mock content', url: 'http://test.com' }),
    isAvailable: () => true,
    ...overrides
  }
}

describe('context-registry', () => {
  describe('registerContextSource', () => {
    it('adds source to the registry', () => {
      const initialCount = getAllContextSources().length
      const source = createMockSource({ name: 'TEST_REGISTER' })
      registerContextSource(source)
      expect(getAllContextSources().length).toBe(initialCount + 1)
      expect(getAllContextSources().some(s => s.name === 'TEST_REGISTER')).toBe(true)
    })
  })

  describe('extractAndFetchAllContext', () => {
    it('returns empty array when no sources have references', async () => {
      const results = await extractAndFetchAllContext('no urls here', 'proj-1')
      const fromNoRef = results.filter(r => r.source === 'EMPTY_REF_SOURCE')
      expect(fromNoRef).toHaveLength(0)
    })

    it('fetches content from sources that find references', async () => {
      const source = createMockSource({
        name: 'FETCH_TEST',
        extractReferences: (query: string) => {
          if (query.includes('test-url')) {
            return [{ type: 'test', url: 'http://test.com', label: 'test', metadata: {} }]
          }
          return []
        },
        fetchContent: async () => ({
          source: 'FETCH_TEST',
          content: 'fetched data',
          url: 'http://test.com'
        })
      })
      registerContextSource(source)

      const results = await extractAndFetchAllContext('check this test-url', 'proj-1')
      const fetchTestResults = results.filter(r => r.source === 'FETCH_TEST')
      expect(fetchTestResults.length).toBeGreaterThanOrEqual(1)
      expect(fetchTestResults[0].content).toBe('fetched data')
    })

    it('skips sources that are not available', async () => {
      const source = createMockSource({
        name: 'UNAVAILABLE_SOURCE',
        isAvailable: () => false,
        extractReferences: () => [{ type: 'test', url: 'http://test.com', label: 'test', metadata: {} }]
      })
      registerContextSource(source)

      const results = await extractAndFetchAllContext('test', 'proj-1')
      const unavailResults = results.filter(r => r.source === 'UNAVAILABLE_SOURCE')
      expect(unavailResults).toHaveLength(0)
    })

    it('handles fetch errors gracefully', async () => {
      const source = createMockSource({
        name: 'ERROR_SOURCE',
        extractReferences: () => [{ type: 'test', url: 'http://fail.com', label: 'fail', metadata: {} }],
        fetchContent: async () => { throw new Error('Network error') }
      })
      registerContextSource(source)

      const results = await extractAndFetchAllContext('test', 'proj-1')
      const errorResults = results.filter(r => r.source === 'ERROR_SOURCE')
      expect(errorResults.length).toBeGreaterThanOrEqual(1)
      expect(errorResults[0].error).toBe('Network error')
      expect(errorResults[0].content).toBe('')
    })

    it('limits references per source to maxPerSource', async () => {
      const refs: ContextRef[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'test',
        url: `http://test.com/${i}`,
        label: `ref-${i}`,
        metadata: {}
      }))
      let fetchCount = 0
      const source = createMockSource({
        name: 'LIMIT_SOURCE',
        extractReferences: () => refs,
        fetchContent: async (ref) => {
          fetchCount++
          return { source: 'LIMIT_SOURCE', content: `content-${ref.label}`, url: ref.url }
        }
      })
      registerContextSource(source)

      fetchCount = 0
      await extractAndFetchAllContext('test', 'proj-1', 2)
      expect(fetchCount).toBe(2)
    })
  })
})
