declare module 'vscode' {
  export enum StatusBarAlignment { Left = 1, Right = 2 }
  export interface StatusBarItem {
    text: string; tooltip: string; command: string
    show(): void; dispose(): void
  }
  export interface TextEditor {
    document: { getText(range?: unknown): string; fileName: string }
    selection: unknown
  }
  export interface ExtensionContext {
    subscriptions: Array<{ dispose(): void }>
  }
  export interface Disposable { dispose(): void }
  export namespace window {
    function createStatusBarItem(alignment: StatusBarAlignment, priority: number): StatusBarItem
    function showInformationMessage(msg: string): Thenable<string | undefined>
    function showWarningMessage(msg: string): Thenable<string | undefined>
    function showInputBox(options: { prompt: string; placeHolder?: string }): Thenable<string | undefined>
    const activeTextEditor: TextEditor | undefined
  }
  export namespace commands {
    function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable
  }
}
