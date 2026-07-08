// TanStack Query hooks — one thin hook per API resource.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  BalanceRow,
  Breakdown,
  Expense,
  Group,
  ImportAnomaly,
  ImportBatch,
  Membership,
  Settlement,
  Transfer,
} from '../types'

// --- Groups -------------------------------------------------------------

export function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/api/groups/') })
}

export function useGroup(groupId: number) {
  return useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => api<Group>(`/api/groups/${groupId}/`),
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<Group>('/api/groups/', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

// --- Members ------------------------------------------------------------

export function useAddMember(groupId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      person_name: string
      joined_on: string
      left_on?: string | null
      role?: string
    }) => api<Membership>(`/api/groups/${groupId}/members/`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', groupId] }),
  })
}

export function useUpdateMember(groupId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; joined_on?: string; left_on?: string | null }) =>
      api<Membership>(`/api/groups/${groupId}/members/${id}/`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', groupId] }),
  })
}

// --- Expenses -----------------------------------------------------------

export interface ExpenseInput {
  date: string
  description: string
  payer_name: string
  original_amount: string
  original_currency: string
  split_type: string
  participants: string[]
  split_details?: Record<string, string> | null
  notes?: string
}

export function useExpenses(groupId: number) {
  return useQuery({
    queryKey: ['expenses', groupId],
    queryFn: () => api<Expense[]>(`/api/groups/${groupId}/expenses/`),
  })
}

export function useCreateExpense(groupId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpenseInput) =>
      api<Expense>(`/api/groups/${groupId}/expenses/`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] })
      qc.invalidateQueries({ queryKey: ['balances', groupId] })
    },
  })
}

export function useDeleteExpense(groupId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: number) =>
      api(`/api/expenses/${expenseId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] })
      qc.invalidateQueries({ queryKey: ['balances', groupId] })
    },
  })
}

// --- Balances & settlements ----------------------------------------------

export function useBalances(groupId: number) {
  return useQuery({
    queryKey: ['balances', groupId],
    queryFn: () => api<BalanceRow[]>(`/api/groups/${groupId}/balances/`),
  })
}

export function useSimplifiedBalances(groupId: number) {
  return useQuery({
    queryKey: ['balances', groupId, 'simplified'],
    queryFn: () => api<Transfer[]>(`/api/groups/${groupId}/balances/simplified/`),
  })
}

export function useBreakdown(groupId: number, personId: number | null) {
  return useQuery({
    queryKey: ['balances', groupId, 'breakdown', personId],
    queryFn: () => api<Breakdown>(`/api/groups/${groupId}/balances/${personId}/breakdown/`),
    enabled: personId !== null,
  })
}

export function useSettlements(groupId: number) {
  return useQuery({
    queryKey: ['settlements', groupId],
    queryFn: () => api<Settlement[]>(`/api/groups/${groupId}/settlements/`),
  })
}

export function useCreateSettlement(groupId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      date: string
      from_person_name: string
      to_person_name: string
      original_amount: string
      original_currency: string
      notes?: string
    }) => api<Settlement>(`/api/groups/${groupId}/settlements/`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', groupId] })
      qc.invalidateQueries({ queryKey: ['balances', groupId] })
    },
  })
}

// --- Import -----------------------------------------------------------------

export function useUploadImport(groupId: number) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api<ImportBatch>(`/api/groups/${groupId}/imports/`, {
        method: 'POST',
        form,
      })
    },
  })
}

export function useImportBatch(batchId: number | null) {
  return useQuery({
    queryKey: ['imports', batchId],
    queryFn: () => api<ImportBatch>(`/api/imports/${batchId}/`),
    enabled: batchId !== null,
  })
}

export function useResolveAnomaly(batchId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      anomalyId,
      status,
      resolution,
    }: {
      anomalyId: number
      status: 'approved' | 'rejected'
      resolution?: Record<string, unknown>
    }) =>
      api<ImportAnomaly>(`/api/imports/${batchId}/anomalies/${anomalyId}/`, {
        method: 'PATCH',
        body: { status, resolution_json: resolution ?? null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['imports', batchId] }),
  })
}

export function useCommitImport(groupId: number, batchId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<ImportBatch>(`/api/imports/${batchId}/commit/`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports', batchId] })
      qc.invalidateQueries({ queryKey: ['expenses', groupId] })
      qc.invalidateQueries({ queryKey: ['balances', groupId] })
      qc.invalidateQueries({ queryKey: ['settlements', groupId] })
      qc.invalidateQueries({ queryKey: ['groups', groupId] })
    },
  })
}
