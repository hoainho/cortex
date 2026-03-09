/**
 * Estimate Service — Estimates feature complexity and effort
 *
 * Given a feature description, searches the brain for related code areas
 * and estimates effort based on affected modules.
 */

import { searchChunksHybrid, searchChunks } from './brain-engine'

export interface Estimate {
  effort: { days: number; range: [number, number] }
  affectedModules: string[]
  complexity: 'simple' | 'moderate' | 'complex'
  breakdown: { area: string; effort: number; description: string }[]
}

export async function estimateFeature(projectId: string, description: string): Promise<Estimate> {
  // Search for relevant code areas
  let relevantChunks: any[]
  try {
    relevantChunks = await searchChunksHybrid(projectId, description, 20)
  } catch {
    relevantChunks = searchChunks(projectId, description, 20)
  }

  // Group by module (directory)
  const moduleMap = new Map<string, { files: Set<string>; types: Set<string> }>()

  for (const chunk of relevantChunks) {
    const dir = chunk.relativePath.split('/').slice(0, -1).join('/') || 'root'
    if (!moduleMap.has(dir)) {
      moduleMap.set(dir, { files: new Set(), types: new Set() })
    }
    moduleMap.get(dir)!.files.add(chunk.relativePath)
    moduleMap.get(dir)!.types.add(chunk.chunkType)
  }

  const affectedModules = Array.from(moduleMap.keys())

  // Estimate effort per module
  const breakdown: Estimate['breakdown'] = []
  let totalEffort = 0

  for (const [module, data] of moduleMap) {
    const fileCount = data.files.size
    const hasTests = module.toLowerCase().includes('test')
    const isConfig = module.toLowerCase().includes('config')

    let effort: number
    let desc: string

    if (hasTests) {
      effort = fileCount * 0.3
      desc = `Cập nhật ${fileCount} test files`
    } else if (isConfig) {
      effort = fileCount * 0.2
      desc = `Cập nhật ${fileCount} config files`
    } else if (data.types.has('route') || data.types.has('class')) {
      effort = fileCount * 0.8
      desc = `Sửa đổi ${fileCount} files (routes/classes)`
    } else {
      effort = fileCount * 0.5
      desc = `Sửa đổi ${fileCount} files`
    }

    totalEffort += effort
    breakdown.push({ area: module, effort: Math.round(effort * 10) / 10, description: desc })
  }

  // Add buffer for new code creation
  const newCodeEffort = totalEffort * 0.3
  if (newCodeEffort > 0) {
    breakdown.push({
      area: 'New code',
      effort: Math.round(newCodeEffort * 10) / 10,
      description: 'Viết code mới + integration'
    })
    totalEffort += newCodeEffort
  }

  // Add testing buffer
  const testingEffort = totalEffort * 0.2
  breakdown.push({
    area: 'Testing & QA',
    effort: Math.round(testingEffort * 10) / 10,
    description: 'Unit tests + integration tests'
  })
  totalEffort += testingEffort

  // Determine complexity
  let complexity: Estimate['complexity'] = 'simple'
  if (affectedModules.length > 5 || totalEffort > 5) {
    complexity = 'complex'
  } else if (affectedModules.length > 2 || totalEffort > 2) {
    complexity = 'moderate'
  }

  // Convert to days (1 day = 6 productive hours)
  const days = Math.max(0.5, Math.round(totalEffort * 10) / 10)
  const range: [number, number] = [
    Math.round(days * 0.7 * 10) / 10,
    Math.round(days * 1.5 * 10) / 10
  ]

  return {
    effort: { days, range },
    affectedModules,
    complexity,
    breakdown: breakdown.sort((a, b) => b.effort - a.effort)
  }
}
