import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const JOURNEY_STEPS = ['Upload', 'Scan', 'People', 'Review', 'Commit', 'Report'] as const
export type JourneyStep = (typeof JOURNEY_STEPS)[number]

/** Vertical progress rail (desktop) / horizontal dots (mobile) for the journey. */
export function ProgressRail({ current }: { current: JourneyStep }) {
  const idx = JOURNEY_STEPS.indexOf(current)

  return (
    <>
      {/* desktop rail */}
      <ol className="hidden flex-col gap-0 lg:flex">
        {JOURNEY_STEPS.map((step, i) => {
          const done = i < idx
          const active = i === idx
          return (
            <li key={step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    done && 'bg-primary text-primary-foreground',
                    active && 'bg-primary text-primary-foreground ring-primary/20 ring-4',
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                {i < JOURNEY_STEPS.length - 1 && (
                  <span className={cn('my-1 h-8 w-px', done ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
              <span
                className={cn(
                  'pt-1 text-sm font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step}
              </span>
            </li>
          )
        })}
      </ol>

      {/* mobile dots */}
      <div className="flex justify-center gap-1.5 lg:hidden">
        {JOURNEY_STEPS.map((step, i) => (
          <span
            key={step}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === idx ? 'bg-primary w-6' : i < idx ? 'bg-primary/40 w-1.5' : 'bg-border w-1.5',
            )}
          />
        ))}
      </div>
    </>
  )
}
