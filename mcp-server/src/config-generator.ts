import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CortexDbReader } from './db/reader.js'
import { detectCortexDbPath } from './utils/paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface ConfigOptions {
  dbPath?: string
  projectId?: string
  serverPath?: string
  appInsightsAppId?: string
  appInsightsApiKey?: string
  appInsightsTenantId?: string
  appInsightsClientId?: string
  appInsightsClientSecret?: string
  appInsightsTimespan?: string
}

function getServerPath(opts: ConfigOptions): string {
  return opts.serverPath || resolve(__dirname, '..', 'dist', 'cli.js')
}

function buildArgs(opts: ConfigOptions): string[] {
  const args = [getServerPath(opts)]
  if (opts.dbPath) args.push(`--db-path=${opts.dbPath}`)
  if (opts.projectId) args.push(`--project-id=${opts.projectId}`)
  return args
}

function buildEnvVars(opts: ConfigOptions): Record<string, string> | undefined {
  const env: Record<string, string> = {}
  if (opts.appInsightsAppId) env['APPINSIGHTS_APP_ID'] = opts.appInsightsAppId
  if (opts.appInsightsApiKey) env['APPINSIGHTS_API_KEY'] = opts.appInsightsApiKey
  if (opts.appInsightsTenantId) env['APPINSIGHTS_TENANT_ID'] = opts.appInsightsTenantId
  if (opts.appInsightsClientId) env['APPINSIGHTS_CLIENT_ID'] = opts.appInsightsClientId
  if (opts.appInsightsClientSecret) env['APPINSIGHTS_CLIENT_SECRET'] = opts.appInsightsClientSecret
  if (opts.appInsightsTimespan) env['APPINSIGHTS_TIMESPAN'] = opts.appInsightsTimespan
  return Object.keys(env).length > 0 ? env : undefined
}

export function generateClineConfig(opts: ConfigOptions): object {
  const env = buildEnvVars(opts)
  return {
    mcpServers: {
      'cortex-brain': {
        command: 'node',
        args: buildArgs(opts),
        ...(env ? { env } : {}),
        disabled: false,
      },
    },
  }
}

export function generateClaudeCodeConfig(opts: ConfigOptions): object {
  const env = buildEnvVars(opts)
  return {
    mcpServers: {
      'cortex-brain': {
        command: 'node',
        args: buildArgs(opts),
        ...(env ? { env } : {}),
      },
    },
  }
}

export function generateContinueConfig(opts: ConfigOptions): object {
  return {
    experimental: {
      modelContextProtocolServers: [
        {
          transport: {
            type: 'stdio',
            command: 'node',
            args: buildArgs(opts),
          },
        },
      ],
    },
  }
}

export function generateCursorConfig(opts: ConfigOptions): object {
  const env = buildEnvVars(opts)
  return {
    mcpServers: {
      'cortex-brain': {
        command: 'node',
        args: buildArgs(opts),
        ...(env ? { env } : {}),
      },
    },
  }
}

export function generateOpenCodeConfig(opts: ConfigOptions): object {
  const env = buildEnvVars(opts)
  return {
    mcpServers: {
      'cortex-brain': {
        command: 'node',
        args: buildArgs(opts),
        ...(env ? { env } : {}),
      },
    },
  }
}

interface AllConfigs {
  cline: object
  claudeCode: object
  continue_: object
  cursor: object
  opencode: object
}

export function generateAllConfigs(opts: ConfigOptions): AllConfigs {
  return {
    cline: generateClineConfig(opts),
    claudeCode: generateClaudeCodeConfig(opts),
    continue_: generateContinueConfig(opts),
    cursor: generateCursorConfig(opts),
    opencode: generateOpenCodeConfig(opts),
  }
}

export function printConfigGuide(opts: ConfigOptions): string {
  const dbPath = opts.dbPath || detectCortexDbPath()
  const resolvedOpts = { ...opts, dbPath: dbPath || undefined }

  let projectList = ''
  if (dbPath) {
    try {
      const reader = new CortexDbReader({ dbPath })
      const projects = reader.listProjects()
      if (projects.length > 0) {
        projectList = '\nAvailable projects:\n' +
          projects.map((p) => `  ${p.id}  ${p.name}`).join('\n') + '\n'
      }
      reader.close()
    } catch { /* ignore: DB may be locked by Electron */ }
  }

  const hasAppInsights = !!resolvedOpts.appInsightsAppId
  const appInsightsSection = hasAppInsights ? '' : `
--- Azure Application Insights (optional) ---

Method 1 — Azure CLI (easiest, no special permissions needed):
  1. Install Azure CLI: https://aka.ms/install-azure-cli
  2. Run: az login
  3. Set env: APPINSIGHTS_APP_ID=<your Application ID>
  Where to find Application ID:
    Azure Portal → Application Insights → API Access → copy "Application ID"

Method 2 — Service Principal (for CI/CD or shared environments):
  Set env vars: APPINSIGHTS_APP_ID, APPINSIGHTS_TENANT_ID,
                APPINSIGHTS_CLIENT_ID, APPINSIGHTS_CLIENT_SECRET

Method 3 — API Key (legacy, may fail on newer resources):
  Set env vars: APPINSIGHTS_APP_ID, APPINSIGHTS_API_KEY
`

  return `
=== Cortex Brain MCP Server — Setup Guide ===
${projectList}${appInsightsSection}
--- OpenCode ---
File: ~/.config/opencode/config.json (add to existing config)

${JSON.stringify(generateOpenCodeConfig(resolvedOpts), null, 2)}

--- Cline (VS Code) ---
File: ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json

${JSON.stringify(generateClineConfig(resolvedOpts), null, 2)}

--- Claude Code ---
File: ~/.claude/claude_desktop_config.json

${JSON.stringify(generateClaudeCodeConfig(resolvedOpts), null, 2)}

--- Continue (VS Code) ---
File: ~/.continue/config.json (add to existing config)

${JSON.stringify(generateContinueConfig(resolvedOpts), null, 2)}

--- Cursor ---
File: ~/.cursor/mcp.json

${JSON.stringify(generateCursorConfig(resolvedOpts), null, 2)}

--- Generic stdio command ---
node ${buildArgs(resolvedOpts).join(' ')}
`.trim()
}
