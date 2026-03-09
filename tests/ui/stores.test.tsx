import { useProjectStore } from '../../src/stores/projectStore'
import { useChatStore } from '../../src/stores/chatStore'
import { useUIStore } from '../../src/stores/uiStore'

// ==========================================
// projectStore
// ==========================================
describe('projectStore', () => {
  beforeEach(() => {
    // Reset to default state (includes MOCK_PROJECTS)
    useProjectStore.setState({
      projects: [
        {
          id: 'proj-1',
          name: 'E-Commerce Platform',
          brainName: 'Mercury',
          sourceType: 'github',
          sourcePath: 'https://github.com/acme/ecommerce-platform',
          brainStatus: 'ready',
          lastSyncAt: Date.now() - 3600000,
          createdAt: Date.now() - 86400000 * 30
        }
      ],
      activeProjectId: null
    })
  })

  it('has initial projects', () => {
    const { projects } = useProjectStore.getState()
    expect(projects.length).toBeGreaterThanOrEqual(1)
  })

  it('setActiveProject updates activeProjectId', () => {
    useProjectStore.getState().setActiveProject('proj-1')
    expect(useProjectStore.getState().activeProjectId).toBe('proj-1')
  })

  it('setActiveProject to null clears selection', () => {
    useProjectStore.getState().setActiveProject('proj-1')
    useProjectStore.getState().setActiveProject(null)
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('addProject adds to beginning and sets active', async () => {
    const before = useProjectStore.getState().projects.length
    await useProjectStore.getState().addProject('New Project', 'local', '/path/to/project')

    const state = useProjectStore.getState()
    expect(state.projects.length).toBe(before + 1)
    expect(state.projects[0].name).toBe('New Project')
    expect(state.projects[0].sourceType).toBe('local')
    expect(state.projects[0].sourcePath).toBe('/path/to/project')
    expect(state.projects[0].brainStatus).toBe('indexing')
    expect(state.projects[0].brainName).toBeTruthy()
    expect(state.activeProjectId).toBe(state.projects[0].id)
  })

  it('addProject assigns a random brainName', async () => {
    await useProjectStore.getState().addProject('Test', 'github', 'https://github.com/test')
    const brainName = useProjectStore.getState().projects[0].brainName
    const validNames = ['Atlas', 'Nova', 'Prism', 'Echo', 'Spark', 'Flux', 'Orbit', 'Sage']
    expect(validNames).toContain(brainName)
  })

  it('removeProject removes from list', async () => {
    const before = useProjectStore.getState().projects.length
    await useProjectStore.getState().removeProject('proj-1')
    expect(useProjectStore.getState().projects.length).toBe(before - 1)
  })

  it('removeProject clears activeProjectId if it was active', async () => {
    useProjectStore.getState().setActiveProject('proj-1')
    await useProjectStore.getState().removeProject('proj-1')
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('removeProject preserves activeProjectId if different project removed', async () => {
    await useProjectStore.getState().addProject('Other', 'local', '/other')
    const otherId = useProjectStore.getState().projects[0].id
    useProjectStore.getState().setActiveProject(otherId)
    await useProjectStore.getState().removeProject('proj-1')
    expect(useProjectStore.getState().activeProjectId).toBe(otherId)
  })

  it('renameProject updates project name', async () => {
    await useProjectStore.getState().renameProject('proj-1', 'Renamed Project')
    const project = useProjectStore.getState().projects.find((p) => p.id === 'proj-1')
    expect(project?.name).toBe('Renamed Project')
  })
})

// ==========================================
// chatStore
// ==========================================
describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [
        {
          id: 'conv-1',
          projectId: 'proj-1',
          title: 'Test conversation',
          mode: 'engineering',
          branch: 'main',
          createdAt: Date.now(),
          messages: [
            {
              id: 'msg-1',
              conversationId: 'conv-1',
              role: 'user',
              content: 'Hello',
              mode: 'engineering',
              createdAt: Date.now()
            }
          ]
        },
        {
          id: 'conv-2',
          projectId: 'proj-2',
          title: 'Another conv',
          mode: 'pm',
          branch: 'main',
          createdAt: Date.now(),
          messages: []
        }
      ],
      activeConversationId: null
    })
  })

  it('setActiveConversation updates activeConversationId', () => {
    useChatStore.getState().setActiveConversation('conv-1')
    expect(useChatStore.getState().activeConversationId).toBe('conv-1')
  })

  it('getProjectConversations filters by projectId', () => {
    const convs = useChatStore.getState().getProjectConversations('proj-1')
    expect(convs).toHaveLength(1)
    expect(convs[0].id).toBe('conv-1')
  })

  it('getProjectConversations returns empty for unknown project', () => {
    const convs = useChatStore.getState().getProjectConversations('unknown')
    expect(convs).toHaveLength(0)
  })

  it('createConversation creates and sets active', async () => {
    const id = await useChatStore.getState().createConversation('proj-1', 'pm')
    expect(typeof id).toBe('string')
    expect(useChatStore.getState().activeConversationId).toBe(id)

    const conv = useChatStore.getState().conversations.find((c) => c.id === id)
    expect(conv).toBeDefined()
    expect(conv?.projectId).toBe('proj-1')
    expect(conv?.mode).toBe('pm')
    expect(conv?.title).toBe('Cu\u1ed9c tr\u00f2 chuy\u1ec7n m\u1edbi')
  })

  it('addMessage appends message to conversation', async () => {
    await useChatStore.getState().addMessage('conv-1', 'assistant', 'Hi there', 'engineering')
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-1')
    expect(conv?.messages).toHaveLength(2)
    expect(conv?.messages[1].content).toBe('Hi there')
    expect(conv?.messages[1].role).toBe('assistant')
  })

  it('first user message updates conversation title', async () => {
    // conv-2 has no messages
    await useChatStore.getState().addMessage('conv-2', 'user', 'My first question about the codebase', 'pm')
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-2')
    expect(conv?.title).toBe('My first question about the codebase')
  })

  it('truncates title to 50 chars', async () => {
    const longContent = 'A'.repeat(100)
    await useChatStore.getState().addMessage('conv-2', 'user', longContent, 'pm')
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-2')
    expect(conv?.title).toHaveLength(50)
  })

  it('updateLastMessage updates content of last message', () => {
    useChatStore.getState().updateLastMessage('conv-1', 'Updated content')
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-1')
    expect(conv?.messages[conv.messages.length - 1].content).toBe('Updated content')
  })

  it('setMessageStreaming updates isStreaming flag', () => {
    useChatStore.getState().setMessageStreaming('conv-1', 'msg-1', true)
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-1')
    const msg = conv?.messages.find((m) => m.id === 'msg-1')
    expect(msg?.isStreaming).toBe(true)
  })

  it('addMessage returns DB message ID', async () => {
    const messageId = await useChatStore.getState().addMessage('conv-1', 'assistant', 'Test response', 'engineering')
    expect(messageId).toBe('msg-new')
  })

  it('addMessage uses DB-returned ID for local state', async () => {
    await useChatStore.getState().addMessage('conv-1', 'assistant', 'Test response', 'engineering')
    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-1')
    const lastMsg = conv?.messages[conv.messages.length - 1]
    expect(lastMsg?.id).toBe('msg-new')
  })

  it('addMessage calls createMessage IPC to persist to DB', async () => {
    await useChatStore.getState().addMessage('conv-1', 'user', 'Hello world', 'engineering')
    expect(window.electronAPI.createMessage).toHaveBeenCalledWith('conv-1', 'user', 'Hello world', 'engineering')
  })

  it('addMessage returns null when electronAPI is unavailable', async () => {
    const original = window.electronAPI.createMessage
    ;(window.electronAPI as any).createMessage = undefined
    const messageId = await useChatStore.getState().addMessage('conv-1', 'assistant', 'Test', 'engineering')
    expect(messageId).toBeNull()
    ;(window.electronAPI as any).createMessage = original
  })
})

