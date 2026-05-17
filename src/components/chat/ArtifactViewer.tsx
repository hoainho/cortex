import { useState, useEffect, useRef } from 'react'
import { Maximize2, X, RefreshCw, Code, Eye } from 'lucide-react'
import { cn } from '../../lib/utils'

type ArtifactLang = 'html' | 'jsx' | 'tsx' | 'css' | 'svg'

interface ArtifactViewerProps {
  code: string
  lang: ArtifactLang
  className?: string
}

const PREVIEW_LANGS: ArtifactLang[] = ['html', 'jsx', 'tsx', 'svg']

let runtimeCache: Promise<{ react: string; reactDom: string; babel: string }> | null = null

function loadRuntime() {
  if (!runtimeCache) {
    runtimeCache = Promise.all([
      fetch('/preview-runtime/react.js').then(r => r.text()),
      fetch('/preview-runtime/react-dom.js').then(r => r.text()),
      fetch('/preview-runtime/babel.min.js').then(r => r.text()),
    ]).then(([react, reactDom, babel]) => ({ react, reactDom, babel }))
  }
  return runtimeCache
}

function detectEntryComponent(code: string): string | null {
  const exportDefault = code.match(/export\s+default\s+(?:function\s+)?(\w+)/)
  if (exportDefault) return exportDefault[1]

  const topLevelDefs = Array.from(code.matchAll(/^(?:const|function|class)\s+([A-Z]\w*)/gm))
  if (topLevelDefs.length > 0) return topLevelDefs[topLevelDefs.length - 1][1]

  return null
}

function stripImports(code: string): string {
  return code
    .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .trim()
}

function buildReactHtml(
  userCode: string,
  runtime: { react: string; reactDom: string; babel: string }
): string {
  const cleaned = stripImports(userCode)
  const entry = detectEntryComponent(cleaned)

  const mountScript = entry
    ? `var rootEl = document.getElementById('root');
    var rootComponent = typeof ${entry} !== 'undefined' ? ${entry} : null;
    if (rootComponent) {
      ReactDOM.createRoot(rootEl).render(React.createElement(rootComponent));
    } else {
      rootEl.innerHTML = '<p style="color:#e11d48;font-family:monospace;padding:16px">Component not found: ${entry}</p>';
    }`
    : `var rootEl = document.getElementById('root');
    var names = ['App','Component','Page','View','Widget','Demo'];
    var found = null;
    for (var i = 0; i < names.length; i++) { if (typeof window[names[i]] !== 'undefined') { found = window[names[i]]; break; } }
    if (found) {
      ReactDOM.createRoot(rootEl).render(React.createElement(found));
    } else {
      rootEl.innerHTML = '<p style="color:#64748b;font-family:monospace;padding:16px">No renderable component found.<br>Define a PascalCase component (e.g. <code>function Card() { ... }</code>).</p>';
    }`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <script>${runtime.react}</script>
  <script>${runtime.reactDom}</script>
  <script>${runtime.babel}</script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, memo, forwardRef, Fragment } = React;

    ${cleaned}

    ${mountScript}
  </script>
</body>
</html>`
}

function wrapCss(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>body { margin: 16px; font-family: system-ui, sans-serif; }</style>
  <style>${code}</style>
</head>
<body><p>CSS preview</p></body>
</html>`
}

export function ArtifactViewer({ code, lang, className }: ArtifactViewerProps) {
  const [view, setView] = useState<'code' | 'preview'>('preview')
  const [fullscreen, setFullscreen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const prevBlobUrl = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const canPreview = PREVIEW_LANGS.includes(lang)

  useEffect(() => {
    if (!canPreview) return

    let cancelled = false
    let objectUrl: string | null = null

    async function build() {
      let html: string

      if (lang === 'jsx' || lang === 'tsx') {
        const runtime = await loadRuntime()
        if (cancelled) return
        html = buildReactHtml(code, runtime)
      } else if (lang === 'css') {
        html = wrapCss(code)
      } else {
        html = code
      }

      objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      if (cancelled) {
        URL.revokeObjectURL(objectUrl)
        return
      }

      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
      prevBlobUrl.current = objectUrl
      setBlobUrl(objectUrl)
    }

    build()
    return () => { cancelled = true }
  }, [code, lang, canPreview])

  useEffect(() => {
    if (!fullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreen])

  useEffect(() => {
    return () => { if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current) }
  }, [])

  function handleRefresh() {
    setBlobUrl(null)
    runtimeCache = null
    setPreviewKey(k => k + 1)
  }

  const iframeEl = (full: boolean) =>
    blobUrl ? (
      <iframe
        ref={full ? undefined : iframeRef}
        key={`${full ? 'fs' : 'inline'}-${previewKey}-${blobUrl}`}
        src={blobUrl}
        sandbox="allow-scripts"
        className="w-full h-full border-0"
        title="Artifact preview"
      />
    ) : (
      <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-sm">
        Loading preview…
      </div>
    )

  const controls = (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] rounded-t-lg">
      <span className="text-[11px] font-mono text-[var(--text-tertiary)] mr-2 uppercase">{lang}</span>

      {canPreview && (
        <>
          <button
            onClick={() => setView('preview')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors',
              view === 'preview'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            )}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
          <button
            onClick={() => setView('code')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors',
              view === 'code'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            )}
          >
            <Code className="w-3 h-3" /> Code
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {view === 'preview' && (
          <button
            onClick={handleRefresh}
            title="Refresh preview"
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => setFullscreen(true)}
          title="Fullscreen"
          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )

  const codeView = (
    <pre className="h-full overflow-auto p-3 text-[13px] font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)]">
      <code>{code}</code>
    </pre>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl h-full max-h-[90vh] rounded-xl overflow-hidden flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-sidebar)] border-b border-[var(--border-primary)]">
            <span className="text-sm font-medium text-[var(--text-primary)]">Artifact — {lang}</span>
            <button
              onClick={() => setFullscreen(false)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden bg-white">
            {canPreview ? iframeEl(true) : codeView}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-[var(--border-primary)] overflow-hidden my-2', className)}>
      {controls}
      <div className={cn('relative bg-white rounded-b-lg overflow-hidden', 'h-72')}>
        {canPreview && view === 'preview' ? iframeEl(false) : codeView}
      </div>
    </div>
  )
}

export function isArtifactLang(lang: string | undefined): lang is ArtifactLang {
  return ['html', 'jsx', 'tsx', 'css', 'svg'].includes(lang ?? '')
}
