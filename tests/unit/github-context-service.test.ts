import { GitHubContextSource } from '../../electron/services/github-context-source'

describe('GitHubContextSource', () => {
  const source = new GitHubContextSource()

  describe('extractReferences', () => {
    it('extracts issue URL', () => {
      const refs = source.extractReferences('Check this https://github.com/facebook/react/issues/123')
      expect(refs).toHaveLength(1)
      expect(refs[0].type).toBe('github-issue')
      expect(refs[0].metadata.owner).toBe('facebook')
      expect(refs[0].metadata.repo).toBe('react')
      expect(refs[0].metadata.number).toBe('123')
    })

    it('extracts PR URL', () => {
      const refs = source.extractReferences('Review https://github.com/vercel/next.js/pull/456')
      expect(refs).toHaveLength(1)
      expect(refs[0].type).toBe('github-pr')
      expect(refs[0].metadata.owner).toBe('vercel')
      expect(refs[0].metadata.repo).toBe('next.js')
      expect(refs[0].metadata.number).toBe('456')
    })

    it('extracts multiple URLs', () => {
      const refs = source.extractReferences(
        'See https://github.com/a/b/issues/1 and https://github.com/c/d/pull/2'
      )
      expect(refs).toHaveLength(2)
      expect(refs[0].type).toBe('github-issue')
      expect(refs[1].type).toBe('github-pr')
    })

    it('ignores non-GitHub URLs', () => {
      const refs = source.extractReferences(
        'Check https://jira.atlassian.net/browse/PROJ-123 and https://example.com'
      )
      expect(refs).toHaveLength(0)
    })

    it('handles URL with trailing text', () => {
      const refs = source.extractReferences(
        'Link: https://github.com/org/repo/issues/99 is important'
      )
      expect(refs).toHaveLength(1)
      expect(refs[0].metadata.number).toBe('99')
    })

    it('returns correct labels', () => {
      const refs = source.extractReferences('https://github.com/owner/repo/issues/42')
      expect(refs[0].label).toBe('owner/repo#42')
    })

    it('handles consecutive calls without state leakage', () => {
      const refs1 = source.extractReferences('https://github.com/a/b/issues/1')
      const refs2 = source.extractReferences('https://github.com/c/d/pull/2')
      expect(refs1).toHaveLength(1)
      expect(refs2).toHaveLength(1)
      expect(refs1[0].metadata.owner).toBe('a')
      expect(refs2[0].metadata.owner).toBe('c')
    })
  })

  describe('isAvailable', () => {
    it('always returns true', () => {
      expect(source.isAvailable('any-project')).toBe(true)
    })
  })
})
