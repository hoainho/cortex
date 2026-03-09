export function TitleBar() {
  return (
    <div
      className="titlebar-drag h-[var(--titlebar-height)] flex items-center shrink-0"
      style={{ height: 'var(--titlebar-height)' }}
    >
      {/* macOS traffic lights occupy the left ~78px — leave space for them */}
      <div className="w-[78px] shrink-0" />
    </div>
  )
}
