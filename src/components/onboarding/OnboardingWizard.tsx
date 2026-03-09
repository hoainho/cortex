import { useState } from 'react'
import { Brain, Server, Rocket, ArrowRight, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../stores/uiStore'
import { APP_VERSION } from '../../lib/version'

interface OnboardingWizardProps {
  open: boolean
  onComplete: () => void
}

const STEPS = [
  { icon: Brain, label: 'Chào mừng' },
  { icon: Server, label: 'Cài đặt' },
  { icon: Rocket, label: 'Bắt đầu' }
]

export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [proxyUrl, setProxyUrl] = useState('https://proxy.hoainho.info')
  const [proxyKey, setProxyKey] = useState('hoainho')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const { openNewProjectModal } = useUIStore()

  const handleTestProxy = async () => {
    setTesting(true)
    setTestResult('idle')
    try {
      const result = await window.electronAPI.testProxyConnection(proxyUrl, proxyKey)
      if (result.success) {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestError(result.error || 'Kết nối thất bại')
      }
    } catch {
      setTestResult('error')
      setTestError('Lỗi kết nối')
    } finally {
      setTesting(false)
    }
  }

  const handleSaveProxy = async () => {
    await window.electronAPI.setProxyConfig(proxyUrl, proxyKey)
    setStep(2)
  }

  const handleFinish = async () => {
    await window.electronAPI.completeOnboarding()
    onComplete()
    openNewProjectModal()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-[520px] mx-4 bg-[var(--bg-primary)] rounded-2xl shadow-2xl border border-[var(--border-primary)]">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 pt-6 pb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  i === step
                    ? 'bg-[var(--accent-primary)] text-white'
                    : i < step
                      ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                )}
              >
                {i < step ? <CheckCircle size={16} /> : <s.icon size={16} />}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-12 h-0.5 rounded-full',
                    i < step ? 'bg-[var(--status-success-text)]' : 'bg-[var(--border-primary)]'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Step 1: Welcome */}
          {step === 0 && (
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-primary)]/10 flex items-center justify-center">
                <Brain size={32} className="text-[var(--accent-primary)]" />
              </div>
              <h2 className="text-[22px] font-bold text-[var(--text-primary)] tracking-tight">
                Chào mừng đến với Cortex
              </h2>
              <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[380px]">
                Cortex là bộ não AI hiểu codebase của bạn. Import repository, đặt câu hỏi,
                và nhận phân tích chuyên sâu ở chế độ PM hoặc Engineering.
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Phiên bản {APP_VERSION}
              </p>

              <Button onClick={() => setStep(1)} size="lg" className="mt-2">
                Bắt đầu thiết lập
                <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {/* Step 2: Proxy Setup */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">
                    Cài đặt API Proxy
                  </h2>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Cortex sử dụng LLM proxy để giao tiếp với AI
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] text-[var(--text-secondary)] mb-1">Proxy URL</label>
                  <Input
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="https://proxy.example.com"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--text-secondary)] mb-1">API Key</label>
                  <Input
                    type="password"
                    value={proxyKey}
                    onChange={(e) => setProxyKey(e.target.value)}
                    placeholder="Nhập API key..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleTestProxy} disabled={testing}>
                  {testing ? (
                    <><Loader2 size={14} className="animate-spin" /> Đang kiểm tra...</>
                  ) : (
                    'Kiểm tra kết nối'
                  )}
                </Button>
                {testResult === 'success' && (
                  <span className="flex items-center gap-1 text-[12px] text-[var(--status-success-text)]">
                    <CheckCircle size={14} /> Kết nối thành công
                  </span>
                )}
                {testResult === 'error' && (
                  <span className="text-[12px] text-[var(--status-error-text)]">{testError}</span>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveProxy} size="md">
                  Lưu & Tiếp tục
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Get Started */}
          {step === 2 && (
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--status-success-bg)] flex items-center justify-center">
                <Rocket size={32} className="text-[var(--status-success-text)]" />
              </div>
              <h2 className="text-[22px] font-bold text-[var(--text-primary)] tracking-tight">
                Sẵn sàng!
              </h2>
              <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[380px]">
                Mọi thứ đã được thiết lập. Tạo dự án đầu tiên để Cortex bắt đầu
                phân tích codebase của bạn.
              </p>

              <Button onClick={handleFinish} size="lg" className="mt-2">
                <Brain size={16} />
                Tạo dự án đầu tiên
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
