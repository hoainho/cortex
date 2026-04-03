/**
 * CORTEX.md Convention Types — v5.0.0 "Eureka"
 * Project instruction files auto-discovered and injected into Core Memory
 * Inspired by Claude Code's CLAUDE.md system
 */

export type CortexMdScope = 'managed' | 'project' | 'user'

export interface ParsedCortexMd {
  filePath: string
  content: string         // processed: HTML comments stripped, imports expanded
  rawContent: string      // original file content
  imports: string[]       // resolved absolute paths of @import files
  wordCount: number
  tokenEstimate: number   // rough estimate: chars / 4
}

export interface CortexMdSource {
  filePath: string
  scope: CortexMdScope
  content: string
  tokenEstimate: number
}

export interface LoadedInstructions {
  sources: CortexMdSource[]
  mergedContent: string        // concatenated with section headers
  totalTokenEstimate: number
  rules: CortexMdRule[]        // path-scoped rules from .cortex/rules/
}

export interface CortexMdRule {
  filePath: string
  scope: CortexMdScope
  content: string
  paths?: string[]   // glob patterns — undefined = unconditional
  exclude?: string[] // glob patterns to exclude
}
