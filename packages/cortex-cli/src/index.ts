#!/usr/bin/env node
/**
 * Cortex CLI — Headless mode for terminal, CI/CD, and scripting
 * Phase 3 scaffold — v5.0.0 "Eureka"
 *
 * Usage:
 *   cortex                          # interactive TUI mode
 *   cortex "explain this function"  # one-shot query
 *   git diff | cortex "review"      # pipe mode
 *   cortex --agent code-reviewer    # use specific agent
 *   cortex --mode plan              # read-only mode
 *   cortex --output json            # JSON output
 */

import { parseArgs } from 'util'

export interface CliOptions {
  query?: string
  agent?: string
  mode?: 'default' | 'plan' | 'dontAsk'
  output?: 'text' | 'json' | 'markdown'
  project?: string
  headless?: boolean
  noMemory?: boolean
  file?: string
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        agent: { type: 'string', short: 'a' },
        mode: { type: 'string', short: 'm' },
        output: { type: 'string', short: 'o' },
        project: { type: 'string', short: 'p' },
        headless: { type: 'boolean' },
        'no-memory': { type: 'boolean' },
        file: { type: 'string', short: 'f' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
      strict: false
    })

    if (values.help) {
      printHelp()
      process.exit(0)
    }

    if (values.version) {
      console.log('cortex v5.0.0-alpha.1 "Eureka"')
      process.exit(0)
    }

    return {
      query: positionals[0],
      agent: values.agent as string | undefined,
      mode: values.mode as CliOptions['mode'],
      output: (values.output as CliOptions['output']) ?? 'markdown',
      project: values.project as string | undefined ?? process.cwd(),
      headless: values.headless as boolean | undefined ?? false,
      noMemory: values['no-memory'] as boolean | undefined ?? false,
      file: values.file as string | undefined,
    }
  } catch {
    return { query: argv[0], project: process.cwd() }
  }
}

function printHelp(): void {
  console.log(`
cortex — AI coding assistant (v5.0.0 "Eureka")

Usage:
  cortex [query]              One-shot query
  cortex                      Interactive TUI mode
  git diff | cortex [query]   Pipe mode

Options:
  -a, --agent <name>          Use specific agent (from .cortex/agents/)
  -m, --mode <mode>           Permission mode: default|plan|dontAsk
  -o, --output <format>       Output format: text|json|markdown (default: markdown)
  -p, --project <path>        Project path (default: cwd)
  -f, --file <path>           Attach file content to query
  --headless                  No TUI, no interactive prompts
  --no-memory                 Skip memory load (stateless run)
  -h, --help                  Show this help
  -v, --version               Show version

Examples:
  cortex "how does auth work?"
  cortex --agent api-reviewer "review src/api/"
  cortex --mode plan "analyze security vulnerabilities"
  cortex --output json "list all API endpoints" | jq .
  git diff HEAD | cortex "review these changes"
`)
}

export async function runCli(): Promise<void> {
  const options = parseCliArgs()

  const hasPipe = !process.stdin.isTTY
  if (hasPipe && !options.query) {
    const chunks: Buffer[] = []
    process.stdin.on('data', chunk => chunks.push(chunk))
    await new Promise<void>(resolve => process.stdin.on('end', resolve))
    const piped = Buffer.concat(chunks).toString('utf-8').trim()
    options.query = piped ? `${piped}\n\n[end of piped input]` : options.query
  }

  if (!options.query && !options.headless) {
    console.log('cortex v5.0.0 "Eureka" — interactive mode coming in Phase 3 full release')
    console.log('For now: cortex "your query here"')
    process.exit(0)
  }

  console.log(JSON.stringify({
    status: 'scaffold',
    message: 'CLI full implementation coming in Phase 3. Adapter interfaces ready.',
    options
  }, null, 2))
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('cortex')) {
  runCli().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
