import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { watch, FSWatcher } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { EventEmitter } from 'events'
import { parseMarkdownAgent } from './markdown-agent-loader'
import type { MarkdownAgentDefinition } from './types'

const SCAN_DEBOUNCE_MS = 500

const AGENT_TEMPLATE = `---
name: my-agent
description: Describe when Claude should use this agent. Be specific.
model: balanced
memory: project
maxTurns: 30
---

You are a specialized assistant. Describe your role, expertise, and behavior here.

When invoked:
1. Read your agent memory for accumulated knowledge
2. Analyze the request carefully
3. Execute with precision

Update your agent memory with discoveries and patterns after completing tasks.
`

export class MarkdownAgentRegistry extends EventEmitter {
  private agents = new Map<string, MarkdownAgentDefinition>()
  private watchers: FSWatcher[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private projectPath: string | null = null

  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath
    this.scan()
    this.startWatching()
  }

  scan(): void {
    this.agents.clear()

    const userDir = join(homedir(), '.cortex', 'agents')
    if (existsSync(userDir)) {
      this.loadFromDir(userDir, 'user')
    }

    if (this.projectPath) {
      const projectDir = join(this.projectPath, '.cortex', 'agents')
      if (existsSync(projectDir)) {
        this.loadFromDir(projectDir, 'project')
      }
    }
  }

  private loadFromDir(dir: string, scope: 'project' | 'user'): void {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        const filePath = join(dir, file)
        const agent = parseMarkdownAgent(filePath, scope)
        if (agent) {
          this.agents.set(agent.name, agent)
        }
      }
    } catch (err) {
      console.warn('[MarkdownAgentRegistry] Failed to scan dir:', dir, err)
    }
  }

  private startWatching(): void {
    this.stopWatching()
    const dirs = [join(homedir(), '.cortex', 'agents')]
    if (this.projectPath) {
      dirs.push(join(this.projectPath, '.cortex', 'agents'))
    }

    for (const dir of dirs) {
      try {
        const watcher = watch(dir, { persistent: false }, (_event, filename) => {
          if (filename?.endsWith('.md')) this.scheduleRescan()
        })
        this.watchers.push(watcher)
      } catch {
        // directory may not exist yet
      }
    }
  }

  private stopWatching(): void {
    for (const w of this.watchers) {
      try { w.close() } catch { /* ignore */ }
    }
    this.watchers = []
  }

  private scheduleRescan(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.scan()
      this.emit('agents:changed', this.getAll())
    }, SCAN_DEBOUNCE_MS)
  }

  getAll(): MarkdownAgentDefinition[] {
    return Array.from(this.agents.values())
  }

  get(name: string): MarkdownAgentDefinition | null {
    return this.agents.get(name) ?? null
  }

  has(name: string): boolean {
    return this.agents.has(name)
  }

  createTemplate(projectPath: string): string {
    const dir = join(projectPath, '.cortex', 'agents')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'my-agent.md')
    writeFileSync(filePath, AGENT_TEMPLATE, 'utf-8')
    return resolve(filePath)
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.stopWatching()
    this.removeAllListeners()
    this.agents.clear()
  }
}

export const markdownAgentRegistry = new MarkdownAgentRegistry()
