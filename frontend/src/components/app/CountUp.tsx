import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { inrCompact } from '@/lib/money'

/** Money that counts up on mount — the hero number's "alive" moment. */
export function CountUpMoney({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => inrCompact(v))
  const done = useRef(false)

  useEffect(() => {
    if (done.current) {
      mv.set(value) // later data refreshes snap, only the first paint animates
      return
    }
    done.current = true
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [value, mv])

  return <motion.span className={className}>{text}</motion.span>
}
