import { BrowserWindow, session } from 'electron'
import type { IpcMain } from 'electron'
import { getSetting, setSetting } from '../services/settings-service'
import { findMCPServerByPresetId, updateMCPServerEnv } from '../services/skills/mcp/mcp-manager'

const xoxcKey = (projectId: string) => `slack_xoxc_${projectId}`
const xoxdKey = (projectId: string) => `slack_xoxd_${projectId}`
const workspaceKey = (projectId: string) => `slack_workspace_${projectId}`

export function getSlackCredentials(projectId: string) {
  return {
    xoxc: getSetting(xoxcKey(projectId)),
    xoxd: getSetting(xoxdKey(projectId)),
    workspace: getSetting(workspaceKey(projectId)),
  }
}

export function clearSlackCredentials(projectId: string): void {
  setSetting(xoxcKey(projectId), '', false)
  setSetting(xoxdKey(projectId), '', false)
  setSetting(workspaceKey(projectId), '', false)
}

export function registerSlackIPC(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {

  ipcMain.handle('slack:getCredentials', (_event, projectId: string) => {
    const creds = getSlackCredentials(projectId)
    return { connected: !!(creds.xoxc && creds.xoxd), workspace: creds.workspace }
  })

  ipcMain.handle('slack:login', async (_event, projectId: string) => {
    return new Promise<{ success: boolean; workspace?: string; error?: string }>((resolve) => {
      const mainWindow = getMainWindow()
      const partitionKey = `persist:slack_${projectId}`
      const slackSession = session.fromPartition(partitionKey)

      slackSession.clearStorageData({ storages: ['cookies'] }).catch(() => {})

      const authWin = new BrowserWindow({
        width: 1000,
        height: 750,
        title: 'Đăng nhập Slack — Cortex',
        parent: mainWindow || undefined,
        modal: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, partition: partitionKey },
      })

      authWin.loadURL('https://slack.com/workspace-signin')

      let resolved = false
      const finish = (result: { success: boolean; workspace?: string; error?: string }) => {
        if (resolved) return
        resolved = true
        clearInterval(cookieCheckInterval)
        resolve(result)
      }

      const cookieCheckInterval = setInterval(async () => {
        try {
          if (authWin.isDestroyed()) return

          const allCookies = await slackSession.cookies.get({})
          const slackCookies = allCookies.filter(c => c.domain?.includes('slack.com'))

          let xoxdValue: string | null = null
          for (const c of slackCookies) {
            if (c.value?.startsWith('xoxd-')) { xoxdValue = c.value; break }
          }
          if (!xoxdValue) {
            const dCookie = slackCookies.find(c => c.name === 'd')
            if (dCookie?.value) xoxdValue = dCookie.value
          }

          if (!xoxdValue) {
            console.log('[Slack] not ready yet — waiting for xoxd cookie')
            return
          }

          // xoxc is stored in localStorage, not as a cookie in modern Slack
          const xoxcValue: string | null = await authWin.webContents.executeJavaScript(`
            (function() {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  const val = localStorage.getItem(key);
                  if (val && val.startsWith('xoxc-')) return val;
                  if (key && key.startsWith('xoxc-')) return key;
                }
                const raw = localStorage.getItem('localConfig_v2');
                if (raw) {
                  const obj = JSON.parse(raw);
                  const teams = obj.teams || obj.workspaces || {};
                  for (const t of Object.values(teams)) {
                    const token = t.token || t.xoxcToken;
                    if (token && token.startsWith('xoxc-')) return token;
                  }
                }
                return null;
              } catch(e) { return null; }
            })()
          `).catch(() => null)

          if (!xoxcValue) {
            console.log('[Slack] xoxd found but xoxc not in localStorage yet — retrying')
            return
          }

          // Extract workspace name from localConfig_v2 (more reliable than URL which resolves to 'app')
          let workspace: string | undefined
          try {
            const wsFromStorage: string | null = await authWin.webContents.executeJavaScript(`
              (function() {
                try {
                  const raw = localStorage.getItem('localConfig_v2');
                  if (!raw) return null;
                  const obj = JSON.parse(raw);
                  const teams = obj.teams || obj.workspaces || {};
                  const first = Object.values(teams)[0];
                  return (first && (first.domain || first.teamDomain || first.name)) || null;
                } catch(e) { return null; }
              })()
            `).catch(() => null)
            workspace = wsFromStorage || undefined
          } catch { }

          if (!workspace) {
            try {
              const url = authWin.isDestroyed() ? '' : authWin.webContents.getURL()
              const match = url.match(/https:\/\/([^.]+)\.slack\.com/)
              if (match && match[1] !== 'app') workspace = match[1]
            } catch { }
          }

          console.log(`[Slack] Login success — workspace=${workspace}, xoxc=${xoxcValue.substring(0, 12)}...`)
          setSetting(xoxcKey(projectId), xoxcValue, true)
          setSetting(xoxdKey(projectId), xoxdValue, true)
          if (workspace) setSetting(workspaceKey(projectId), workspace, false)

          const slackMCPServer = findMCPServerByPresetId('slack')
          if (slackMCPServer) {
            console.log(`[Slack] Found MCP server "${slackMCPServer.name}" (${slackMCPServer.id}) — injecting tokens`)
            updateMCPServerEnv(slackMCPServer.id, {
              SLACK_MCP_XOXC_TOKEN: xoxcValue,
              SLACK_MCP_XOXD_TOKEN: xoxdValue,
            }).then(r => console.log(`[Slack] MCP env update: ${r.success ? 'ok' : r.error}`))
              .catch(err => console.warn('[Slack] MCP env update failed:', err))
          } else {
            console.log('[Slack] No Slack MCP server installed yet — tokens saved, will be used when preset is installed')
          }

          clearInterval(cookieCheckInterval)
          if (!authWin.isDestroyed()) authWin.close()
          finish({ success: true, workspace })
        } catch (err) {
          console.log(`[Slack] poll error: ${err}`)
        }
      }, 2000)

      authWin.on('closed', () => {
        clearInterval(cookieCheckInterval)
        if (!resolved) finish({ success: false, error: 'Cửa sổ đăng nhập đã đóng trước khi hoàn tất' })
      })

      setTimeout(() => {
        clearInterval(cookieCheckInterval)
        if (!authWin.isDestroyed()) authWin.close()
        if (!resolved) finish({ success: false, error: 'Quá thời gian đăng nhập (5 phút)' })
      }, 5 * 60 * 1000)
    })
  })

  ipcMain.handle('slack:disconnect', (_event, projectId: string) => {
    clearSlackCredentials(projectId)
    return true
  })

  ipcMain.handle('slack:getTokensForMCP', (_event, projectId: string) => {
    const creds = getSlackCredentials(projectId)
    if (!creds.xoxc || !creds.xoxd) return null
    return { xoxc: creds.xoxc, xoxd: creds.xoxd, workspace: creds.workspace }
  })

  ipcMain.handle('slack:injectIntoMCP', async (_event, projectId: string) => {
    const creds = getSlackCredentials(projectId)
    if (!creds.xoxc || !creds.xoxd) return { success: false, error: 'Chưa có Slack credentials cho project này' }
    const server = findMCPServerByPresetId('slack')
    console.log(`[Slack] injectIntoMCP — server found: ${server ? `${server.name} (${server.id})` : 'null'}`)
    if (!server) return { success: false, error: 'Slack MCP server chưa được cài đặt. Cài từ MCP section trước.' }
    const result = await updateMCPServerEnv(server.id, {
      SLACK_MCP_XOXC_TOKEN: creds.xoxc,
      SLACK_MCP_XOXD_TOKEN: creds.xoxd,
    })
    console.log(`[Slack] injectIntoMCP result: ${result.success ? 'ok' : result.error}`)
    return result
  })
}
