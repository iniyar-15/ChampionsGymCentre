import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import { formatCurrency, formatDate, PAYMENT_MODES } from '@/lib/utils'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Download } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function StudentFeesPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const [payModal, setPayModal] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'))
  const [payForm, setPayForm] = useState({ payment_mode: '', paid_date: format(new Date(), 'yyyy-MM-dd'), reference_id: '', paid_amount: '' })
  const [formError, setFormError] = useState('')

  const { data: feeHistory = [] } = useQuery({
    queryKey: ['student-fees', student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/fee/student/${student!.id}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: feeStructure } = useQuery({
    queryKey: ['student-fee-structure', student?.fee_structure_id],
    enabled: !!student?.fee_structure_id,
    queryFn: async () => {
      const { data } = await supabase.from('fee_structures').select('*').eq('id', student!.fee_structure_id!).single()
      return data
    },
  })

  const existingRecord = feeHistory.find((fc: any) => fc.month.startsWith(selectedMonth))

  const payMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!payForm.payment_mode) throw new Error('Select payment mode')
      if (!payForm.paid_date) throw new Error('Enter payment date')
      if (!payForm.paid_amount) throw new Error('Enter amount paid')

      const monthDate = `${selectedMonth}-01`
      const amount = feeStructure?.amount || 0

      if (existingRecord) {
        const res = await fetch(`${API_URL}/api/fee/${(existingRecord as any).id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: monthDate,
            student_id: student!.id,
            fee_structure_id: student!.fee_structure_id || null,
            amount,
            paid_amount: parseFloat(payForm.paid_amount),
            paid_date: payForm.paid_date,
            payment_mode: payForm.payment_mode,
            reference_id: payForm.reference_id || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to update payment')
      } else {
        const res = await fetch(`${API_URL}/api/fee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: monthDate,
            student_id: student!.id,
            fee_structure_id: student!.fee_structure_id || null,
            amount,
            paid_amount: parseFloat(payForm.paid_amount),
            paid_date: payForm.paid_date,
            payment_mode: payForm.payment_mode,
            reference_id: payForm.reference_id || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to record payment')
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student-fees'] }); setPayModal(false) },
    onError: (e: Error) => setFormError(e.message),
  })

  async function downloadReceipt(id: string) {
    const res = await fetch(`${API_URL}/api/fee/${id}/receipt-download`)
    const json = await res.json()
    if (!res.ok || !json.url) { alert('Receipt not available yet'); return }
    window.open(json.url, '_blank')
  }

  function openPayModal() {
    setPayForm({
      payment_mode: '',
      paid_date: format(new Date(), 'yyyy-MM-dd'),
      reference_id: (existingRecord as any)?.reference_id || '',
      paid_amount: feeStructure?.amount?.toString() || '',
    })
    setFormError('')
    setPayModal(true)
  }

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return format(startOfMonth(d), 'yyyy-MM')
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Fees</h1>
        <p className="text-sm text-gray-500 mt-1">View and pay monthly fees</p>
      </div>

      {/* Fee plan banner */}
      {feeStructure && (
        <div className="bg-blue-600 rounded-xl p-5 mb-6 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm">Your Fee Plan</p>
            <p className="text-xl font-bold mt-1">{feeStructure.name}</p>
            <p className="text-blue-200 text-sm mt-0.5">{feeStructure.days_per_week} days per week</p>
          </div>
          <p className="text-3xl font-bold">{formatCurrency(feeStructure.amount)}<span className="text-lg text-blue-200">/mo</span></p>
        </div>
      )}

      {/* Pay section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Pay Fees</h2>
        <div className="flex items-end gap-4">
          <FormField label="Select Month">
            <Select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</option>)}
            </Select>
          </FormField>
          {existingRecord ? (
            <div className="flex items-center gap-3">
              {(existingRecord as any).paid_amount >= (existingRecord as any).amount ? (
                <span className="badge badge-green text-sm px-3 py-1.5">Paid ✓</span>
              ) : (
                <>
                  <span className="badge badge-yellow text-sm px-3 py-1.5">
                    Partial — Balance {formatCurrency((existingRecord as any).amount - (existingRecord as any).paid_amount)}
                  </span>
                  <Button onClick={openPayModal}>Pay Balance</Button>
                </>
              )}
            </div>
          ) : (
            <Button onClick={openPayModal} disabled={!feeStructure}>Pay Now</Button>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Payment History</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Month</th><th>Amount Due</th><th>Amount Paid</th><th>Paid On</th><th>Mode</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {feeHistory.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No payment history</td></tr>
            ) : feeHistory.map((fc: any) => {
              const balance = fc.amount - (fc.paid_amount || 0)
              const status = balance <= 0 ? 'Paid' : fc.paid_amount ? 'Partial' : 'Pending'
              return (
                <tr key={fc.id}>
                  <td className="font-medium">{format(new Date(fc.month), 'MMMM yyyy')}</td>
                  <td>{formatCurrency(fc.amount)}</td>
                  <td className="text-green-600">{formatCurrency(fc.paid_amount || 0)}</td>
                  <td>{formatDate(fc.paid_date)}</td>
                  <td>{fc.payment_mode || '—'}</td>
                  <td><span className={`badge ${status === 'Paid' ? 'badge-green' : status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{status}</span></td>
                  <td>
                    {fc.receipt_url && (
                      <Button size="sm" variant="ghost" onClick={() => downloadReceipt(fc.id)} title="Download receipt">
                        <Download size={14} />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Pay Fees" size="sm">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">
              {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} — Amount Due: {formatCurrency(feeStructure?.amount || 0)}
            </p>
          </div>

          <FormField label="Amount Paying (₹)" required>
            <Input type="number" value={payForm.paid_amount} onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))} />
          </FormField>
          <FormField label="Payment Mode" required>
            <Select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}>
              <option value="">— Select —</option>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </Select>
          </FormField>
          <FormField label="Payment Date" required>
            <Input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
          </FormField>
          <FormField label="Transaction / Reference ID">
            <Input value={payForm.reference_id} onChange={e => setPayForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="UPI ref, receipt no…" />
          </FormField>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setPayModal(false)}>Cancel</Button>
            <Button onClick={() => payMutation.mutate()} loading={payMutation.isPending}>Confirm Payment</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}