export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-1">
      <div className="flex gap-1">
        <span
          className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '1.2s' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce"
          style={{ animationDelay: '200ms', animationDuration: '1.2s' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce"
          style={{ animationDelay: '400ms', animationDuration: '1.2s' }}
        />
      </div>
      <span className="text-[13px] text-[var(--text-tertiary)] ml-1">Đang suy nghĩ...</span>
    </div>
  )
}

export function MessageSkeleton() {
  return (
    <div className="py-2 px-1 space-y-3">
      <div className="space-y-2.5">
        <div className="h-3.5 rounded-md skeleton-shimmer" style={{ width: '75%' }} />
        <div className="h-3.5 rounded-md skeleton-shimmer" style={{ width: '50%' }} />
        <div className="h-3.5 rounded-md skeleton-shimmer" style={{ width: '30%' }} />
      </div>
      <span className="text-[12px] text-[var(--text-tertiary)] block mt-2">Đang suy nghĩ...</span>
    </div>
  )
}
