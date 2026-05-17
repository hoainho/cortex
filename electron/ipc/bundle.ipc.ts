import type { IpcMain, BrowserWindow } from 'electron'
import { dialog } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { exportBundle, importBundle, previewBundle } from '../services/backup/bundle-service'
import type { PathMapping } from '../services/backup/bundle-service'

export function registerBundleIPC(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('bundle:choose-export-path', async () => {
    const win = getMainWindow()
    if (!win) return null
    const defaultName = `cortex-backup-${new Date().toISOString().slice(0, 10)}.cortex`
    const result = await dialog.showSaveDialog(win, {
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters: [{ name: 'Cortex Backup', extensions: ['cortex'] }]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('bundle:choose-import-path', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Cortex Backup', extensions: ['cortex'] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('bundle:preview', async (_event, bundlePath: string, password: string) => {
    return previewBundle(bundlePath, password)
  })

  ipcMain.handle('bundle:export', async (_event, outputPath: string, password: string) => {
    const win = getMainWindow()
    return exportBundle(outputPath, password, (pct, msg) => {
      win?.webContents.send('bundle:export-progress', { pct, msg })
    })
  })

  ipcMain.handle('bundle:import', async (
    _event,
    bundlePath: string,
    password: string,
    pathMappings?: PathMapping[]
  ) => {
    const win = getMainWindow()
    return importBundle(bundlePath, password, pathMappings, (pct, msg) => {
      win?.webContents.send('bundle:import-progress', { pct, msg })
    })
  })
}
