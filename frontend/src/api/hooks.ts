// TanStack Query hooks — one thin hook per API resource.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Expense, Group, Membership } from '../types'

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
