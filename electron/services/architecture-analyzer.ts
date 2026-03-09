/**
 * Architecture Analyzer — Extracts structural insights from indexed code
 *
 * Analyzes chunks in DB to produce:
 * - Module dependency graph
 * - Entry points (files imported by nothing)
 * - Hub files (most imported)
 * - Architecture layers detection
 * - Technology stack summary
 */

import { getDb } from './db'

export interface ArchitectureAnalysis {
  entryPoints: string[]
  hubFiles: { path: string; importedBy: number }[]
  layers: { name: string; files: string[] }[]
  dependencyGraph: { source: string; target: string }[]
  techStack: { name: string; version?: string }[]
  stats: {
    totalFiles: number
    totalFunctions: number
    totalClasses: number
    totalInterfaces: number
  }
}

export function analyzeArchitecture(projectId: string): ArchitectureAnalysis {
  const db = getDb()

  // Get all chunks for this project
  const chunks = db
    .prepare(
      'SELECT relative_path, chunk_type, name, dependencies, exports, language FROM chunks WHERE project_id = ?'
    )
    .all(projectId) as Array<{
    relative_path: string
    chunk_type: string
    name: string | null
    dependencies: string
    exports: string
    language: string
  }>

  // Build file → imports mapping
  const fileImports = new Map<string, Set<string>>()
  const allFiles = new Set<string>()
  const importedFiles = new Map<string, number>() // file → how many files import it

  for (const chunk of chunks) {
    allFiles.add(chunk.relative_path)

    const deps = JSON.parse(chunk.dependencies || '[]') as string[]
    if (deps.length > 0) {
      if (!fileImports.has(chunk.relative_path)) {
        fileImports.set(chunk.relative_path, new Set())
      }
      for (const dep of deps) {
        fileImports.get(chunk.relative_path)!.add(dep)
        importedFiles.set(dep, (importedFiles.get(dep) || 0) + 1)
      }
    }
  }

  // Build dependency graph
  const dependencyGraph: { source: string; target: string }[] = []
  for (const [source, targets] of fileImports) {
    for (const target of targets) {
      dependencyGraph.push({ source, target })
    }
  }

  // Find entry points — files that are not imported by anyone
  const entryPoints: string[] = []
  for (const file of allFiles) {
    if (!importedFiles.has(file)) {
      entryPoints.push(file)
    }
  }

  // Find hub files — most imported
  const hubFiles = Array.from(importedFiles.entries())
    .map(([path, count]) => ({ path, importedBy: count }))
    .sort((a, b) => b.importedBy - a.importedBy)
    .slice(0, 20)

  // Detect architecture layers
  const layers = detectLayers(chunks)

  // Extract tech stack from config chunks
  const techStack = extractTechStack(chunks)

  // Count stats
  const stats = {
    totalFiles: allFiles.size,
    totalFunctions: chunks.filter((c) => c.chunk_type === 'function').length,
    totalClasses: chunks.filter((c) => c.chunk_type === 'class').length,
    totalInterfaces: chunks.filter((c) => c.chunk_type === 'interface').length
  }

  return {
    entryPoints: entryPoints.slice(0, 30),
    hubFiles,
    layers,
    dependencyGraph: dependencyGraph.slice(0, 200), // Limit for display
    techStack,
    stats
  }
}

function detectLayers(
  chunks: Array<{ relative_path: string; chunk_type: string }>
): { name: string; files: string[] }[] {
  const layerPatterns: { name: string; patterns: RegExp[] }[] = [
    { name: 'Routes / Controllers', patterns: [/route/i, /controller/i, /handler/i, /endpoint/i] },
    { name: 'Services / Business Logic', patterns: [/service/i, /usecase/i, /interactor/i] },
    { name: 'Models / Database', patterns: [/model/i, /schema/i, /migration/i, /entity/i, /repository/i] },
    { name: 'Components / UI', patterns: [/component/i, /view/i, /page/i, /screen/i, /widget/i] },
    { name: 'Utilities / Helpers', patterns: [/util/i, /helper/i, /lib\//i, /common/i, /shared/i] },
    { name: 'Configuration', patterns: [/config/i, /setting/i, /env/i] },
    { name: 'Tests', patterns: [/test/i, /spec/i, /__test__/i] },
    { name: 'Types / Interfaces', patterns: [/type/i, /interface/i, /dto/i] }
  ]

  const layers: { name: string; files: string[] }[] = []
  const categorizedFiles = new Set<string>()

  for (const layer of layerPatterns) {
    const files = new Set<string>()
    for (const chunk of chunks) {
      if (categorizedFiles.has(chunk.relative_path)) continue
      for (const pattern of layer.patterns) {
        if (pattern.test(chunk.relative_path)) {
          files.add(chunk.relative_path)
          categorizedFiles.add(chunk.relative_path)
          break
        }
      }
    }
    if (files.size > 0) {
      layers.push({ name: layer.name, files: Array.from(files) })
    }
  }

  return layers
}

function extractTechStack(
  chunks: Array<{ relative_path: string; content?: string; language: string }>
): { name: string; version?: string }[] {
  const languages = new Set<string>()
  for (const chunk of chunks) {
    if (chunk.language && chunk.language !== 'text') {
      languages.add(chunk.language)
    }
  }

  const stack: { name: string; version?: string }[] = []

  // Add detected languages
  for (const lang of languages) {
    stack.push({ name: lang })
  }

  // Common framework detection from file paths
  const allPaths = chunks.map((c) => c.relative_path).join('\n')
  if (allPaths.includes('next.config')) stack.push({ name: 'Next.js' })
  if (allPaths.includes('vite.config')) stack.push({ name: 'Vite' })
  if (allPaths.includes('nuxt.config')) stack.push({ name: 'Nuxt' })
  if (allPaths.includes('angular.json')) stack.push({ name: 'Angular' })
  if (allPaths.includes('tailwind.config')) stack.push({ name: 'Tailwind CSS' })
  if (allPaths.includes('prisma/schema')) stack.push({ name: 'Prisma' })
  if (allPaths.includes('Dockerfile')) stack.push({ name: 'Docker' })
  if (allPaths.includes('docker-compose')) stack.push({ name: 'Docker Compose' })

  return stack
}
