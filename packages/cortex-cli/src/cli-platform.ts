import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { ICortexPlatform, IStorage, IKeychain, IDialog } from '../../../electron/services/adapters/interfaces'

class FileStorage implements IStorage {
  private storePath: string
  private cache: Record<string, string> = {}

  constructor(dataPath: string) {
    this.storePath = join(dataPath, 'cortex-store.json')
    this.loadFromDisk()
  }

  private loadFromDisk(): void {
    if (!existsSync(this.storePath)) return
    try { this.cache = JSON.parse(readFileSync(this.storePath, 'utf-8')) } catch { this.cache = {} }
  }

  private saveToDisk(): void {
    mkdirSync(join(this.storePath, '..'), { recursive: true })
    writeFileSync(this.storePath, JSON.stringify(this.cache, null, 2))
  }

  get(key: string): string | null { return this.cache[key] ?? null }
  set(key: string, value: string): void { this.cache[key] = value; this.saveToDisk() }
  delete(key: string): void { delete this.cache[key]; this.saveToDisk() }
  encryptedGet(key: string): string | null { return this.get(key) }
  encryptedSet(key: string, value: string): void { this.set(key, value) }
}

class EnvKeychain implements IKeychain {
  private envPrefix = 'CORTEX_SECRET_'

  async getSecret(_service: string, account: string): Promise<string | null> {
    const envKey = `${this.envPrefix}${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    return process.env[envKey] ?? null
  }

  async setSecret(_service: string, account: string, value: string): Promise<void> {
    const envKey = `${this.envPrefix}${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    process.env[envKey] = value
  }

  async deleteSecret(_service: string, account: string): Promise<void> {
    const envKey = `${this.envPrefix}${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    delete process.env[envKey]
  }
}

class NoopDialog implements IDialog {
  async showOpenDialog(): Promise<string[] | null> { return null }
  async showSaveDialog(): Promise<string | null> { return null }
  async showMessageBox(options: { message: string }): Promise<number> {
    console.log(`[Dialog] ${options.message}`)
    return 0
  }
}

const cliDataPath = join(homedir(), '.cortex', 'cli-data')

export const cliPlatform: ICortexPlatform = {
  storage: new FileStorage(cliDataPath),
  keychain: new EnvKeychain(),
  dialog: new NoopDialog(),
  appDataPath: join(homedir(), '.cortex'),
  userDataPath: cliDataPath,
  isPackaged: false,
  platform: 'cli'
}
