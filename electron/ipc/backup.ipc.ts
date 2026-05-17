import type { IpcMain } from 'electron'
import { runBackupNow, listBackups, getLastBackupTime } from '../services/backup/auto-backup'

export function registerBackupIPC(ipcMain: IpcMain): void {
  ipcMain.handle('backup:list', () => listBackups())
  ipcMain.handle('backup:run-now', () => runBackupNow())
  ipcMain.handle('backup:last-time', () => getLastBackupTime())
}
