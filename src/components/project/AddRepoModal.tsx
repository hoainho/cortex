import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ImportOptions } from './ImportOptions'
import { useProjectStore } from '../../stores/projectStore'
import type { ImportSourceType } from '../../types'

interface AddRepoModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
}

export function AddRepoModal({ open, onClose, projectId, projectName }: AddRepoModalProps) {
  const [sourceType, setSourceType] = useState<ImportSourceType | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setSourceType(null)
    setSourcePath('')
    setGithubToken('')
    setIsImporting(false)
    setError('')
  }

  const handleClose = () => {
    if (isImporting) return
    reset()
    onClose()
  }

  const handleSelectLocal = async () => {
    setSourceType('local')
    setError('')
    try {
      const folderPath = await window.electronAPI.openFolderDialog()
      if (folderPath) {
        setSourcePath(folderPath)
      }
    } catch {
      setSourcePath('/Users/dev/projects/my-project')
    }
  }

  const handleSelectGithub = () => {
    setSourceType('github')
    setError('')
  }

  const handleImport = async () => {
    if (!sourceType || !sourcePath.trim()) return
    setIsImporting(true)
    setError('')

    try {
      if (sourceType === 'local') {
        await window.electronAPI.importLocalRepo(projectId, sourcePath.trim())
      } else if (sourceType === 'github') {
        const result = await window.electronAPI.importGithubRepo(
          projectId,
          sourcePath.trim(),
          githubToken || undefined
        )
        if (!result.success) {
          if (result.needsToken) {
            setError('Repository là private. Vui lòng cung cấp GitHub Token.')
            setIsImporting(false)
            return
          }
          setError(result.error || 'Không thể import repository.')
          setIsImporting(false)
          return
        }
      }

      // Reload projects to get fresh status
      await useProjectStore.getState().loadProjects()
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setIsImporting(false)
    }
  }

  const canImport = sourceType && sourcePath.trim()

  return (
    <Modal open={open} onClose={handleClose} title={`Import repo vào ${projectName}`} width="md">
      <div className="flex flex-col gap-5">
        <p className="text-[14px] text-[var(--text-secondary)] -mt-1">
          Thêm repository mới vào workspace. Cortex sẽ phân tích và kết nối vào bộ não hiện tại.
        </p>

        <ImportOptions
          onSelectLocal={handleSelectLocal}
          onSelectGithub={handleSelectGithub}
          selected={sourceType}
        />

        {/* Local path display */}
        {sourceType === 'local' && sourcePath && (
          <div className="px-3 py-2 rounded-lg bg-[var(--bg-secondary)] text-[13px] text-[var(--text-secondary)] font-mono truncate">
            {sourcePath}
          </div>
        )}

        {/* GitHub URL input */}
        {sourceType === 'github' && (
          <div className="flex flex-col gap-3">
            <Input
              id="add-repo-github-url"
              label="Repository URL"
              placeholder="https://github.com/user/repo"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              autoFocus
            />
            <Input
              id="add-repo-github-token"
              label="GitHub Token (cho private repo)"
              placeholder="ghp_xxxxxxxxxxxx"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--text-link)] hover:underline"
            >
              Tạo token tại đây
              <ExternalLink size={11} />
            </a>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-[var(--status-error-bg)] border border-[var(--status-error-border)] text-[13px] text-[var(--status-error-text)]">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleImport} disabled={!canImport || isImporting} size="md">
            {isImporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang import...
              </>
            ) : (
              'Import & Học'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
