import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials, personColor } from '@/lib/person'
import { cn } from '@/lib/utils'

const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-14 text-lg',
}

export function PersonAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: keyof typeof sizes
  className?: string
}) {
  return (
    <Avatar className={cn(sizes[size], className)} title={name}>
      <AvatarFallback className={cn('font-semibold text-white', personColor(name))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

export function PersonAvatarStack({ names, max = 5 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max)
  return (
    <div className="flex -space-x-2">
      {shown.map((n) => (
        <PersonAvatar key={n} name={n} size="sm" className="ring-background ring-2" />
      ))}
      {names.length > max && (
        <Avatar className="ring-background size-6 ring-2">
          <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
            +{names.length - max}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
