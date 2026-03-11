/**
 * Patch Electron.app Info.plist to show "Cortex" in macOS dock during dev mode.
 *
 * macOS reads the dock tooltip from CFBundleDisplayName / CFBundleName inside
 * the running .app bundle.  In dev mode that's the stock Electron binary, which
 * ships with "Electron".  This script rewrites those keys so the dock shows
 * "Cortex" instead.
 *
 * Runs automatically via `postinstall` — safe to re-run.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const plistPath = join(
  __dirname,
  '../node_modules/electron/dist/Electron.app/Contents/Info.plist'
)

const APP_NAME = 'Cortex'

if (!existsSync(plistPath)) {
  // Not on macOS or Electron not yet installed — skip silently
  process.exit(0)
}

let plist = readFileSync(plistPath, 'utf-8')

const replacements = [
  [/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleDisplayName</key>\n\t<string>${APP_NAME}</string>`],
  [/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleName</key>\n\t<string>${APP_NAME}</string>`],
]

let changed = false
for (const [pattern, replacement] of replacements) {
  const before = plist
  plist = plist.replace(pattern, replacement)
  if (plist !== before) changed = true
}

if (changed) {
  writeFileSync(plistPath, plist, 'utf-8')
  console.log(`[patch-electron-name] Dock name → "${APP_NAME}"`)
} else {
  console.log(`[patch-electron-name] Already patched — skipping`)
}
