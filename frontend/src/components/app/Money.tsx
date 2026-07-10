import { inr } from '@/lib/money'
import { cn } from '@/lib/utils'

export function Money({
  value,
  signed = false,
  className,
}: {
  value: string | number
  signed?: boolean
  className?: string
}) {
  const n = Number(value)
  return (
    <span
      className={cn(
        'tnum',
        signed && n > 0 && 'text-emerald-600',
        signed && n < 0 && 'text-red-600',
        className,
      )}
    >
      {signed && n > 0 ? '+' : ''}
      {inr(n)}
    </span>
  )
}
