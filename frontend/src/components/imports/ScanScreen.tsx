import { useEffect, useState } from 'react'
import { FileSearch } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

const PHASES = [
  'Reading rows…',
  'Normalizing names and amounts…',
  'Resolving dates and currencies…',
  'Hunting duplicates…',
  'Checking membership windows…',
]

/**
 * The dry-run analysis presented as a scan. Purely presentational — the real
 * work is one API call; this stages its result so the user sees what the
 * importer actually did before anything asks for their judgment.
 */
export function ScanScreen({ filename }: { filename: string }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 480)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <motion.span
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
        className="bg-secondary text-primary rounded-3xl p-5"
      >
        <FileSearch className="size-8" strokeWidth={1.6} />
      </motion.span>

      <h2 className="mt-5 text-xl font-semibold tracking-tight">Scanning {filename}</h2>

      <div className="mt-3 h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground text-sm"
          >
            {PHASES[phase]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* indeterminate shimmer bar */}
      <div className="bg-muted mt-6 h-1.5 w-64 overflow-hidden rounded-full">
        <motion.div
          animate={{ x: ['-100%', '260%'] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          className="bg-primary h-full w-1/3 rounded-full"
        />
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        Nothing is written until you approve every change.
      </p>
    </div>
  )
}
