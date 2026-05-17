import { execFile } from 'child_process'
import { promisify } from 'util'
import type { IpcMain, BrowserWindow } from 'electron'
import {
  getAppInsightsConfig,
  setAppInsightsConfig,
  clearAppInsightsConfig,
  getServiceConfig,
} from '../services/settings-service'
import {
  getConnectionStatus,
  refreshTokenNow,
  startKeepAlive,
  stopKeepAlive,
} from '../services/skills/builtin/appinsights-tools'

const execFileAsync = promisify(execFile)

async function checkAzCliInstalled(): Promise<boolean> {
  try {
    await execFileAsync('az', ['--version'], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function azLogin(): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync('az', ['login'], { timeout: 120_000 })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ENOENT')) {
      return { success: false, error: 'Azure CLI chưa được cài đặt. Cài tại: https://aka.ms/install-azure-cli' }
    }
    return { success: false, error: msg }
  }
}

async function testConnection(): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  const config = getServiceConfig('appinsights')
  if (!config?.app_id) return { success: false, error: 'Chưa cấu hình Application ID' }

  const start = Date.now()
  try {
    await refreshTokenNow()
    const status = getConnectionStatus()
    if (!status.connected) return { success: false, error: status.error || 'Không thể kết nối' }
    return { success: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerAppInsightsIPC(ipcMain: IpcMain, _getMainWindow: () => BrowserWindow | null): void {

  ipcMain.handle('appinsights:getConfig', () => {
    return getAppInsightsConfig()
  })

  ipcMain.handle('appinsights:setConfig', (_event, config: {
    appId: string; authMethod: string; apiKey?: string;
    tenantId?: string; clientId?: string; clientSecret?: string; timespan?: string
  }) => {
    setAppInsightsConfig(config)
    if (config.appId) startKeepAlive()
    return { success: true }
  })

  ipcMain.handle('appinsights:clearConfig', () => {
    stopKeepAlive()
    clearAppInsightsConfig()
    return { success: true }
  })

  ipcMain.handle('appinsights:checkAzCli', async () => {
    return { installed: await checkAzCliInstalled() }
  })

  ipcMain.handle('appinsights:login', async () => {
    return azLogin()
  })

  ipcMain.handle('appinsights:test', async () => {
    return testConnection()
  })

  ipcMain.handle('appinsights:status', () => {
    return getConnectionStatus()
  })

  ipcMain.handle('appinsights:refreshToken', async () => {
    try {
      await refreshTokenNow()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
