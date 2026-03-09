/**
 * CortexSplash — Distinctive AI brain loading animation
 *
 * Shows a neural network visualization with synaptic connections
 * firing up as the "Cortex" comes online. Pure CSS animations.
 */

import { useEffect, useState } from 'react'

interface CortexSplashProps {
  onComplete: () => void
  /** Total duration in ms before auto-dismiss (default 2800) */
  duration?: number
}

export function CortexSplash({ onComplete, duration = 2800 }: CortexSplashProps) {
  const [phase, setPhase] = useState<'active' | 'fading'>('active')

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase('fading'), duration)
    const doneTimer = setTimeout(onComplete, duration + 600) // 600ms fade-out
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  return (
    <div
      className={`cortex-splash ${phase === 'fading' ? 'cortex-splash--fading' : ''}`}
      aria-label="Đang tải Cortex"
      role="status"
    >
      {/* Neural network visualization */}
      <div className="cortex-splash__network">
        {/* Concentric brain-wave rings */}
        <div className="cortex-splash__ring cortex-splash__ring--1" />
        <div className="cortex-splash__ring cortex-splash__ring--2" />
        <div className="cortex-splash__ring cortex-splash__ring--3" />

        {/* Central cortex node */}
        <div className="cortex-splash__core">
          <div className="cortex-splash__core-inner" />
          <div className="cortex-splash__core-pulse" />
        </div>

        {/* Neural pathway lines radiating outward */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="cortex-splash__synapse"
            style={{
              '--synapse-angle': `${i * 60}deg`,
              '--synapse-delay': `${0.3 + i * 0.15}s`,
            } as React.CSSProperties}
          >
            <div className="cortex-splash__synapse-line" />
            <div className="cortex-splash__synapse-node" />
          </div>
        ))}

        {/* Secondary nodes — smaller, further out */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`sec-${i}`}
            className="cortex-splash__synapse cortex-splash__synapse--secondary"
            style={{
              '--synapse-angle': `${30 + i * 60}deg`,
              '--synapse-delay': `${0.6 + i * 0.12}s`,
            } as React.CSSProperties}
          >
            <div className="cortex-splash__synapse-line" />
            <div className="cortex-splash__synapse-node" />
          </div>
        ))}
      </div>

      {/* Brand text */}
      <div className="cortex-splash__text">
        <h1 className="cortex-splash__title">
          {'CORTEX'.split('').map((char, i) => (
            <span
              key={i}
              className="cortex-splash__char"
              style={{ '--char-delay': `${0.8 + i * 0.08}s` } as React.CSSProperties}
            >
              {char}
            </span>
          ))}
        </h1>
        <p className="cortex-splash__tagline">Đang khởi tạo trí tuệ...</p>
      </div>
    </div>
  )
}
