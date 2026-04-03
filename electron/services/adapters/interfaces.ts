/**
 * Adapter interfaces for decoupling core engine from Electron
 * Enables CLI mode and VS Code extension (Phase 3 - v5.0.0 Eureka)
 *
 * Implementation pattern:
 *   ElectronStorage implements IStorage (uses safeStorage)
 *   FileStorage implements IStorage (uses plain JSON - for CLI)
 *   EnvKeychain implements IKeychain (uses env vars - for CLI)
 */

export interface IStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  delete(key: string): void
  encryptedGet(key: string): string | null
  encryptedSet(key: string, value: string): void
}

export interface IKeychain {
  getSecret(service: string, account: string): Promise<string | null>
  setSecret(service: string, account: string, value: string): Promise<void>
  deleteSecret(service: string, account: string): Promise<void>
}

export interface IDialog {
  showOpenDialog(options: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[] | null>
  showSaveDialog(options: { title?: string; defaultPath?: string }): Promise<string | null>
  showMessageBox(options: { type?: string; message: string; detail?: string; buttons?: string[] }): Promise<number>
}

export interface ICortexPlatform {
  storage: IStorage
  keychain: IKeychain
  dialog: IDialog
  appDataPath: string
  userDataPath: string
  isPackaged: boolean
  platform: 'electron' | 'cli' | 'vscode'
}
