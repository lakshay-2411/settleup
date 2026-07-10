import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useCreateExpense } from '@/api/hooks'
import { Money } from '@/components/app/Money'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inr } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Group, SplitType } from '@/types'

const STEPS = ['amount', 'payer', 'split'] as const
type Step = (typeof STEPS)[number]

const SPLIT_INFO: Record<SplitType, { title: string; hint: string }> = {
  equal: { title: 'Equal', hint: 'Everyone pays the same' },
  unequal: { title: 'Exact', hint: 'Type each person’s amount' },
  percentage: { title: 'Percent', hint: 'Must add up to 100%' },
  share: { title: 'Shares', hint: 'Weighted — 2 shares pay double' },
}

/**
 * Full-screen, amount-first expense flow — three focused steps instead of one
 * dense form: how much → who paid → how to split.
 */
export default function AddExpenseFlow({ group }: { group: Group }) {
  const navigate = useNavigate()
  const createExpense = useCreateExpense(group.id)
  const memberNames = group.memberships.map((m) => m.person.name)
  const back = () => navigate(`/groups/${group.id}`)

  const [step, setStep] = useState<Step>('amount')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(group.base_currency)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payer, setPayer] = useState('')
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [selected, setSelected] = useState<string[]>(memberNames)
  const [details, setDetails] = useState<Record<string, string>>({})

  const stepIndex = STEPS.indexOf(step)

  const detailSum = useMemo(
    () => selected.reduce((acc, n) => acc + (parseFloat(details[n] ?? '') || 0), 0),
    [selected, details],
  )

  const amountValid = parseFloat(amount) > 0 && description.trim().length > 0 && !!date
  const splitValid = useMemo(() => {
    if (selected.length === 0) return false
    if (splitType === 'equal') return true
    if (selected.some((n) => !details[n] || isNaN(parseFloat(details[n])))) return false
    if (splitType === 'percentage') return Math.abs(detailSum - 100) < 0.001
    if (splitType === 'unequal') return Math.abs(detailSum - parseFloat(amount || '0')) < 0.001
    return detailSum > 0
  }, [splitType, selected, details, detailSum, amount])

  // Live per-person preview for the equal case — the reassuring "₹800 each".
  const equalShare = selected.length > 0 ? parseFloat(amount || '0') / selected.length : 0

  async function save() {
    try {
      await createExpense.mutateAsync({
        date,
        description: description.trim(),
        payer_name: payer,
        original_amount: amount,
        original_currency: currency,
        split_type: splitType,
        participants: selected,
        split_details:
          splitType === 'equal' ? null : Object.fromEntries(selected.map((n) => [n, details[n]])),
      })
      toast.success(`“${description.trim()}” added`)
      back()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the expense')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* flow header */}
      <header className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => (stepIndex === 0 ? back() : setStep(STEPS[stepIndex - 1]))}
        >
          <ArrowLeft />
        </Button>
        {/* progress dots */}
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === stepIndex ? 'bg-primary w-6' : i < stepIndex ? 'bg-primary/40 w-1.5' : 'bg-border w-1.5',
              )}
            />
          ))}
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={back}>
          <X />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pt-6 md:mt-4 md:rounded-3xl md:bg-white md:p-8 md:shadow-sm"
          >
            {step === 'amount' && (
              <section>
                <h1 className="text-xl font-semibold tracking-tight">How much?</h1>
                <div className="mt-8 flex items-end justify-center gap-2">
                  <button
                    onClick={() => setCurrency(currency === 'INR' ? 'USD' : 'INR')}
                    className="text-muted-foreground hover:text-foreground mb-3 rounded-lg px-2 py-1 text-lg font-semibold transition-colors"
                    title="Toggle currency"
                  >
                    {currency === 'INR' ? '₹' : '$'}
                  </button>
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="tnum placeholder:text-muted-foreground/30 w-56 border-none bg-transparent text-center text-6xl font-semibold tracking-tight outline-none"
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  tap {currency === 'INR' ? '₹' : '$'} to switch currency
                </p>

                <div className="mt-10 space-y-3">
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What was it for? — e.g. Dinner at Thalassa"
                    className="h-12 rounded-xl bg-white text-[15px]"
                  />
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-12 rounded-xl bg-white"
                  />
                </div>

                <Button
                  className="mt-8 h-12 w-full rounded-xl text-[15px]"
                  disabled={!amountValid}
                  onClick={() => setStep('payer')}
                >
                  Continue
                </Button>
              </section>
            )}

            {step === 'payer' && (
              <section>
                <h1 className="text-xl font-semibold tracking-tight">Who paid?</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {inr(parseFloat(amount || '0'))}
                  {currency !== 'INR' && ` (${currency} ${amount})`} · {description}
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {memberNames.map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setPayer(n)
                        setStep('split')
                      }}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                        payer === n && 'ring-primary ring-2',
                      )}
                    >
                      <PersonAvatar name={n} size="xl" />
                      <span className="w-full truncate text-center text-sm font-medium">{n}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'split' && (
              <section>
                <h1 className="text-xl font-semibold tracking-tight">Split how?</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {payer} paid {inr(parseFloat(amount || '0'))} · {description}
                </p>

                {/* split type cards */}
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(SPLIT_INFO) as SplitType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSplitType(t)}
                      className={cn(
                        'rounded-2xl bg-white p-3 text-left shadow-sm transition-all',
                        splitType === t ? 'ring-primary ring-2' : 'hover:shadow-md',
                      )}
                    >
                      <p className="text-sm font-semibold">{SPLIT_INFO[t].title}</p>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                        {SPLIT_INFO[t].hint}
                      </p>
                    </button>
                  ))}
                </div>

                {/* participants */}
                <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                  {memberNames.map((n) => {
                    const on = selected.includes(n)
                    return (
                      <div key={n} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                        <button
                          onClick={() =>
                            setSelected((cur) =>
                              cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n],
                            )
                          }
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                              on ? 'bg-primary border-primary text-white' : 'border-border',
                            )}
                          >
                            {on && <Check className="size-3" strokeWidth={3} />}
                          </span>
                          <PersonAvatar name={n} size="sm" />
                          <span className={cn('truncate text-sm', !on && 'text-muted-foreground')}>
                            {n}
                          </span>
                        </button>
                        {on && splitType === 'equal' && equalShare > 0 && (
                          <Money value={equalShare} className="text-muted-foreground text-xs" />
                        )}
                        {on && splitType !== 'equal' && (
                          <div className="relative w-24">
                            <Input
                              type="number"
                              step="any"
                              value={details[n] ?? ''}
                              onChange={(e) => setDetails({ ...details, [n]: e.target.value })}
                              placeholder="0"
                              className="h-8 rounded-lg pr-7 text-sm"
                            />
                            <span className="text-muted-foreground absolute inset-y-0 right-2 flex items-center text-[10px]">
                              {{ unequal: currency === 'INR' ? '₹' : '$', percentage: '%', share: 'w', equal: '' }[splitType]}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {splitType === 'percentage' && (
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      Math.abs(detailSum - 100) < 0.001 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    Total {detailSum.toFixed(1)}% — must be exactly 100%
                  </p>
                )}
                {splitType === 'unequal' && (
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      Math.abs(detailSum - parseFloat(amount || '0')) < 0.001
                        ? 'text-emerald-600'
                        : 'text-red-600',
                    )}
                  >
                    Parts total {detailSum.toFixed(2)} of {amount || '0'}
                  </p>
                )}

                <Button
                  className="mt-6 h-12 w-full rounded-xl text-[15px]"
                  disabled={!splitValid || createExpense.isPending}
                  onClick={save}
                >
                  {createExpense.isPending ? 'Saving…' : `Add ${inr(parseFloat(amount || '0'))} expense`}
                </Button>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
