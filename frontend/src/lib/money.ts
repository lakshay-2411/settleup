// All money rendering goes through here: Indian digit grouping + tabular nums.

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const inrCompactFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function inr(value: string | number) {
  return inrFmt.format(Number(value))
}

/** Whole-rupee form for stat tiles ("₹2,60,749"). */
export function inrCompact(value: string | number) {
  return inrCompactFmt.format(Number(value))
}

export function foreign(amount: string | number, currency: string) {
  return Number(amount).toLocaleString('en-US', { style: 'currency', currency })
}
