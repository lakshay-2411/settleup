import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateSettlement } from '@/api/hooks'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Group } from '@/types'

export function SettleDialog({
  group,
  initial,
  onClose,
}: {
  group: Group
  initial: { from: string; to: string; amount: string }
  onClose: () => void
}) {
  const createSettlement = useCreateSettlement(group.id)
  const memberNames = group.memberships.map((m) => m.person.name)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [amount, setAmount] = useState(initial.amount)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createSettlement.mutateAsync({
        date,
        from_person_name: from,
        to_person_name: to,
        original_amount: amount,
        original_currency: 'INR',
        notes,
      })
      toast.success(`Payment recorded: ${from} → ${to}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the payment')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PersonAvatar name={from} size="sm" />
            Record a payment
          </DialogTitle>
          <DialogDescription>Settling reduces debt — it isn’t a shared cost.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-amount">Amount (INR)</Label>
              <Input
                id="s-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-date">Date</Label>
              <Input
                id="s-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-notes">Notes (optional)</Label>
            <Input
              id="s-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="UPI, cash…"
              className="rounded-xl"
            />
          </div>
          <Button type="submit" disabled={createSettlement.isPending} className="h-11 w-full rounded-xl">
            {createSettlement.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
