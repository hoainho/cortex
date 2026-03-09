/**
 * Updater Service — Check for new versions via GitHub releases
 *
 * Manual check only (no auto-update module needed for MVP).
 * Compares current version against latest GitHub release tag.
 */

const CURRENT_VERSION = '1.0.0'
const GITHUB_REPO = 'hoainho/cortex' // Update with actual repo

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseUrl: string
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Cortex-App'
        },
        signal: AbortSignal.timeout(10000)
      }
    )

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases`
      }
    }

    const data = (await response.json()) as { tag_name: string; html_url: string }
    const latestVersion = data.tag_name.replace(/^v/, '')

    return {
      hasUpdate: compareVersions(latestVersion, CURRENT_VERSION) > 0,
      currentVersion: CURRENT_VERSION,
      latestVersion,
      releaseUrl: data.html_url
    }
  } catch {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`
    }
  }
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] || 0
    const bNum = bParts[i] || 0
    if (aNum > bNum) return 1
    if (aNum < bNum) return -1
  }

  return 0
}
