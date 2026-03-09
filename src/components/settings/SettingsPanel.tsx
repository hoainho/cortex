import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Server,
  Zap,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  Palette
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { APP_VERSION, APP_NAME } from '../../lib/version'
import { useUIStore } from '../../stores/uiStore'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { theme, toggleTheme } = useUIStore()
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyKey, setProxyKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)
  const [saving, setSaving] = useState(false)

  // LLM Config
  const [maxTokens, setMaxTokens] = useState(8192)
  const [contextMessages, setContextMessages] = useState(20)

  // Git Config
  const [cloneDepth, setCloneDepth] = useState(1)

  // Advanced collapsed
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [githubToken, setGithubToken] = useState('')
  const [githubConfigured, setGithubConfigured] = useState(false)
  const [showGithubToken, setShowGithubToken] = useState(false)

  const [autoRotation, setAutoRotationState] = useState(true)
  // Load settings
  useEffect(() => {
    if (!open) return
    const load = async () => {
      try {
        const proxy = await window.electronAPI.getProxyConfig()
        setProxyUrl(proxy.url)
        setProxyKey(proxy.key)

        const llm = await window.electronAPI.getLLMConfig()
        setMaxTokens(llm.maxTokens)
        setContextMessages(llm.contextMessages)

        const git = await window.electronAPI.getGitConfig()
        setCloneDepth(git.cloneDepth)
      } catch (err) {
        console.error('Failed to load settings:', err)
      }

      try {
        const hasToken = await window.electronAPI.getGitHubPAT()
        setGithubConfigured(hasToken)
      } catch {}

      try {
        const autoRot = await window.electronAPI.getAutoRotation()
        setAutoRotationState(autoRot)
      } catch {}
    }
    load()
  }, [open])

  const handleTestProxy = useCallback(async () => {
    setTestStatus('testing')
    setTestError('')
    try {
      const result = await window.electronAPI.testProxyConnection(proxyUrl, proxyKey)
      if (result.success) {
        setTestStatus('success')
        setTestLatency(result.latencyMs || 0)
      } else {
        setTestStatus('error')
        setTestError(result.error || 'Kết nối thất bại')
      }
    } catch (err) {
      setTestStatus('error')
      setTestError('Lỗi kết nối')
    }
  }, [proxyUrl, proxyKey])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.electronAPI.setProxyConfig(proxyUrl, proxyKey)
      await window.electronAPI.setLLMConfig(maxTokens, contextMessages)
      await window.electronAPI.setGitConfig(cloneDepth)
      await window.electronAPI.setAutoRotation(autoRotation)
      if (githubToken) {
        await window.electronAPI.setGitHubPAT(githubToken)
        setGithubConfigured(true)
        setGithubToken('')
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [proxyUrl, proxyKey, maxTokens, contextMessages, cloneDepth, autoRotation, githubToken])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[400px] z-50',
        'bg-[var(--bg-primary)] border-l border-[var(--border-primary)]',
        'shadow-2xl flex flex-col',
        'animate-in slide-in-from-right duration-200'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Cài đặt</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette size={16} className="text-[var(--accent-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Giao diện
              </h3>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                {theme === 'light' ? <Sun size={16} className="text-[var(--status-warning-text)]" /> : <Moon size={16} className="text-[var(--status-info-text)]" />}
                <div>
                  <label className="block text-[13px] text-[var(--text-primary)]">
                    {theme === 'light' ? 'Sáng' : 'Tối'}
                  </label>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Chuyển đổi giao diện sáng/tối
                  </p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors duration-200',
                  theme === 'dark' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-primary)]'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                  theme === 'dark' && 'translate-x-4'
                )} />
              </button>
            </div>
          </section>

          {/* Proxy Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-[var(--accent-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                API Proxy
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[var(--text-secondary)] mb-1">URL</label>
                <Input
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="https://proxy.example.com"
                />
              </div>

              <div>
                <label className="block text-[12px] text-[var(--text-secondary)] mb-1">API Key</label>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={proxyKey}
                    onChange={(e) => setProxyKey(e.target.value)}
                    placeholder="Nhập API key..."
                    className="pr-10"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleTestProxy} disabled={testStatus === 'testing'}>
                  {testStatus === 'testing' ? (
                    <><Loader2 size={14} className="animate-spin" /> Đang kiểm tra...</>
                  ) : (
                    <>Kiểm tra kết nối</>
                  )}
                </Button>

                {testStatus === 'success' && (
                  <span className="flex items-center gap-1 text-[12px] text-[var(--status-success-text)]">
                    <CheckCircle size={14} /> Kết nối thành công ({testLatency}ms)
                  </span>
                )}
                {testStatus === 'error' && (
                  <span className="flex items-center gap-1 text-[12px] text-[var(--status-error-text)]">
                    <AlertCircle size={14} /> {testError}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Advanced Settings (collapsed) */}
          <section>
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-2 w-full mb-3"
            >
              {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-[var(--accent-primary)]" />
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Nâng cao
                </h3>
              </div>
            </button>

            {advancedOpen && (
              <div className="space-y-3 pl-6">
                <div>
                  <label className="block text-[12px] text-[var(--text-secondary)] mb-1">
                    Max Tokens (phản hồi): {maxTokens}
                  </label>
                  <input
                    type="range"
                    min={1024}
                    max={16384}
                    step={1024}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="w-full accent-[var(--accent-primary)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span>1024</span>
                    <span>16384</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] text-[var(--text-secondary)] mb-1">
                    Context messages: {contextMessages}
                  </label>
                  <input
                    type="range"
                    min={4}
                    max={50}
                    step={2}
                    value={contextMessages}
                    onChange={(e) => setContextMessages(Number(e.target.value))}
                    className="w-full accent-[var(--accent-primary)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span>4</span>
                    <span>50</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-[12px] text-[var(--text-secondary)]">
                      Auto-rotation Model
                    </label>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      Tự động chuyển model khi gặp lỗi 401/403
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !autoRotation
                      setAutoRotationState(newVal)
                      await window.electronAPI.setAutoRotation(newVal)
                    }}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors duration-200',
                      autoRotation ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-primary)]'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                      autoRotation && 'translate-x-4'
                    )} />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Git Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} className="text-[var(--accent-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Git
              </h3>
            </div>

            <div>
              <label className="block text-[12px] text-[var(--text-secondary)] mb-1">
                Clone depth: {cloneDepth === 0 ? 'Full clone' : cloneDepth}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={cloneDepth}
                onChange={(e) => setCloneDepth(Number(e.target.value))}
                className="w-full accent-[var(--accent-primary)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                <span>Full</span>
                <span>100</span>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} className="text-[var(--accent-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                GitHub
              </h3>
              {githubConfigured && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--status-success-text)]">
                  <CheckCircle size={12} /> Configured
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[var(--text-secondary)] mb-1">
                  Personal Access Token
                </label>
                <p className="text-[11px] text-[var(--text-tertiary)] mb-2">
                  For private repos and higher API rate limits.
                </p>
                <div className="relative">
                  <Input
                    type={showGithubToken ? 'text' : 'password'}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder={githubConfigured ? '••••••••' : 'ghp_...'}
                    className="pr-10"
                  />
                  <button
                    onClick={() => setShowGithubToken(!showGithubToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    {showGithubToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-primary)] space-y-3">
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Đang lưu...</>
            ) : (
              'Lưu cài đặt'
            )}
          </Button>

          <p className="text-[11px] text-[var(--text-tertiary)] text-center">
            {APP_NAME} v{APP_VERSION}
          </p>
        </div>
      </div>
    </>
  )
}
