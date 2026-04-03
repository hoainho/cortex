import type { ExtensionContext } from 'vscode'

export async function activate(context: ExtensionContext): Promise<void> {
  const vscode = await import('vscode')

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.text = '$(brain) Cortex'
  statusBar.tooltip = 'Cortex AI Assistant — Click to open chat'
  statusBar.command = 'cortex.openChat'
  statusBar.show()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.commands.registerCommand('cortex.openChat', () => {
      vscode.window.showInformationMessage('Cortex Chat — Full implementation coming in Phase 3')
    }),

    vscode.commands.registerCommand('cortex.askAboutSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = editor.document.getText(editor.selection)
      if (!selection.trim()) {
        vscode.window.showWarningMessage('Select some code first')
        return
      }
      const query = await vscode.window.showInputBox({
        prompt: 'Ask Cortex about the selected code',
        placeHolder: 'What does this do? How can I improve it?'
      })
      if (query) {
        vscode.window.showInformationMessage(`Cortex: "${query}" — Daemon connection coming in Phase 3`)
      }
    }),

    vscode.commands.registerCommand('cortex.explainFunction', () => {
      vscode.window.showInformationMessage('Cortex: Explain function — coming in Phase 3')
    }),

    vscode.commands.registerCommand('cortex.reviewFile', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) { vscode.window.showWarningMessage('No active file'); return }
      vscode.window.showInformationMessage(`Cortex: Reviewing ${editor.document.fileName} — coming in Phase 3`)
    }),

    vscode.commands.registerCommand('cortex.reloadAgents', () => {
      vscode.window.showInformationMessage('Cortex: Agents reloaded')
    })
  )
}

export function deactivate(): void {}
