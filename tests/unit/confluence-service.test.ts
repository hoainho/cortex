import {
  extractTextFromStorage,
  pageToChunkContent,
  type ConfluencePage
} from '../../electron/services/confluence-service'

describe('extractTextFromStorage', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(extractTextFromStorage('')).toBe('')
    expect(extractTextFromStorage(null as any)).toBe('')
  })

  it('extracts text from simple paragraphs', () => {
    const html = '<p>Hello world</p>'
    expect(extractTextFromStorage(html)).toBe('Hello world')
  })

  it('extracts text from multiple paragraphs', () => {
    const html = '<p>First paragraph</p><p>Second paragraph</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('First paragraph')
    expect(result).toContain('Second paragraph')
  })

  it('extracts text from headings', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><p>Content</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Title')
    expect(result).toContain('Subtitle')
    expect(result).toContain('Content')
  })

  it('extracts text from unordered lists', () => {
    const html = '<ul><li>Item A</li><li>Item B</li><li>Item C</li></ul>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Item A')
    expect(result).toContain('Item B')
    expect(result).toContain('Item C')
  })

  it('extracts text from ordered lists', () => {
    const html = '<ol><li>Step 1</li><li>Step 2</li></ol>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Step 1')
    expect(result).toContain('Step 2')
  })

  it('extracts text from tables', () => {
    const html = '<table><tr><th>Name</th><th>Value</th></tr><tr><td>foo</td><td>bar</td></tr></table>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Name')
    expect(result).toContain('Value')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
  })

  it('handles br tags', () => {
    const html = 'Line one<br/>Line two<br>Line three'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Line one')
    expect(result).toContain('Line two')
    expect(result).toContain('Line three')
  })

  it('extracts code from Confluence code macro', () => {
    const html = '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">javascript</ac:parameter><ac:plain-text-body>const x = 1</ac:plain-text-body></ac:structured-macro>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('const x = 1')
  })

  it('extracts text from info/note/warning panels', () => {
    const html = '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Important note here</p></ac:rich-text-body></ac:structured-macro>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('info')
    expect(result).toContain('Important note here')
  })

  it('handles CDATA sections', () => {
    const html = '<p><![CDATA[Some CDATA content]]></p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Some CDATA content')
  })

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('A & B < C > D "E" \'F\'')
  })

  it('decodes &nbsp; to space', () => {
    const html = '<p>word&nbsp;word</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('word word')
  })

  it('decodes numeric entities', () => {
    const html = '<p>&#65;&#66;&#67;</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('ABC')
  })

  it('decodes hex entities', () => {
    const html = '<p>&#x41;&#x42;&#x43;</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('ABC')
  })

  it('strips Confluence-specific ac: and ri: tags', () => {
    const html = '<p>Before <ac:link><ri:page ri:content-title="Other Page" /></ac:link> After</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Before')
    expect(result).toContain('After')
    expect(result).not.toContain('ac:link')
    expect(result).not.toContain('ri:page')
  })

  it('keeps link text', () => {
    const html = '<p>Visit <a href="https://example.com">Example Site</a> now</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Example Site')
  })

  it('handles images with alt text', () => {
    const html = '<p>See <img alt="diagram" src="x.png" /> here</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('[diagram]')
  })

  it('handles images without alt text', () => {
    const html = '<p>See <img src="x.png" /> here</p>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('[image]')
  })

  it('strips all remaining HTML tags', () => {
    const html = '<div class="special"><span style="color:red">Red text</span></div>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Red text')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('collapses excessive whitespace', () => {
    const html = '<p>  Word   one   </p>\n\n\n\n\n<p>  Word   two  </p>'
    const result = extractTextFromStorage(html)
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/)
  })

  it('handles complex nested XHTML', () => {
    const html = `
      <h1>Architecture Guide</h1>
      <p>This document describes the system architecture.</p>
      <h2>Components</h2>
      <ul>
        <li>Frontend — React application</li>
        <li>Backend — Node.js API</li>
      </ul>
      <ac:structured-macro ac:name="code">
        <ac:parameter ac:name="language">typescript</ac:parameter>
        <ac:plain-text-body>export function init() { return true }</ac:plain-text-body>
      </ac:structured-macro>
      <table>
        <tr><th>Service</th><th>Port</th></tr>
        <tr><td>API</td><td>3000</td></tr>
        <tr><td>DB</td><td>5432</td></tr>
      </table>
    `
    const result = extractTextFromStorage(html)
    expect(result).toContain('Architecture Guide')
    expect(result).toContain('system architecture')
    expect(result).toContain('Frontend')
    expect(result).toContain('Backend')
    expect(result).toContain('export function init()')
    expect(result).toContain('API')
    expect(result).toContain('3000')
  })

  it('handles expand macro', () => {
    const html = '<ac:structured-macro ac:name="expand"><ac:rich-text-body><p>Hidden content</p></ac:rich-text-body></ac:structured-macro>'
    const result = extractTextFromStorage(html)
    expect(result).toContain('Hidden content')
  })
})

describe('pageToChunkContent', () => {
  const basePage: ConfluencePage = {
    id: 'page-123',
    spaceId: 'space-1',
    spaceKey: 'DEV',
    title: 'Getting Started Guide',
    status: 'current',
    body: 'This is the getting started guide for the project.',
    labels: ['onboarding', 'guide'],
    parentId: 'page-100',
    parentTitle: 'Documentation',
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    authorName: 'Jane Doe',
    webUrl: 'https://mysite.atlassian.net/wiki/spaces/DEV/pages/123'
  }

  it('includes page title as heading', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('# Getting Started Guide')
  })

  it('includes space key', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('Space: DEV')
  })

  it('includes labels', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('Labels: onboarding, guide')
  })

  it('includes author name', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('Author: Jane Doe')
  })

  it('includes updated timestamp', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('Updated:')
  })

  it('includes parent title', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('Parent: Documentation')
  })

  it('includes body content', () => {
    const result = pageToChunkContent(basePage)
    expect(result).toContain('This is the getting started guide for the project.')
  })

  it('handles minimal page with missing optional fields', () => {
    const minimal: ConfluencePage = {
      id: 'page-1',
      spaceId: '',
      spaceKey: '',
      title: 'Untitled',
      status: 'current',
      body: '',
      labels: [],
      parentId: null,
      parentTitle: null,
      version: 1,
      createdAt: '',
      updatedAt: '',
      authorName: null,
      webUrl: null
    }
    const result = pageToChunkContent(minimal)
    expect(result).toContain('# Untitled')
    expect(result).not.toContain('Space:')
    expect(result).not.toContain('Labels:')
    expect(result).not.toContain('Author:')
    expect(result).not.toContain('Parent:')
    expect(result).not.toContain('---')
  })
})
