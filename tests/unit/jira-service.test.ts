import {
  adfToPlainText,
  issueToChunkContent,
  sprintToChunkContent,
  type JiraIssue,
  type JiraSprint
} from '../../electron/services/jira-service'

describe('adfToPlainText', () => {
  it('returns empty string for null/undefined', () => {
    expect(adfToPlainText(null)).toBe('')
    expect(adfToPlainText(undefined)).toBe('')
  })

  it('returns string input as-is', () => {
    expect(adfToPlainText('plain text')).toBe('plain text')
  })

  it('extracts text from simple paragraph', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }]
        }
      ]
    }
    expect(adfToPlainText(adf)).toBe('Hello world')
  })

  it('extracts text from multiple paragraphs', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }]
        }
      ]
    }
    const result = adfToPlainText(adf)
    expect(result).toContain('First paragraph')
    expect(result).toContain('Second paragraph')
  })

  it('extracts text from heading', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'My Heading' }]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain('My Heading')
  })

  it('extracts text from bullet list', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }
              ]
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }
              ]
            }
          ]
        }
      ]
    }
    const result = adfToPlainText(adf)
    expect(result).toContain('Item one')
    expect(result).toContain('Item two')
  })

  it('extracts text from code block', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: 'const x = 1' }]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain('const x = 1')
  })

  it('handles hard breaks', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Line one' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Line two' }
          ]
        }
      ]
    }
    const result = adfToPlainText(adf)
    expect(result).toContain('Line one')
    expect(result).toContain('Line two')
  })

  it('handles mentions', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Assigned to ' },
            { type: 'mention', attrs: { text: 'John Doe' } }
          ]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain('@John Doe')
  })

  it('handles emoji', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'emoji', attrs: { shortName: ':thumbsup:' } }
          ]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain(':thumbsup:')
  })

  it('handles inline cards', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'inlineCard', attrs: { url: 'https://example.com' } }
          ]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain('https://example.com')
  })

  it('handles media nodes', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          content: [
            { type: 'media', attrs: { type: 'file', id: '123' } }
          ]
        }
      ]
    }
    expect(adfToPlainText(adf)).toContain('[media]')
  })

  it('handles tables', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] }
              ]
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'foo' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bar' }] }] }
              ]
            }
          ]
        }
      ]
    }
    const result = adfToPlainText(adf)
    expect(result).toContain('Name')
    expect(result).toContain('Value')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
  })

  it('handles complex nested ADF', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Bug Report' }]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Steps to reproduce:' }
          ]
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open app' }] }]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click button' }] }]
            }
          ]
        },
        {
          type: 'codeBlock',
          attrs: { language: 'ts' },
          content: [{ type: 'text', text: 'throw new Error("crash")' }]
        }
      ]
    }
    const result = adfToPlainText(adf)
    expect(result).toContain('Bug Report')
    expect(result).toContain('Steps to reproduce')
    expect(result).toContain('Open app')
    expect(result).toContain('Click button')
    expect(result).toContain('throw new Error("crash")')
  })
})

