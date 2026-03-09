/**
 * Terminal — Safe command execution with allowlist
 */
import { exec, spawn, type ChildProcess } from 'child_process'

export interface TerminalOptions {
  cwd?: string
  timeout?: number
  env?: Record<string, string>
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  command: string
  duration: number
}

const ALLOWED_COMMANDS = [
  'ls', 'cat', 'grep', 'find', 'pwd', 'echo', 'which', 'wc', 'head', 'tail',
  'sort', 'uniq', 'tree', 'du', 'df', 'env', 'printenv', 'date',
  'mkdir', 'cp', 'mv', 'touch', 'rm', 'curl', 'wget',
  'npm', 'npx', 'node', 'python3', 'python', 'pip', 'pip3',
  'git', 'tsc', 'eslint', 'prettier',
  'docker', 'make', 'cargo', 'go', 'rustc'
]
const BLOCKED_PATTERNS = [/rm\s+-rf\s+\//, /sudo\b/, /chmod\s+777/, /mkfs/, /dd\s+if=/, /:(){ :|:& };:/, /fork\s*bomb/i, />\/dev\/sda/]

export function blockDangerousCommands(command: string): string | null {
  // Check blocked patterns against full command string
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) return `Blocked dangerous command: ${command}`
  }

  // Split by pipe/chain operators and check EVERY segment
  const segments = command.split(/\s*(?:\|{1,2}|&&|;)\s*/).filter(Boolean)
  for (const segment of segments) {
    const baseCmd = segment.trim().split(/\s+/)[0]?.replace(/^.*\//, '')
    if (!baseCmd) continue
    if (!ALLOWED_COMMANDS.includes(baseCmd)) {
      return `Command '${baseCmd}' not in allowlist (found in chain: ${command}). Allowed: ${ALLOWED_COMMANDS.join(', ')}`
    }
  }

  return null
}

export async function runCommand(command: string, options?: TerminalOptions): Promise<CommandResult> {
  const blocked = blockDangerousCommands(command)
  if (blocked) {
    return { stdout: '', stderr: blocked, exitCode: 1, command, duration: 0 }
  }

  const timeout = options?.timeout || 30000
  const start = Date.now()

  return new Promise(resolve => {
    exec(command, {
      timeout,
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env }
    }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || (err ? String(err) : ''),
        exitCode: err ? (err as any).code || 1 : 0,
        command,
        duration: Date.now() - start
      })
    })
  })
}

export function streamCommand(command: string, onData: (data: string) => void, options?: TerminalOptions): ChildProcess | null {
  const blocked = blockDangerousCommands(command)
  if (blocked) {
    onData(`Error: ${blocked}`)
    return null
  }

  const child = spawn('sh', ['-c', command], {
    cwd: options?.cwd,
    env: { ...process.env, ...options?.env }
  })

  child.stdout?.on('data', (data: Buffer) => onData(data.toString()))
  child.stderr?.on('data', (data: Buffer) => onData(data.toString()))

  return child
}