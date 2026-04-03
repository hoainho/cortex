import type { IpcMain } from 'electron'
import { loadInstructionsForProject } from '../services/cortex-md/cortex-md-loader'
import { setCortexMdContent } from '../services/memory/core-memory'

export function registerCortexMdIPC(ipcMain: IpcMain): void {
  ipcMain.handle('cortex-md:list', async (_event, projectPath: string) => {
    const instructions = await loadInstructionsForProject(projectPath)
    return {
      sources: instructions.sources.map(s => ({
        filePath: s.filePath,
        scope: s.scope,
        tokenEstimate: s.tokenEstimate
      })),
      rulesCount: instructions.rules.length,
      totalTokenEstimate: instructions.totalTokenEstimate
    }
  })

  ipcMain.handle('cortex-md:reload', async (_event, projectId: string, projectPath: string) => {
    const instructions = await loadInstructionsForProject(projectPath)
    setCortexMdContent(projectId, instructions.mergedContent)
    return { ok: true, totalTokenEstimate: instructions.totalTokenEstimate }
  })

  ipcMain.handle('cortex-md:load', async (_event, projectId: string, projectPath: string) => {
    const instructions = await loadInstructionsForProject(projectPath)
    if (instructions.mergedContent.trim()) {
      setCortexMdContent(projectId, instructions.mergedContent)
    }
    return instructions
  })
}
