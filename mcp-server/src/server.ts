import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { CortexDbReader } from './db/reader.js'
import { hybridSearch, searchArchivalByVector } from './search/vector.js'
import { log } from './utils/logger.js'
import {
  AppInsightsConfig,
  APPINSIGHTS_TOOLS,
  appinsightsE2ETransaction,
  appinsightsKqlQuery,
  appinsightsRecentExceptions,
  appinsightsRequestSearch,
  appinsightsDependencyFailures,
} from './tools/azure-appinsights.js'

export interface CortexMCPServerConfig {
  dbPath: string
  projectId?: string
  appInsights?: AppInsightsConfig
}

export function createCortexMCPServer(config: CortexMCPServerConfig) {
  const reader = new CortexDbReader({ dbPath: config.dbPath })
  const aiConfig = config.appInsights
  const server = new Server(
    { name: 'cortex-brain', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  )

  function resolveProjectId(args: Record<string, unknown>): string {
    const id = (args.projectId as string) || config.projectId
    if (!id) throw new Error('projectId is required. Pass it as argument or use --project-id flag.')
    return id
  }

  // --- Tools ---

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'cortex_search',
        description: 'Search codebase with Cortex hybrid RAG (vector + keyword). Returns relevant code chunks with file paths, line numbers, and confidence scores.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Natural language query about the codebase' },
            projectId: { type: 'string', description: 'Cortex project ID (optional if server started with --project-id)' },
            maxResults: { type: 'number', description: 'Max results (default: 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'cortex_memory_read',
        description: 'Read from Cortex persistent memory. Tiers: "core" (project conventions, always in context), "archival" (past decisions, long-term), "recall" (conversation history).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            tier: { type: 'string', enum: ['core', 'archival', 'recall'], description: 'Memory tier to read from' },
            projectId: { type: 'string' },
            query: { type: 'string', description: 'Search query (optional, for archival/recall)' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
          },
          required: ['tier'],
        },
      },
      {
        name: 'cortex_graph_query',
        description: 'Query the code knowledge graph. Traverse relationships between files, functions, classes (imports, calls, inherits).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            nodeType: { type: 'string', enum: ['file', 'function', 'class', 'module', 'variable'], description: 'Filter by node type' },
            startNodeId: { type: 'string', description: 'Start node for traversal' },
            hops: { type: 'number', description: 'Traversal depth (default: 2)' },
            projectId: { type: 'string' },
          },
        },
      },
      {
        name: 'cortex_find_similar',
        description: 'Find code patterns similar to a given snippet. Uses vector similarity on existing embeddings.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            code: { type: 'string', description: 'Code snippet to find similar patterns for' },
            projectId: { type: 'string' },
            limit: { type: 'number', description: 'Max results (default: 5)' },
          },
          required: ['code'],
        },
      },
      {
        name: 'cortex_project_info',
        description: 'Get project overview: stats, languages, repositories, brain health, memory counts.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            projectId: { type: 'string' },
          },
        },
      },
      {
        name: 'cortex_list_projects',
        description: 'List all Cortex projects with their IDs and stats.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'cortex_directory_tree',
        description: 'Get the directory tree structure of a project.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            projectId: { type: 'string' },
          },
        },
      },
      ...(aiConfig ? APPINSIGHTS_TOOLS : []),
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    log('info', `Tool call: ${name}`, JSON.stringify(args).slice(0, 200))

    try {
      switch (name) {
        case 'cortex_search': {
          const projectId = resolveProjectId(args)
          const query = args.query as string
          const maxResults = (args.maxResults as number) || 10
          const results = hybridSearch(reader, projectId, query, null, maxResults)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                totalResults: results.length,
                results: results.map((r) => ({
                  file: r.relativePath,
                  lines: `${r.lineStart}-${r.lineEnd}`,
                  language: r.language,
                  type: r.chunkType,
                  name: r.name,
                  score: Math.round(r.score * 1000) / 1000,
                  content: r.content,
                })),
              }, null, 2),
            }],
          }
        }

        case 'cortex_memory_read': {
          const projectId = resolveProjectId(args)
          const tier = args.tier as string
          const query = args.query as string | undefined
          const limit = (args.limit as number) || 20

          let data: unknown
          switch (tier) {
            case 'core':
              data = reader.getCoreMemory(projectId).map((m) => ({
                section: m.section,
                content: m.content,
                updatedAt: new Date(m.updated_at).toISOString(),
              }))
              break
            case 'archival':
              data = query
                ? reader.searchArchivalByContent(projectId, query, limit)
                    .map((m) => ({ content: m.content, metadata: m.metadata, relevance: m.relevance_score }))
                : reader.getArchivalMemory(projectId, limit)
                    .map((m) => ({ content: m.content, metadata: m.metadata, relevance: m.relevance_score }))
              break
            case 'recall':
              data = query
                ? reader.searchRecallByContent(projectId, query, limit)
                    .map((m) => ({ role: m.role, content: m.content, timestamp: new Date(m.timestamp).toISOString() }))
                : reader.getRecallMemory(projectId, limit)
                    .map((m) => ({ role: m.role, content: m.content, timestamp: new Date(m.timestamp).toISOString() }))
              break
            default:
              throw new Error(`Unknown memory tier: ${tier}. Use "core", "archival", or "recall".`)
          }

          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
        }

        case 'cortex_graph_query': {
          const projectId = resolveProjectId(args)
          if (args.startNodeId) {
            const hops = (args.hops as number) || 2
            const result = reader.graphTraversal(args.startNodeId as string, hops)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }
          if (args.nodeType) {
            const nodes = reader.getGraphNodesByType(projectId, args.nodeType as string)
            return { content: [{ type: 'text', text: JSON.stringify(nodes.map((n) => ({
              id: n.id, type: n.type, name: n.name, file: n.file_path,
              lines: n.start_line && n.end_line ? `${n.start_line}-${n.end_line}` : null,
            })), null, 2) }] }
          }
          const nodes = reader.getGraphNodes(projectId, 50)
          const edges = reader.getGraphEdges(projectId, 100)
          return { content: [{ type: 'text', text: JSON.stringify({
            totalNodes: nodes.length, totalEdges: edges.length,
            nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, file: n.file_path })),
            edges: edges.slice(0, 50).map((e) => ({ source: e.source_id, target: e.target_id, type: e.type })),
          }, null, 2) }] }
        }

        case 'cortex_find_similar': {
          const projectId = resolveProjectId(args)
          const limit = (args.limit as number) || 5
          const results = hybridSearch(reader, projectId, args.code as string, null, limit)
          return { content: [{ type: 'text', text: JSON.stringify(results.map((r) => ({
            file: r.relativePath, lines: `${r.lineStart}-${r.lineEnd}`,
            language: r.language, name: r.name, score: Math.round(r.score * 1000) / 1000,
            content: r.content,
          })), null, 2) }] }
        }

        case 'cortex_project_info': {
          const projectId = resolveProjectId(args)
          const project = reader.getProject(projectId)
          if (!project) throw new Error(`Project not found: ${projectId}`)
          const stats = reader.getProjectStats(projectId)
          return { content: [{ type: 'text', text: JSON.stringify({
            id: project.id, name: project.name, brainName: project.brain_name,
            createdAt: new Date(project.created_at).toISOString(),
            stats: {
              chunks: stats.totalChunks, files: stats.totalFiles,
              coreMemory: stats.totalCoreMemory, archivalMemory: stats.totalArchival,
              recallMemory: stats.totalRecall, graphNodes: stats.totalGraphNodes,
              graphEdges: stats.totalGraphEdges,
            },
            languages: stats.languages,
            repositories: stats.repositories.map((r) => ({
              path: r.source_path, type: r.source_type, status: r.status,
              files: r.total_files, chunks: r.total_chunks,
            })),
          }, null, 2) }] }
        }

        case 'cortex_list_projects': {
          const projects = reader.listProjects()
          return { content: [{ type: 'text', text: JSON.stringify(projects.map((p) => ({
            id: p.id, name: p.name, brainName: p.brain_name,
            updatedAt: new Date(p.updated_at).toISOString(),
          })), null, 2) }] }
        }

        case 'cortex_directory_tree': {
          const projectId = resolveProjectId(args)
          const tree = reader.getDirectoryTree(projectId)
          return { content: [{ type: 'text', text: tree || 'No directory tree available. Project may not be indexed yet.' }] }
        }

        case 'appinsights_e2e_transaction': {
          if (!aiConfig) throw new Error('Azure Application Insights is not configured. Pass --appinsights-app-id with either --appinsights-api-key or Service Principal flags (--appinsights-tenant-id, --appinsights-client-id, --appinsights-client-secret).')
          const operationId = args.operationId as string
          const timespan = args.timespan as string | undefined
          const result = await appinsightsE2ETransaction(aiConfig, operationId, timespan)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        case 'appinsights_kql_query': {
          if (!aiConfig) throw new Error('Azure Application Insights is not configured. Pass --appinsights-app-id with either --appinsights-api-key or Service Principal flags.')
          const query = args.query as string
          const timespan = args.timespan as string | undefined
          const result = await appinsightsKqlQuery(aiConfig, query, timespan)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        case 'appinsights_recent_exceptions': {
          if (!aiConfig) throw new Error('Azure Application Insights is not configured. Pass --appinsights-app-id with either --appinsights-api-key or Service Principal flags.')
          const limit = args.limit as number | undefined
          const timespan = args.timespan as string | undefined
          const filter = args.filter as string | undefined
          const result = await appinsightsRecentExceptions(aiConfig, limit, timespan, filter)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        case 'appinsights_request_search': {
          if (!aiConfig) throw new Error('Azure Application Insights is not configured. Pass --appinsights-app-id with either --appinsights-api-key or Service Principal flags.')
          const result = await appinsightsRequestSearch(aiConfig, {
            urlFilter: args.urlFilter as string | undefined,
            resultCode: args.resultCode as string | undefined,
            minDurationMs: args.minDurationMs as number | undefined,
            maxDurationMs: args.maxDurationMs as number | undefined,
            operationName: args.operationName as string | undefined,
            limit: args.limit as number | undefined,
            timespan: args.timespan as string | undefined,
          })
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        case 'appinsights_dependency_failures': {
          if (!aiConfig) throw new Error('Azure Application Insights is not configured. Pass --appinsights-app-id with either --appinsights-api-key or Service Principal flags.')
          const result = await appinsightsDependencyFailures(aiConfig, {
            type: args.type as string | undefined,
            target: args.target as string | undefined,
            limit: args.limit as number | undefined,
            timespan: args.timespan as string | undefined,
          })
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', `Tool ${name} failed:`, message)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  })

  // --- Resources ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const projects = reader.listProjects()
    const resources = []

    for (const project of projects) {
      resources.push(
        {
          uri: `cortex://memory/core/${project.id}`,
          name: `${project.name} - Core Memory`,
          description: `Project conventions, coding style, preferences for ${project.name}`,
          mimeType: 'application/json',
        },
        {
          uri: `cortex://project/${project.id}/stats`,
          name: `${project.name} - Stats`,
          description: `Project statistics and brain health for ${project.name}`,
          mimeType: 'application/json',
        },
        {
          uri: `cortex://graph/${project.id}/overview`,
          name: `${project.name} - Knowledge Graph`,
          description: `Code architecture graph for ${project.name}`,
          mimeType: 'application/json',
        },
        {
          uri: `cortex://project/${project.id}/tree`,
          name: `${project.name} - Directory Tree`,
          description: `Directory structure of ${project.name}`,
          mimeType: 'text/plain',
        },
      )
    }

    return { resources }
  })

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params
    log('info', `Resource read: ${uri}`)

    const match = uri.match(/^cortex:\/\/(\w+)\/(.+)$/)
    if (!match) throw new Error(`Invalid resource URI: ${uri}`)

    const [, domain, path] = match

    try {
      if (domain === 'memory' && path.startsWith('core/')) {
        const projectId = path.replace('core/', '')
        const memories = reader.getCoreMemory(projectId)
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(
          memories.map((m) => ({ section: m.section, content: m.content })), null, 2
        ) }] }
      }

      if (domain === 'project' && path.endsWith('/stats')) {
        const projectId = path.replace('/stats', '')
        const stats = reader.getProjectStats(projectId)
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(stats, null, 2) }] }
      }

      if (domain === 'graph' && path.endsWith('/overview')) {
        const projectId = path.replace('/overview', '')
        const nodes = reader.getGraphNodes(projectId, 100)
        const edges = reader.getGraphEdges(projectId, 200)
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, file: n.file_path })),
          edges: edges.map((e) => ({ source: e.source_id, target: e.target_id, type: e.type, weight: e.weight })),
        }, null, 2) }] }
      }

      if (domain === 'project' && path.endsWith('/tree')) {
        const projectId = path.replace('/tree', '')
        const tree = reader.getDirectoryTree(projectId)
        return { contents: [{ uri, mimeType: 'text/plain', text: tree || 'No directory tree available.' }] }
      }

      throw new Error(`Unknown resource: ${uri}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', `Resource ${uri} failed:`, message)
      throw err
    }
  })

  return { server, reader }
}
