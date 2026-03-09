import { useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ImportOptions } from './ImportOptions'
import { useProjectStore } from '../../stores/projectStore'
import type { ImportSourceType } from '../../types'
interface NewProjectModalProps {
  open: boolean
  onClose: () => void
}

export function NewProjectModal({ open, onClose }: NewProjectModalProps) {
  const [step, setStep] = useState(1)
  const [projectName, setProjectName] = useState('')
  const [sourceType, setSourceType] = useState<ImportSourceType | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [nameError, setNameError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const { addProject } = useProjectStore()

  const reset = () => {
    setStep(1)
    setProjectName('')
    setSourceType(null)
    setSourcePath('')
    setGithubToken('')
    setNameError('')
    setIsCreating(false)
    setCreateError('')
  }

  const handleClose = () => {
    if (isCreating) return // Don't close while creating
    reset()
    onClose()
  }

  const handleNextStep = () => {
    if (!projectName.trim()) {
      setNameError('Vui lòng nhập tên dự án')
      return
    }
    setNameError('')
    setStep(2)
  }

  const handleSelectLocal = async () => {
    setSourceType('local')
    try {
      const folderPath = await window.electronAPI.openFolderDialog()
      if (folderPath) {
        setSourcePath(folderPath)
      }
    } catch {
      // Fallback for dev mode without Electron
      setSourcePath('/Users/dev/projects/my-project')
    }
  }

  const handleSelectGithub = () => {
    setSourceType('github')
  }

  const handleCreate = async () => {
    if (!sourceType || !sourcePath.trim()) return
    setIsCreating(true)
    setCreateError('')

    try {
      // 1. Create project in DB
      const projectId = await addProject(projectName.trim(), sourceType, sourcePath.trim())
      if (!projectId) {
        setCreateError('Không thể tạo dự án. Vui lòng thử lại.')
        setIsCreating(false)
        return
      }

      // 2. Actually import the repo into the brain
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
            setCreateError('Repository là private. Vui lòng cung cấp GitHub Token.')
            setIsCreating(false)
            return
          }
          setCreateError(result.error || 'Không thể import repository.')
          setIsCreating(false)
          return
        }
      }

      // 3. Reload projects to get fresh status
      await useProjectStore.getState().loadProjects()
      reset()
      onClose()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setIsCreating(false)
    }
  }

  const canCreate = sourceType && sourcePath.trim()

  return (
    <Modal open={open} onClose={handleClose} title="Tạo dự án mới" width="md">
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-[var(--text-secondary)] -mt-1">
            Đặt tên cho dự án. Cortex sẽ tự tạo một AI assistant riêng cho nó.
          </p>

          <Input
            id="project-name"
            label="Tên dự án"
            placeholder="Ví dụ: E-Commerce Platform"
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value)
              if (nameError) setNameError('')
            }}
            error={nameError}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNextStep()
            }}
          />

          <div className="flex justify-end pt-2">
            <Button onClick={handleNextStep} size="md">
              Tiếp tục
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 -mt-1">
            <button
              onClick={() => setStep(1)}
              className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)] transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Chọn nguồn import cho <strong>{projectName}</strong>
            </p>
          </div>

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
                id="github-url"
                label="Repository URL"
                placeholder="https://github.com/user/repo"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                autoFocus
              />
              <Input
                id="github-token"
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
          {createError && (
            <div className="px-3 py-2 rounded-lg bg-[var(--status-error-bg)] border border-[var(--status-error-border)] text-[13px] text-[var(--status-error-text)]">
              {createError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleCreate} disabled={!canCreate || isCreating} size="md">
              {isCreating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Đang import...
                </>
              ) : (
                'Tạo dự án & Bắt đầu học'
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
