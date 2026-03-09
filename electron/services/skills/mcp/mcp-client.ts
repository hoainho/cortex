import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface MCPClientConfig {
  serverUrl?: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listTools(): Promise<MCPTool[]>
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  listResources(): Promise<MCPResource[]>
  readResource(uri: string): Promise<string>
  isConnected(): boolean
}

export function createMCPClient(config: MCPClientConfig): MCPClient {
  let client: Client | null = null
  let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport | null = null
  let connected = false

  return {
    async connect(): Promise<void> {
      client = new Client(
        { name: 'cortex', version: '2.0.0' },
        { capabilities: {} }
      )

      if (config.transportType === 'stdio') {
        if (!config.command) throw new Error('stdio transport requires command')

        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...config.env } as Record<string, string>,
          stderr: 'pipe'
        })

        await client.connect(transport)
        connected = true
        console.log('[MCPClient] Connected via stdio:', config.command, config.args?.join(' ') || '')
      } else {
        if (!config.serverUrl) throw new Error('SSE transport requires serverUrl')

        const baseUrl = new URL(config.serverUrl)

        try {
          const httpTransport = new StreamableHTTPClientTransport(baseUrl)
          await client.connect(httpTransport)
          transport = httpTransport
          connected = true
          console.log('[MCPClient] Connected via Streamable HTTP:', config.serverUrl)
        } catch {
          if (client) { try { await client.close() } catch {} }
          client = new Client(
            { name: 'cortex', version: '2.0.0' },
            { capabilities: {} }
          )

          const sseTransport = new SSEClientTransport(baseUrl)
          await client.connect(sseTransport)
          transport = sseTransport
          connected = true
          console.log('[MCPClient] Connected via SSE (legacy):', config.serverUrl)
        }
      }
    },

    async disconnect(): Promise<void> {
      try {
        if (client) await client.close()
      } catch {}
      client = null
      transport = null
      connected = false
    },

    async listTools(): Promise<MCPTool[]> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const result = await client.listTools()
      return (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: (t.inputSchema || {}) as Record<string, unknown>
      }))
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const result = await client.callTool({ name, arguments: args })
      if (result.content && Array.isArray(result.content)) {
        const textParts = result.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { type: string; text?: string }) => c.text || '')
        if (textParts.length > 0) return textParts.join('\n')
      }
      return result
    },

    async listResources(): Promise<MCPResource[]> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const result = await client.listResources()
      return (result.resources || []).map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }))
    },

    async readResource(uri: string): Promise<string> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const result = await client.readResource({ uri })
      const contents = result.contents || []
      if (contents.length > 0 && 'text' in contents[0]) {
        return (contents[0] as { text: string }).text
      }
      return ''
    },

    isConnected(): boolean {
      return connected
    }
  }
}
