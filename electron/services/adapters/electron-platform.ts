import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import type { ICortexPlatform, IStorage, IKeychain, IDialog } from './interfaces'

class ElectronStorage implements IStorage {
  private storePath: string
  private cache: Record<string, string> = {}

  constructor(userDataPath: string) {
    this.storePath = join(userDataPath, 'cortex-store.json')
    this.loadFromDisk()
  }

  private loadFromDisk(): void {
    if (!existsSync(this.storePath)) return
    try {
      this.cache = JSON.parse(readFileSync(this.storePath, 'utf-8'))
    } catch {
      this.cache = {}
    }
  }

  private saveToDisk(): void {
    mkdirSync(join(this.storePath, '..'), { recursive: true })
    writeFileSync(this.storePath, JSON.stringify(this.cache, null, 2))
  }

  get(key: string): string | null { return this.cache[key] ?? null }

  set(key: string, value: string): void {
    this.cache[key] = value
    this.saveToDisk()
  }

  delete(key: string): void {
    delete this.cache[key]
    this.saveToDisk()
  }

  encryptedGet(key: string): string | null {
    const encrypted = this.cache[`__enc_${key}`]
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch { return null }
  }

  encryptedSet(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) { this.set(key, value); return }
    const encrypted = safeStorage.encryptString(value).toString('base64')
    this.cache[`__enc_${key}`] = encrypted
    this.saveToDisk()
  }
}

class ElectronKeychain implements IKeychain {
  async getSecret(_service: string, account: string): Promise<string | null> {
    const storage = electronPlatform.storage
    return storage.encryptedGet(`keychain_${account}`)
  }

  async setSecret(_service: string, account: string, value: string): Promise<void> {
    electronPlatform.storage.encryptedSet(`keychain_${account}`, value)
  }

  async deleteSecret(_service: string, account: string): Promise<void> {
    electronPlatform.storage.delete(`__enc_keychain_${account}`)
  }
}

class ElectronDialog implements IDialog {
  async showOpenDialog(options: Parameters<IDialog['showOpenDialog']>[0]): Promise<string[] | null> {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({ title: options.title, filters: options.filters })
    return result.canceled ? null : result.filePaths
  }

  async showSaveDialog(options: Parameters<IDialog['showSaveDialog']>[0]): Promise<string | null> {
    const { dialog } = await import('electron')
    const result = await dialog.showSaveDialog({ title: options.title, defaultPath: options.defaultPath })
    return result.canceled ? null : result.filePath ?? null
  }

  async showMessageBox(options: Parameters<IDialog['showMessageBox']>[0]): Promise<number> {
    const { dialog } = await import('electron')
    const result = await dialog.showMessageBox({
      type: options.type as 'none' | 'info' | 'error' | 'question' | 'warning' ?? 'info',
      message: options.message,
      detail: options.detail,
      buttons: options.buttons ?? ['OK']
    })
    return result.response
  }
}

const userDataPath = app.getPath('userData')

export const electronPlatform: ICortexPlatform = {
  storage: new ElectronStorage(userDataPath),
  keychain: new ElectronKeychain(),
  dialog: new ElectronDialog(),
  appDataPath: app.getPath('appData'),
  userDataPath,
  isPackaged: app.isPackaged,
  platform: 'electron'
}