describe('issueToChunkContent', () => {
  const baseIssue: JiraIssue = {
    key: 'PROJ-123',
    summary: 'Fix login bug',
    description: 'Users cannot login when using SSO',
    status: 'In Progress',
    statusCategory: 'In Progress',
    assignee: 'Jane Doe',
    reporter: 'John Smith',
    priority: 'High',
    labels: ['bug', 'auth'],
    issueType: 'Bug',
    sprintName: 'Sprint 5',
    epicKey: 'PROJ-100',
    epicName: 'Authentication Epic',
    comments: [
      { author: 'Alice', body: 'I can reproduce this', created: '2026-01-15T10:00:00Z' },
      { author: 'Bob', body: 'Fix deployed', created: '2026-01-16T14:00:00Z' }
    ],
    created: '2026-01-14T09:00:00Z',
    updated: '2026-01-16T14:30:00Z',
    resolution: 'Fixed',
    storyPoints: 3
  }

  it('includes issue key and summary', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('[PROJ-123] Fix login bug')
  })

  it('includes type, status, priority', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('Type: Bug')
    expect(result).toContain('Status: In Progress')
    expect(result).toContain('Priority: High')
  })

  it('includes assignee and reporter', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('Assignee: Jane Doe')
    expect(result).toContain('Reporter: John Smith')
  })

  it('includes labels', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('Labels: bug, auth')
  })

  it('includes sprint and epic', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('Sprint: Sprint 5')
    expect(result).toContain('Epic: Authentication Epic (PROJ-100)')
  })

  it('includes story points and resolution', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('Story Points: 3')
    expect(result).toContain('Resolution: Fixed')
  })

  it('includes description', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('--- Description ---')
    expect(result).toContain('Users cannot login when using SSO')
  })

  it('includes comments', () => {
    const result = issueToChunkContent(baseIssue)
    expect(result).toContain('--- Comments ---')
    expect(result).toContain('Alice')
    expect(result).toContain('I can reproduce this')
    expect(result).toContain('Bob')
    expect(result).toContain('Fix deployed')
  })

  it('handles minimal issue with missing optional fields', () => {
    const minimal: JiraIssue = {
      key: 'MIN-1',
      summary: 'Minimal task',
      description: '',
      status: 'Open',
      statusCategory: 'To Do',
      assignee: null,
      reporter: null,
      priority: 'None',
      labels: [],
      issueType: 'Task',
      sprintName: null,
      epicKey: null,
      epicName: null,
      comments: [],
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
      resolution: null,
      storyPoints: null
    }
    const result = issueToChunkContent(minimal)
    expect(result).toContain('[MIN-1] Minimal task')
    expect(result).not.toContain('Assignee:')
    expect(result).not.toContain('Sprint:')
    expect(result).not.toContain('Epic:')
    expect(result).not.toContain('Story Points:')
    expect(result).not.toContain('Resolution:')
    expect(result).not.toContain('--- Description ---')
    expect(result).not.toContain('--- Comments ---')
  })
})

describe('sprintToChunkContent', () => {
  const sprint: JiraSprint = {
    id: 42,
    name: 'Sprint 5',
    state: 'active',
    startDate: '2026-01-13T00:00:00Z',
    endDate: '2026-01-27T00:00:00Z',
    completeDate: null,
    goal: 'Ship auth features'
  }

  const issues: JiraIssue[] = [
    {
      key: 'P-1', summary: 'Login page', description: '', status: 'Done',
      statusCategory: 'Done', assignee: null, reporter: null, priority: 'High',
      labels: [], issueType: 'Story', sprintName: 'Sprint 5',
      epicKey: null, epicName: null, comments: [],
      created: '', updated: '', resolution: null, storyPoints: null
    },
    {
      key: 'P-2', summary: 'SSO integration', description: '', status: 'In Progress',
      statusCategory: 'In Progress', assignee: null, reporter: null, priority: 'High',
      labels: [], issueType: 'Story', sprintName: 'Sprint 5',
      epicKey: null, epicName: null, comments: [],
      created: '', updated: '', resolution: null, storyPoints: null
    },
    {
      key: 'P-3', summary: 'Fix logout bug', description: '', status: 'Done',
      statusCategory: 'Done', assignee: null, reporter: null, priority: 'Medium',
      labels: [], issueType: 'Bug', sprintName: 'Sprint 5',
      epicKey: null, epicName: null, comments: [],
      created: '', updated: '', resolution: null, storyPoints: null
    }
  ]

  it('includes sprint name and state', () => {
    const result = sprintToChunkContent(sprint, issues)
    expect(result).toContain('Sprint: Sprint 5')
    expect(result).toContain('State: active')
  })

  it('includes sprint goal', () => {
    const result = sprintToChunkContent(sprint, issues)
    expect(result).toContain('Goal: Ship auth features')
  })

  it('includes sprint dates', () => {
    const result = sprintToChunkContent(sprint, issues)
    expect(result).toContain('Start:')
    expect(result).toContain('End:')
  })

  it('includes issue count', () => {
    const result = sprintToChunkContent(sprint, issues)
    expect(result).toContain('Issues: 3')
  })

  it('groups issues by status', () => {
    const result = sprintToChunkContent(sprint, issues)
    expect(result).toContain('[Done]')
    expect(result).toContain('[In Progress]')
    expect(result).toContain('P-1: Login page')
    expect(result).toContain('P-2: SSO integration')
    expect(result).toContain('P-3: Fix logout bug')
  })

  it('handles empty sprint', () => {
    const result = sprintToChunkContent(sprint, [])
    expect(result).toContain('Issues: 0')
  })
})
