import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { homedir } from 'os'
import { resolveMcpCommand } from './resolve-mcp-command'

/** Default timeout for MCP tool calls: 5 minutes (browser automation, long tasks) */
const DEFAULT_TOOL_TIMEOUT_MS = 300_000

export interface MCPClientConfig {
  serverUrl?: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Per-request timeout in ms. Defaults to 5 minutes. Set 0 for no timeout. */
  requestTimeoutMs?: number
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
        { name: 'cortex', version: '4.0.0' },
        { capabilities: {} }
      )

      if (config.transportType === 'stdio') {
        if (!config.command) throw new Error('stdio transport requires command')

        const resolved = resolveMcpCommand(config.command, config.env)
        const label = `${resolved.command} ${(config.args || []).join(' ')}`.trim()

        const stdioTransport = new StdioClientTransport({
          command: resolved.command,
          args: config.args || [],
          env: resolved.env,
          cwd: homedir(),
          stderr: 'pipe'
        })
        transport = stdioTransport

        stdioTransport.onerror = (err) => {
          console.error(`[MCPClient][${label}] transport error:`, err)
        }
        stdioTransport.onclose = () => {
          console.warn(`[MCPClient][${label}] transport closed`)
        }

        const stderrStream = stdioTransport.stderr
        if (stderrStream) {
          const buffered: string[] = []
          stderrStream.on('data', (chunk: Buffer | string) => {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
            const lines = text.split(/\r?\n/).filter(Boolean)
            for (const line of lines) {
              buffered.push(line)
              if (buffered.length > 50) buffered.shift()
              console.error(`[MCPClient][${label}][stderr] ${line}`)
            }
          })
          ;(stdioTransport as unknown as { _stderrTail?: string[] })._stderrTail = buffered
        }

        try {
          await client.connect(stdioTransport)
        } catch (connectErr) {
          const tail = (stdioTransport as unknown as { _stderrTail?: string[] })._stderrTail || []
          const message = connectErr instanceof Error ? connectErr.message : String(connectErr)
          const detail = tail.length ? `\nstderr tail:\n${tail.slice(-10).join('\n')}` : ''
          throw new Error(`${message}${detail}`)
        }
        connected = true
        console.log('[MCPClient] Connected via stdio:', label)
      } else {
        if (!config.serverUrl) throw new Error('SSE transport requires serverUrl')

        const baseUrl = new URL(config.serverUrl)

        const transportOpts: Record<string, unknown> = {}
        if (config.env) {
          const authKey = Object.keys(config.env).find(k => /api.key/i.test(k))
          if (authKey && config.env[authKey]) {
            transportOpts.requestInit = {
              headers: { Authorization: `Bearer ${config.env[authKey]}` }
            }
          }
        }

        try {
          const httpTransport = new StreamableHTTPClientTransport(baseUrl, transportOpts)
          await client.connect(httpTransport)
          transport = httpTransport
          connected = true
          console.log('[MCPClient] Connected via Streamable HTTP:', config.serverUrl)
        } catch {
          if (client) { try { await client.close() } catch {} }
          client = new Client(
            { name: 'cortex', version: '4.0.0' },
            { capabilities: {} }
          )

          const sseTransport = new SSEClientTransport(baseUrl, transportOpts)
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
      const timeout = config.requestTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
      const result = await client.listTools(undefined, timeout > 0 ? { timeout } : undefined)
      return (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: (t.inputSchema || {}) as Record<string, unknown>
      }))
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const timeout = config.requestTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        timeout > 0 ? { timeout } : undefined
      )
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
      const timeout = config.requestTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
      const result = await client.listResources(undefined, timeout > 0 ? { timeout } : undefined)
      return (result.resources || []).map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }))
    },

    async readResource(uri: string): Promise<string> {
      if (!client || !connected) throw new Error('MCP client not connected')
      const timeout = config.requestTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
      const result = await client.readResource({ uri }, timeout > 0 ? { timeout } : undefined)
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
