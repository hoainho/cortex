import { watch, FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { EventEmitter } from 'events'
import { loadInstructionsForProject } from './cortex-md-loader'
import type { LoadedInstructions } from './types'

const DEBOUNCE_MS = 500
const WATCH_FILENAMES = ['CORTEX.md', 'CLAUDE.md', 'AGENTS.md']

export class CortexMdWatcher extends EventEmitter {
  private watchers: FSWatcher[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private projectPath: string

  constructor(projectPath: string) {
    super()
    this.projectPath = projectPath
  }

  start(): void {
    const dirsToWatch = [
      this.projectPath,
      join(this.projectPath, '.cortex'),
      join(this.projectPath, '.cortex', 'rules'),
      join(homedir(), '.cortex'),
      join(homedir(), '.cortex', 'rules'),
    ]

    for (const dir of dirsToWatch) {
      try {
        const watcher = watch(dir, { persistent: false }, (_event, filename) => {
          if (!filename) return
          const isRelevant = WATCH_FILENAMES.some(f => filename === f) || filename.endsWith('.md')
          if (isRelevant) this.scheduleReload()
        })
        this.watchers.push(watcher)
      } catch {
        // directory may not exist yet
      }
    }
  }

  private scheduleReload(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.reload(), DEBOUNCE_MS)
  }

  private async reload(): Promise<void> {
    try {
      const instructions = await loadInstructionsForProject(this.projectPath)
      this.emit('cortex-md:changed', instructions)
    } catch (err) {
      console.error('[CortexMdWatcher] Reload failed:', err)
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    for (const w of this.watchers) {
      try { w.close() } catch { /* ignore */ }
    }
    this.watchers = []
    this.removeAllListeners()
  }
}

export type { LoadedInstructions }
