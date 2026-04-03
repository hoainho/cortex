import type { IpcMain } from 'electron'
import { markdownAgentRegistry } from '../services/agents/markdown/markdown-agent-registry'

export function registerAgentsIPC(ipcMain: IpcMain): void {
  ipcMain.handle('markdown-agents:list', (_event, projectPath?: string) => {
    if (projectPath) {
      markdownAgentRegistry.setProjectPath(projectPath)
    }
    return markdownAgentRegistry.getAll().map(a => ({
      name: a.name,
      description: a.description,
      model: a.model,
      memory: a.memory,
      scope: a.scope,
      filePath: a.filePath,
      color: a.color,
      tools: a.tools,
      skills: a.skills
    }))
  })

  ipcMain.handle('agents:create-template', (_event, projectPath: string) => {
    return markdownAgentRegistry.createTemplate(projectPath)
  })

  ipcMain.handle('agents:reload', (_event, projectPath?: string) => {
    if (projectPath) markdownAgentRegistry.setProjectPath(projectPath)
    else markdownAgentRegistry.scan()
    return { count: markdownAgentRegistry.getAll().length }
  })
}
