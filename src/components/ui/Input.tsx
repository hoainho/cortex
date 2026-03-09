import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-[13px] font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl',
            'bg-[var(--bg-input)] text-[var(--text-primary)]',
            'border border-[var(--border-input)]',
            'placeholder:text-[var(--text-tertiary)]',
            'focus:outline-none focus:border-[var(--border-focus)]',
            'focus:ring-2 focus:ring-[var(--accent-light)]',
            'text-[14px] leading-normal',
            'transition-all duration-100',
            error && 'border-[var(--status-error-text)] focus:border-[var(--status-error-text)] focus:ring-[var(--status-error-bg)]',
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-[12px] text-[var(--status-error-text)]">{error}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