// ==========================================
// uiStore
// ==========================================
describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      sidebarWidth: 260,
      mode: 'engineering',
      newProjectModalOpen: false,
      settingsOpen: false
    })
  })

  it('initial state has sidebar expanded', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().sidebarWidth).toBe(260)
  })

  it('initial mode is engineering', () => {
    expect(useUIStore.getState().mode).toBe('engineering')
  })

  it('toggleSidebar collapses sidebar', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().sidebarWidth).toBe(68)
  })

  it('toggleSidebar expands collapsed sidebar', () => {
    useUIStore.getState().toggleSidebar() // collapse
    useUIStore.getState().toggleSidebar() // expand
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().sidebarWidth).toBe(260)
  })

  it('setMode changes mode to pm', () => {
    useUIStore.getState().setMode('pm')
    expect(useUIStore.getState().mode).toBe('pm')
  })

  it('setMode changes mode to engineering', () => {
    useUIStore.getState().setMode('pm')
    useUIStore.getState().setMode('engineering')
    expect(useUIStore.getState().mode).toBe('engineering')
  })

  it('openNewProjectModal sets true', () => {
    useUIStore.getState().openNewProjectModal()
    expect(useUIStore.getState().newProjectModalOpen).toBe(true)
  })

  it('closeNewProjectModal sets false', () => {
    useUIStore.getState().openNewProjectModal()
    useUIStore.getState().closeNewProjectModal()
    expect(useUIStore.getState().newProjectModalOpen).toBe(false)
  })

  it('toggleSettings toggles', () => {
    expect(useUIStore.getState().settingsOpen).toBe(false)
    useUIStore.getState().toggleSettings()
    expect(useUIStore.getState().settingsOpen).toBe(true)
    useUIStore.getState().toggleSettings()
    expect(useUIStore.getState().settingsOpen).toBe(false)
  })
})
