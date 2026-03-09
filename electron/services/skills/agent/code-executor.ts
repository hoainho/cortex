/**
 * Code Executor — Sandboxed code execution via child_process
 */
import { execFile } from 'child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export interface ExecOptions {
  timeout?: number
  cwd?: string
  env?: Record<string, string>
}

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  language: string
}

const PYTHON_SANDBOX_PROLOGUE = `
# Cortex Security Sandbox — disable dangerous builtins
import os as _os
for _attr in ['system','popen','execl','execle','execlp','execlpe','execv','execve','execvp','execvpe',
              'spawnl','spawnle','spawnlp','spawnlpe','spawnv','spawnve','spawnvp','spawnvpe']:
    if hasattr(_os, _attr): setattr(_os, _attr, None)
try:
    import subprocess as _sub
    for _attr in ['run','call','check_call','check_output','Popen','getoutput','getstatusoutput']:
        if hasattr(_sub, _attr): setattr(_sub, _attr, None)
except ImportError: pass
try:
    import socket as _sock
    _sock.socket = None
except ImportError: pass
del _attr
`

const RUNTIME_MAP: Record<string, { cmd: string, ext: string }> = {
  javascript: { cmd: 'node', ext: '.js' },
  typescript: { cmd: 'npx', ext: '.ts' },
  python: { cmd: 'python3', ext: '.py' },
  bash: { cmd: 'sh', ext: '.sh' }
}

export function createSandboxDir(): string {
  const dir = join(tmpdir(), `cortex-sandbox-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanupSandbox(dir: string): void {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[CodeExecutor] Cleanup failed:', err)
  }
}

export async function executeCode(
  code: string,
  language: string,
  options?: ExecOptions
): Promise<ExecutionResult> {
  const runtime = RUNTIME_MAP[language]
  if (!runtime) {
    return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, duration: 0, language }
  }

  const sandboxDir = options?.cwd || createSandboxDir()
  const filePath = join(sandboxDir, `script${runtime.ext}`)
  const timeout = options?.timeout || 30000
  const start = Date.now()

  try {
    const finalCode = language === 'python' ? PYTHON_SANDBOX_PROLOGUE + code : code
    writeFileSync(filePath, finalCode)

    const baseArgs = language === 'typescript' ? ['tsx', filePath] : [filePath]
    const cmd = runtime.cmd

    const args = language === 'javascript' || language === 'typescript'
      ? ['--experimental-permission', `--allow-fs-read=${sandboxDir}`, `--allow-fs-write=${sandboxDir}`, ...baseArgs]
      : language === 'python'
        ? ['-I', ...baseArgs]
        : language === 'bash'
          ? ['--restricted', ...baseArgs]
          : baseArgs

    return await new Promise<ExecutionResult>((resolve) => {
      execFile(cmd, args, {
        timeout,
        cwd: sandboxDir,
        env: { ...process.env, ...options?.env, NODE_PATH: '' }
      }, (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || (err ? String(err) : ''),
          exitCode: err ? (err as any).code || 1 : 0,
          duration: Date.now() - start,
          language
        })
      })
    })
  } catch (err) {
    return { stdout: '', stderr: String(err), exitCode: 1, duration: Date.now() - start, language }
  } finally {
    if (!options?.cwd) cleanupSandbox(sandboxDir)
  }
}