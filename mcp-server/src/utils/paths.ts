/**
 * Auto-detect Cortex DB path across platforms.
 * Cortex Desktop stores its database at:
 *   macOS:   ~/Library/Application Support/Cortex/cortex-data/cortex.db
 *   Linux:   ~/.config/Cortex/cortex-data/cortex.db
 *   Windows: %APPDATA%/Cortex/cortex-data/cortex.db
 */
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

export function detectCortexDbPath(): string | null {
  const home = homedir()
  const candidates = [
    // macOS
    join(home, 'Library', 'Application Support', 'Cortex', 'cortex-data', 'cortex.db'),
    // Linux
    join(home, '.config', 'Cortex', 'cortex-data', 'cortex.db'),
    // Windows
    join(
      process.env.APPDATA || join(home, 'AppData', 'Roaming'),
      'Cortex',
      'cortex-data',
      'cortex.db'
    ),
  ]
  return candidates.find((p) => existsSync(p)) || null
}
