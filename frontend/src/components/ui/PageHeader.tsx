import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  /** Status pills / controls rendered on the right. */
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{description}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}