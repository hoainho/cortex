export type ResponseMode = 'pm' | 'engineering'

export type ImportSourceType = 'local' | 'github'

export type BrainStatus = 'idle' | 'indexing' | 'ready' | 'error'

export interface Project {
  id: string
  name: string
  brainName: string // AI-generated 1-word name representing the project
  sourceType: ImportSourceType
  sourcePath: string // local path or github URL
  brainStatus: BrainStatus
  lastSyncAt: number | null
  createdAt: number
}

export interface ChatAttachment {
  id: string
  name: string
  path: string
  size: number
  mimeType: string
  isImage: boolean
  base64?: string
  textContent?: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  mode: ResponseMode
  createdAt: number
  isStreaming?: boolean
  attachments?: ChatAttachment[]
}

export interface Conversation {
  id: string
  projectId: string
  title: string
  mode: ResponseMode
  branch: string
  messages: Message[]
  createdAt: number
}

export interface IndexingProgress {
  repoId: string
  phase: 'scanning' | 'parsing' | 'chunking' | 'embedding' | 'done' | 'error'
  totalFiles: number
  processedFiles: number
  totalChunks: number
  currentFile?: string
  error?: string
}
export interface SyncProgress {
  repoId: string
  message: string
}

export interface SyncResult {
  success: boolean
  repoId?: string
  filesAdded?: number
  filesModified?: number
  filesDeleted?: number
  chunksAdded?: number
  chunksRemoved?: number
  error?: string
}

export type FeedbackSignalType = 'thumbs_up' | 'thumbs_down' | 'copy' | 'follow_up_quick' | 'follow_up_slow' | 'no_follow_up'

export type ThinkingStepId = 'sanitize' | 'rag' | 'external_context' | 'web_search' | 'build_prompt' | 'streaming'

export type ThinkingStepStatus = 'running' | 'done' | 'skipped' | 'error'

export interface ThinkingStep {
  conversationId: string
  step: ThinkingStepId
  status: ThinkingStepStatus
  label: string
  detail?: string
  durationMs?: number
}

export interface LearningStats {
  totalFeedback: number
  totalTrainingPairs: number
  totalLearnedWeights: number
  positiveRatio: number
  lastTrainedAt: number | null
  compressionSavings: { tokensOriginal: number; tokensCompressed: number; savingsPercent: number }
}

export interface ContextCompressionStats {
  originalTokens: number
  compressedTokens: number
  savingsPercent: number
  chunksSummary: Array<{ chunkType: string; original: number; compressed: number }>
}

