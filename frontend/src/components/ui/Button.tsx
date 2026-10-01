import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const VARIANTS = {
  primary:
    'bg-violet-600 text-white shadow-glow hover:bg-violet-500 disabled:bg-violet-600/30 disabled:text-white/40 disabled:shadow-none',
  outline:
    'border border-violet-500/30 text-violet-soft hover:border-violet-500/60 hover:bg-violet/10 disabled:opacity-40',
  ghost: 'text-fg-muted hover:bg-violet/10 hover:text-fg disabled:opacity-40',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-all duration-200 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}