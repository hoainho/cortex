/**
 * Logger for Cortex MCP Server.
 * MUST use stderr because MCP protocol uses stdout for JSON-RPC.
 */
export function log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const ts = new Date().toISOString()
  console.error(`[cortex-brain][${ts}][${level}]`, ...args)
}
