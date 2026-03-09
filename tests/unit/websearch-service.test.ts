import { detectWebSearchTrigger, webResultsToChunkContent } from '../../electron/services/websearch-service'

describe('websearch-service', () => {
  describe('detectWebSearchTrigger', () => {
    it('detects explicit search: prefix', () => {
      const result = detectWebSearchTrigger('search: react hooks best practices')
      expect(result.triggered).toBe(true)
      expect(result.searchQuery).toBe('react hooks best practices')
      expect(result.reason).toBe('explicit_prefix')
    })

    it('detects explicit web: prefix', () => {
      const result = detectWebSearchTrigger('web: how to use zustand')
      expect(result.triggered).toBe(true)
      expect(result.searchQuery).toBe('how to use zustand')
      expect(result.reason).toBe('explicit_prefix')
    })

    it('is case insensitive for prefix', () => {
      const result = detectWebSearchTrigger('Search: NextJS routing')
      expect(result.triggered).toBe(true)
      expect(result.reason).toBe('explicit_prefix')
    })

    it('detects error pattern (TypeError)', () => {
      const result = detectWebSearchTrigger('TypeError: Cannot read property of undefined')
      expect(result.triggered).toBe(true)
      expect(result.reason).toBe('error_pattern')
    })

    it('detects error pattern (stack trace)', () => {
      const result = detectWebSearchTrigger('at Object.<anonymous> (/src/index.ts:10:5)')
      expect(result.triggered).toBe(true)
      expect(result.reason).toBe('error_pattern')
    })

    it('detects error pattern (npm ERR)', () => {
      const result = detectWebSearchTrigger('npm ERR! code ENOENT')
      expect(result.triggered).toBe(true)
      expect(result.reason).toBe('error_pattern')
    })

    it('returns no trigger for normal query', () => {
      const result = detectWebSearchTrigger('How does the auth middleware work?')
      expect(result.triggered).toBe(false)
      expect(result.reason).toBe('none')
    })
  })

  describe('webResultsToChunkContent', () => {
    it('formats results', () => {
      const output = webResultsToChunkContent([
        { title: 'Result 1', url: 'https://example.com', snippet: 'Some text' }
      ])
      expect(output).toContain('Result 1')
      expect(output).toContain('https://example.com')
      expect(output).toContain('Some text')
    })

    it('returns empty string for empty array', () => {
      expect(webResultsToChunkContent([])).toBe('')
    })

    it('formats multiple results with numbering', () => {
      const output = webResultsToChunkContent([
        { title: 'First', url: 'https://a.com', snippet: 'A' },
        { title: 'Second', url: 'https://b.com', snippet: 'B' }
      ])
      expect(output).toContain('[1]')
      expect(output).toContain('[2]')
    })
  })
})
