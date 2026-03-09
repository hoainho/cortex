import '@testing-library/jest-dom/vitest'

// Mock window.electronAPI for UI tests
Object.defineProperty(window, 'electronAPI', {
  value: {
    platform: 'darwin',
    openFolderDialog: vi.fn().mockResolvedValue('/mock/path'),
    createProject: vi.fn().mockImplementation((name: string, brainName: string) => Promise.resolve({ id: `proj-${Date.now()}`, name, brain_name: brainName, created_at: Date.now(), updated_at: Date.now() })),
    getAllProjects: vi.fn().mockResolvedValue([]),
    deleteProject: vi.fn().mockResolvedValue(true),
    renameProject: vi.fn().mockResolvedValue(true),
    getProjectStats: vi.fn().mockResolvedValue({ totalChunks: 0 }),
    importLocalRepo: vi.fn().mockResolvedValue({ repoId: 'repo-1', status: 'indexing' }),
    importGithubRepo: vi.fn().mockResolvedValue({ success: true, repoId: 'repo-1' }),
    checkGithubAccess: vi.fn().mockResolvedValue({ accessible: true, isPrivate: false }),
    getReposByProject: vi.fn().mockResolvedValue([]),
    searchBrain: vi.fn().mockResolvedValue([]),
    sendChatMessage: vi.fn().mockResolvedValue({ success: true, content: 'Mock response' }),
    abortChat: vi.fn().mockResolvedValue(true),
    onIndexingProgress: vi.fn().mockReturnValue(() => {}),
    onChatStream: vi.fn().mockReturnValue(() => {}),
    // Chat/conversation APIs
    createConversation: vi.fn().mockResolvedValue({ id: 'conv-new', project_id: 'proj-1', title: 'Cuộc trò chuyện mới', mode: 'pm', created_at: Date.now() }),
    getConversationsByProject: vi.fn().mockResolvedValue([]),
    getMessagesByConversation: vi.fn().mockResolvedValue([]),
    createMessage: vi.fn().mockResolvedValue({ id: 'msg-new' }),
    updateConversationTitle: vi.fn().mockResolvedValue(true),
    deleteConversation: vi.fn().mockResolvedValue(true),
    updateMessageContent: vi.fn().mockResolvedValue(true),
    deleteRepo: vi.fn().mockResolvedValue({ success: true }),
  },
  writable: true
})
