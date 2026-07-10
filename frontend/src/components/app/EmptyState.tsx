import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-6 py-14 text-center shadow-sm">
      <span className="bg-secondary text-primary rounded-2xl p-3.5">
        <Icon className="size-6" strokeWidth={1.8} />
      </span>
      <p className="mt-1 text-lg font-semibold tracking-tight">{title}</p>
      {children && <div className="text-muted-foreground max-w-sm text-sm">{children}</div>}
      {actions && <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}
