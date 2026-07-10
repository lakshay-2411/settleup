import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { inr } from '@/lib/money'
import type { Expense } from '@/types'

const monthKey = (iso: string) => iso.slice(0, 7)
const monthLabel = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' })

/**
 * Single-series magnitude bar: one teal hue, thin rounded marks, recessive
 * axes, hover tooltip. Lazy-loaded so recharts stays out of the main bundle.
 */
export default function SpendingChart({ expenses }: { expenses: Expense[] }) {
  const data = useMemo(() => {
    const byMonth = new Map<string, number>()
    for (const e of expenses) {
      if (e.status !== 'active') continue
      byMonth.set(monthKey(e.date), (byMonth.get(monthKey(e.date)) ?? 0) + Number(e.amount_inr))
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({ month: monthLabel(key), total }))
  }, [expenses])

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={52}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{label}</p>
                <p className="tnum mt-0.5">{inr(payload[0].value as number)}</p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  )
}
