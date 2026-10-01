import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
  /** Adds the lift/glow hover treatment. */
  interactive?: boolean
  as?: 'div' | 'section' | 'article'
}

export function Card({ children, className, interactive = false, as = 'div' }: CardProps) {
  const Tag = as
  return (
    <Tag className={cn('glass-card', interactive && 'glass-card-hover', className)}>
      {children}
    </Tag>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  /** Right-aligned slot for controls. */
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-violet-500/10 px-5 py-4">
      <div className="min-w-0">
        <h2 className="section-label">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}