declare global {
  interface Window {
    electronAPI: {
      platform: string

      // Dialogs
      openFolderDialog: () => Promise<string | null>
      openFileDialog: () => Promise<ChatAttachment[]>

      // Project CRUD
      createProject: (name: string, brainName: string) => Promise<any>
      getAllProjects: () => Promise<any[]>
      deleteProject: (projectId: string) => Promise<boolean>
      renameProject: (projectId: string, newName: string) => Promise<boolean>
      getProjectStats: (projectId: string) => Promise<any>

      // Repository import
      importLocalRepo: (projectId: string, localPath: string) => Promise<{ repoId: string; status: string }>
      getReposByProject: (projectId: string) => Promise<any[]>
      importGithubRepo: (projectId: string, repoUrl: string, token?: string, branch?: string) => Promise<{ success: boolean; repoId?: string; error?: string; needsToken?: boolean }>
      checkGithubAccess: (repoUrl: string, token?: string) => Promise<{ accessible: boolean; isPrivate?: boolean; error?: string }>
      deleteRepo: (repoId: string) => Promise<{ success: boolean; error?: string }>

      // Brain search
      searchBrain: (projectId: string, query: string, limit?: number) => Promise<any[]>

      // Conversation CRUD
      createConversation: (projectId: string, title: string, mode: string, branch?: string) => Promise<any>
      getConversationsByProject: (projectId: string) => Promise<any[]>
      updateConversationTitle: (conversationId: string, title: string) => Promise<boolean>
      deleteConversation: (conversationId: string) => Promise<boolean>

      // Message CRUD
      createMessage: (conversationId: string, role: string, content: string, mode: string, contextChunks?: string) => Promise<any>
      getMessagesByConversation: (conversationId: string) => Promise<any[]>
      updateMessageContent: (messageId: string, content: string) => Promise<boolean>

      // Chat with LLM
      sendChatMessage: (
        projectId: string,
        conversationId: string,
        query: string,
        mode: string,
        history: Array<{ role: string; content: string }>,
        attachments?: ChatAttachment[]
      ) => Promise<{ success: boolean; content?: string; error?: string; contextChunks?: any[] }>
      abortChat: (conversationId: string) => Promise<boolean>

      // Sync
      syncRepo: (projectId: string, repoId: string) => Promise<SyncResult>
      startWatcher: (repoId: string, localPath: string) => Promise<boolean>
      stopWatcher: (repoId: string) => Promise<boolean>

      // Branch management
      listBranches: (repoId: string) => Promise<string[]>
      switchBranch: (projectId: string, repoId: string, branch: string) => Promise<{ success: boolean; error?: string }>
      getCurrentBranch: (repoId: string) => Promise<string>

      // LLM Models
      getActiveModel: () => Promise<string>
      getAvailableModels: () => Promise<Array<{ id: string; tier: number; active: boolean }>>
      refreshModels: () => Promise<Array<{ id: string; tier: number }>>
      setModel: (modelId: string) => Promise<{ success: boolean; model?: string; error?: string }>
      getAutoRotation: () => Promise<boolean>
      setAutoRotation: (enabled: boolean) => Promise<boolean>

      // Architecture Analysis
      analyzeArchitecture: (projectId: string) => Promise<{
        entryPoints: string[]
        hubFiles: { path: string; importedBy: number }[]
        layers: { name: string; files: string[] }[]
        dependencyGraph: { source: string; target: string }[]
        techStack: { name: string; version?: string }[]
        stats: { totalFiles: number; totalFunctions: number; totalClasses: number; totalInterfaces: number }
      }>

      // Impact & Estimate
      analyzeImpact: (projectId: string, changedFiles: string[]) => Promise<{
        affectedFiles: string[]
        affectedFunctions: string[]
        blastRadius: number
        riskLevel: 'low' | 'medium' | 'high'
      }>
      estimateFeature: (projectId: string, description: string) => Promise<{
        estimatedHours: number
        complexity: 'low' | 'medium' | 'high'
        affectedModules: string[]
        confidence: number
      }>

      // Brain Export/Import
      exportBrain: (projectId: string) => Promise<{ chunks: number; conversations: number } | null>
      importBrain: () => Promise<{ projectId: string; chunks: number } | null>

      // Settings
      getProxyConfig: () => Promise<{ url: string; key: string }>
      setProxyConfig: (url: string, key: string) => Promise<boolean>
      getLLMConfig: () => Promise<{ maxTokens: number; contextMessages: number }>
      setLLMConfig: (maxTokens: number, contextMessages: number) => Promise<boolean>
      getGitConfig: () => Promise<{ cloneDepth: number }>
      setGitConfig: (cloneDepth: number) => Promise<boolean>
      testProxyConnection: (url: string, key: string) => Promise<{ success: boolean; error?: string; latencyMs?: number }>
      // Per-project Atlassian config
      getProjectAtlassianConfig: (projectId: string) => Promise<{ siteUrl: string; email: string; hasToken: boolean } | null>
      setProjectAtlassianConfig: (projectId: string, siteUrl: string, email: string, apiToken: string) => Promise<boolean>
      clearProjectAtlassianConfig: (projectId: string) => Promise<boolean>
      testProjectAtlassianConnection: (projectId: string) => Promise<{ success: boolean; serverInfo?: any; error?: string }>
      completeOnboarding: () => Promise<boolean>
      isOnboardingCompleted: () => Promise<boolean>

      // GitHub
      getGitHubPAT: () => Promise<boolean>
      setGitHubPAT: (token: string) => Promise<boolean>

      // Jira (per-project)
      testJiraConnection: (projectId: string) => Promise<{ success: boolean; serverInfo?: any; error?: string }>
      getJiraProjects: (projectId: string) => Promise<Array<{ id: string; key: string; name: string }>>
      importJiraProject: (projectId: string, jiraProjectKey: string) => Promise<{ success: boolean; issuesImported?: number; error?: string }>

      // Confluence (per-project)
      getConfluenceSpaces: (projectId: string) => Promise<Array<{ id: string; key: string; name: string }>>
      importConfluenceSpace: (projectId: string, spaceId: string, spaceKey: string) => Promise<{ success: boolean; pagesImported?: number; error?: string }>

      // Updater
      checkForUpdates: () => Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion?: string; releaseUrl?: string }>

      // Audit
      getAuditLog: (projectId?: string, limit?: number) => Promise<Array<{ id: number; event_type: string; project_id?: string; user_action?: string; details?: string; created_at: number }>>

      // Atlassian Connections
      getAtlassianConnections: (projectId: string) => Promise<any[]>
      syncAtlassianConnection: (projectId: string, connectionId: string) => Promise<{ success: boolean }>
      deleteAtlassianConnection: (connectionId: string) => Promise<boolean>

      // Nano-Brain
      getNanoBrainStatus: () => Promise<{ initialized: boolean; collections: string[]; totalChunks: number; embeddingStatus: string }>
      queryNanoBrain: (query: string, options?: { limit?: number; collection?: string }) => Promise<Array<{ content: string; filePath: string; score: number; collection: string }>>
      getNanoBrainCollections: () => Promise<string[]>
      triggerNanoBrainEmbed: () => Promise<boolean>

      // Self-Learning Engine
      sendFeedback: (messageId: string, conversationId: string, projectId: string, signalType: FeedbackSignalType, query: string, chunkIds: string[]) => Promise<boolean>
      getLearningStats: (projectId: string) => Promise<LearningStats>
      triggerLearning: (projectId: string) => Promise<{ trained: number; weights: number }>
      exportTrainingData: (projectId: string) => Promise<{ pairs: number; path: string } | null>

      // Agent Mode
      agentExecute?: (projectId: string, query: string, strategy?: string) => Promise<{ content: string }>
      agentAbort?: () => Promise<boolean>
      getSlashCommands?: () => Promise<Array<{ command: string; label: string; description: string; icon: string; skillName?: string; agentRole?: string }>>

      // Skill System
      skillList: (filter?: { category?: string; status?: string }) => Promise<Array<{
        name: string; version: string; category: string; priority: string
        status: string; description: string; dependencies: string[]
        metrics: { totalCalls: number; successCount: number; errorCount: number; avgLatencyMs: number; lastUsed: number | null }
        lastError?: string
      }>>
      skillActivate: (name: string) => Promise<boolean>
      skillDeactivate: (name: string) => Promise<boolean>
      skillExecute: (name: string, input: { query: string; projectId: string; conversationId?: string; mode?: string }) => Promise<{ content: string; metadata?: Record<string, unknown> } | null>
      skillRoute: (input: { query: string; projectId: string; mode?: string }) => Promise<{ content: string; metadata?: Record<string, unknown> } | null>
      skillHealth: () => Promise<Array<{ name: string; healthy: boolean; message?: string }>>

      // MCP Servers
      mcpList: () => Promise<Array<{
        id: string; name: string; transportType: 'stdio' | 'sse'
        command?: string; args?: string; serverUrl?: string
        enabled: boolean; connected: boolean; toolCount: number; resourceCount: number
        lastError?: string; lastChecked: number
      }>>
      mcpAdd: (config: {
        name: string; transportType: 'stdio' | 'sse'
        command?: string; args?: string; serverUrl?: string; env?: string
      }) => Promise<{
        id: string; name: string; transportType: 'stdio' | 'sse'
        command?: string; args?: string; serverUrl?: string
        enabled: boolean; connected: boolean; toolCount: number; resourceCount: number
        lastError?: string; lastChecked: number
      } | null>
      mcpRemove: (id: string) => Promise<boolean>
      mcpConnect: (id: string) => Promise<{ success: boolean; error?: string }>
      mcpDisconnect: (id: string) => Promise<boolean>
      mcpHealth: (id: string) => Promise<{ connected: boolean; toolCount: number; resourceCount: number; error?: string }>

      // Events
      onIndexingProgress: (callback: (data: IndexingProgress) => void) => () => void
      onChatStream: (callback: (data: { conversationId: string; content: string; done: boolean }) => void) => () => void
      onChatThinking: (callback: (data: ThinkingStep) => void) => () => void
      onSyncProgress: (callback: (data: SyncProgress) => void) => () => void
      onFileChanged: (callback: (data: { repoId: string }) => void) => () => void
      onModelRotated: (callback: (data: { fromModel: string; reason: string; type: string }) => void) => () => void
      onAgentStep?: (callback: (data: { step: string; type: string; content: string }) => void) => () => void
    }
  }
}
