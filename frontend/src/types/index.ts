// API types mirroring the Django serializers.

export interface User {
  id: number
  email: string
  name: string
}

export interface Person {
  id: number
  name: string
  display_name?: string
  is_guest: boolean
}

export interface Membership {
  id: number
  person: Person
  joined_on: string
  left_on: string | null
  role: 'member' | 'guest'
}

export interface Group {
  id: number
  name: string
  base_currency: string
  created_at: string
  memberships: Membership[]
}

export type SplitType = 'equal' | 'unequal' | 'percentage' | 'share'

export type ExpenseStatus =
  | 'active'
  | 'needs_input'
  | 'void'
  | 'superseded'
  | 'pending_approval'

export interface ExpenseShare {
  id: number
  person: Person
  share_amount_inr: string
  weight: string | null
}

export interface Expense {
  id: number
  group: number
  date: string
  description: string
  payer: Person | null
  original_amount: string
  original_currency: string
  amount_inr: string
  fx_rate: string | null
  fx_rate_date: string | null
  split_type: SplitType
  split_raw: Record<string, string> | null
  notes: string
  status: ExpenseStatus
  is_refund: boolean
  source_row_number: number | null
  shares: ExpenseShare[]
}

export interface Settlement {
  id: number
  group: number
  date: string
  from_person: Person
  to_person: Person
  original_amount: string
  original_currency: string
  amount_inr: string
  notes: string
}

export interface BalanceRow {
  person: Person
  paid: string
  share: string
  settled_out: string
  settled_in: string
  net: string
}

export interface Transfer {
  from: Person
  to: Person
  amount: string
}

export interface Breakdown {
  person: Person
  paid: Array<{
    id: number
    date: string
    description: string
    amount_inr: string
    original_amount: string
    original_currency: string
  }>
  shares: Array<{
    expense_id: number
    share_amount_inr: string
    expense__date: string
    expense__description: string
    expense__amount_inr: string
    expense__split_type: SplitType
  }>
  settlements_paid: Array<{
    id: number
    date: string
    amount_inr: string
    to_person__name: string
    notes: string
  }>
  settlements_received: Array<{
    id: number
    date: string
    amount_inr: string
    from_person__name: string
    notes: string
  }>
  net: string
}

export type AnomalyStatus = 'auto_applied' | 'pending_approval' | 'approved' | 'rejected'
export type AnomalySeverity = 'info' | 'warning' | 'blocking'

export interface ImportAnomaly {
  id: number
  anomaly_type: string
  severity: AnomalySeverity
  source_row_numbers: number[]
  description: string
  policy: string
  status: AnomalyStatus
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  resolution_json: Record<string, unknown> | null
  resolved_at: string | null
}

export interface ImportRow {
  row: number
  raw: Record<string, string>
  parsed: Record<string, unknown>
  action: string
  status: string
  anomalies: number[]
}

export interface ImportBatch {
  id: number
  group: number
  filename: string
  uploaded_at: string
  total_rows: number
  status: 'parsing' | 'awaiting_approval' | 'committed'
  reanalyzed?: boolean
  rows_json: ImportRow[]
  report_json: ImportReport | null
  anomalies: ImportAnomaly[]
}

export interface ImportReport {
  generated_at: string
  group: string
  filename: string
  total_rows: number
  summary: {
    anomalies_detected: number
    anomaly_types: number
    auto_applied: number
    approved: number
    rejected: number
    row_outcomes: Record<string, number>
  }
  anomalies: Array<{
    id: number
    type: string
    severity: AnomalySeverity
    rows: number[]
    description: string
    policy: string
    decision: AnomalyStatus
    resolution: Record<string, unknown> | null
  }>
  row_outcomes: Record<string, { outcome: string; id?: number; reason?: string }>
}
