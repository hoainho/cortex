import { Modal } from './Modal'
import { Button } from './Button'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Xóa',
  loading = false
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} width="sm">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div className="w-12 h-12 rounded-full bg-[var(--status-error-bg)] flex items-center justify-center">
          <AlertTriangle size={24} className="text-[var(--status-error-text)]" />
        </div>

        <div>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center gap-3 w-full pt-2">
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            Hủy
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
