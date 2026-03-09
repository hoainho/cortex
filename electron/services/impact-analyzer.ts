/**
 * Impact Analyzer — Determines blast radius of code changes
 *
 * Given changed file(s), finds:
 * - Direct dependents (files that import the changed file)
 * - Indirect dependents (transitive imports)
 * - Same-module files (siblings in same directory)
 * - Risk assessment
 */

import { getDb } from './db'

export interface ImpactResult {
  directlyAffected: { filePath: string; functionName?: string; reason: string }[]
  indirectlyAffected: { filePath: string; reason: string }[]
  riskLevel: 'low' | 'medium' | 'high'
  summary: string
}

export function analyzeImpact(projectId: string, changedFiles: string[]): ImpactResult {
  const db = getDb()

  // Get all chunks with their dependencies
  const chunks = db
    .prepare(
      'SELECT relative_path, chunk_type, name, dependencies, language FROM chunks WHERE project_id = ?'
    )
    .all(projectId) as Array<{
    relative_path: string
    chunk_type: string
    name: string | null
    dependencies: string
    language: string
  }>

  const changedSet = new Set(changedFiles.map((f) => f.toLowerCase()))

  // Find direct dependents — files that import any changed file
  const directlyAffected: ImpactResult['directlyAffected'] = []
  const directPaths = new Set<string>()

  for (const chunk of chunks) {
    if (changedSet.has(chunk.relative_path.toLowerCase())) continue

    const deps = JSON.parse(chunk.dependencies || '[]') as string[]
    for (const dep of deps) {
      const depLower = dep.toLowerCase()
      for (const changed of changedFiles) {
        if (depLower.includes(changed.toLowerCase()) || changed.toLowerCase().includes(depLower)) {
          if (!directPaths.has(chunk.relative_path)) {
            directPaths.add(chunk.relative_path)
            directlyAffected.push({
              filePath: chunk.relative_path,
              functionName: chunk.name || undefined,
              reason: `Import ${dep} (${chunk.chunk_type})`
            })
          }
        }
      }
    }
  }

  // Find indirect dependents — files that import direct dependents
  const indirectlyAffected: ImpactResult['indirectlyAffected'] = []
  const indirectPaths = new Set<string>()

  for (const chunk of chunks) {
    if (changedSet.has(chunk.relative_path.toLowerCase())) continue
    if (directPaths.has(chunk.relative_path)) continue

    const deps = JSON.parse(chunk.dependencies || '[]') as string[]
    for (const dep of deps) {
      for (const directPath of directPaths) {
        if (dep.toLowerCase().includes(directPath.toLowerCase()) ||
            directPath.toLowerCase().includes(dep.toLowerCase())) {
          if (!indirectPaths.has(chunk.relative_path)) {
            indirectPaths.add(chunk.relative_path)
            indirectlyAffected.push({
              filePath: chunk.relative_path,
              reason: `Transitive via ${directPath}`
            })
          }
        }
      }
    }
  }

  // Add same-directory files as indirect
  for (const changed of changedFiles) {
    const dir = changed.split('/').slice(0, -1).join('/')
    if (!dir) continue

    for (const chunk of chunks) {
      if (changedSet.has(chunk.relative_path.toLowerCase())) continue
      if (directPaths.has(chunk.relative_path)) continue
      if (indirectPaths.has(chunk.relative_path)) continue

      if (chunk.relative_path.startsWith(dir + '/')) {
        indirectPaths.add(chunk.relative_path)
        indirectlyAffected.push({
          filePath: chunk.relative_path,
          reason: `Same module as ${changed}`
        })
      }
    }
  }

  // Risk assessment
  const totalAffected = directlyAffected.length + indirectlyAffected.length
  let riskLevel: ImpactResult['riskLevel'] = 'low'
  if (totalAffected > 20 || directlyAffected.length > 10) {
    riskLevel = 'high'
  } else if (totalAffected > 5 || directlyAffected.length > 3) {
    riskLevel = 'medium'
  }

  const summary = `Thay đổi ${changedFiles.length} file ảnh hưởng trực tiếp ${directlyAffected.length} file, gián tiếp ${indirectlyAffected.length} file. Mức rủi ro: ${riskLevel === 'high' ? 'Cao' : riskLevel === 'medium' ? 'Trung bình' : 'Thấp'}.`

  return {
    directlyAffected: directlyAffected.slice(0, 50),
    indirectlyAffected: indirectlyAffected.slice(0, 50),
    riskLevel,
    summary
  }
}
