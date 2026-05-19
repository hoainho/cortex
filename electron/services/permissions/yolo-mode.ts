import { homedir, platform } from 'os'
import { resolve, join } from 'path'
import { getSetting, setSetting } from '../settings-service'

const YOLO_SETTING_KEY = 'yolo_mode_enabled'

export function isYoloModeEnabled(): boolean {
  return getSetting(YOLO_SETTING_KEY) === 'true'
}

export function setYoloMode(enabled: boolean): void {
  setSetting(YOLO_SETTING_KEY, enabled ? 'true' : 'false')
}

function home(): string {
  return homedir()
}

function macOSProtectedPaths(): string[] {
  return [
    '/System', '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin',
    '/var', '/private/var',
    '/Library/LaunchDaemons', '/Library/LaunchAgents',
    join(home(), 'Library', 'Keychains'),
    join(home(), 'Library', 'LaunchAgents'),
  ]
}

function linuxProtectedPaths(): string[] {
  return [
    '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin',
    '/boot', '/proc', '/sys', '/dev',
    '/var/log', '/var/lib',
  ]
}

function windowsProtectedPaths(): string[] {
  return [
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    'C:\\ProgramData',
  ]
}

function userSecretPaths(): string[] {
  const h = home()
  return [
    join(h, '.ssh'),
    join(h, '.aws'),
    join(h, '.gnupg'),
    join(h, '.config', 'gcloud'),
    join(h, '.kube'),
    join(h, '.docker'),
    join(h, '.netrc'),
    join(h, '.npmrc'),
    join(h, '.pypirc'),
  ]
}

export function isAlwaysProtectedPath(absolutePath: string): boolean {
  const resolved = resolve(absolutePath)
  const sys = platform() === 'darwin'
    ? macOSProtectedPaths()
    : platform() === 'win32'
      ? windowsProtectedPaths()
      : linuxProtectedPaths()
  const guarded = [...sys, ...userSecretPaths()]
  for (const blocked of guarded) {
    const resolvedBlocked = resolve(blocked)
    if (resolved === resolvedBlocked) return true
    if (resolved.startsWith(resolvedBlocked + (platform() === 'win32' ? '\\' : '/'))) return true
  }
  return false
}
