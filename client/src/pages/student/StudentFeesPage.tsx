import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Download } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type PaymentConfig = {
  upi_id?: string; upi_name?: string; upi_qr_url?: string
  bank_name?: string; account_number?: string; ifsc_code?: string
  account_holder?: string; branch?: string
}

type StaffMember = { id: string; user_name: string; role: string }

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

export default function StudentFeesPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const [payModal, setPayModal] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'))
  const [payForm, setPayForm] = useState({
    payment_mode: '', paid_date: format(new Date(), 'yyyy-MM-dd'),
    reference_id: '', paid_amount: '', cash_received_by: '',
  })
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

  const { data: payConfig = {} as PaymentConfig } = useQuery<PaymentConfig>({
    queryKey: ['payment-config'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/payment-config`)
      return res.json()
    },
  })

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/staff`)
      return res.json()
    },
  })

  const existingRecords = feeHistory.filter((fc: any) => fc.month.startsWith(selectedMonth))
  const totalPaidForMonth = existingRecords.reduce((s: number, fc: any) => s + (fc.paid_amount || 0), 0)
  const monthlyAmount = feeStructure?.amount || 0
  const balanceForMonth = Math.max(0, monthlyAmount - totalPaidForMonth)

  const payMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!payForm.payment_mode) throw new Error('Select a payment mode')
      if (!payForm.paid_date) throw new Error('Enter payment date')
      if (!payForm.paid_amount || parseFloat(payForm.paid_amount) <= 0) throw new Error('Enter a valid amount')
      if (payForm.payment_mode === 'cash' && !payForm.cash_received_by)
        throw new Error('Select who received the cash')
      if ((payForm.payment_mode === 'upi' || payForm.payment_mode === 'bank_transfer') && !payForm.reference_id)
        throw new Error('Enter the transaction / UTR reference number')

      const monthDate = `${selectedMonth}-01`
      const res = await fetch(`${API_URL}/api/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthDate,
          student_id: student!.id,
          fee_structure_id: student!.fee_structure_id || null,
          amount: monthlyAmount,
          paid_amount: parseFloat(payForm.paid_amount),
          paid_date: payForm.paid_date,
          payment_mode: payForm.payment_mode,
          reference_id: payForm.reference_id || null,
          cash_received_by: payForm.payment_mode === 'cash' ? payForm.cash_received_by || null : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to record payment')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-fees'] })
      setPayModal(false)
      alert('Payment submitted! You will receive a receipt once it is verified by the admin.')
    },
    onError: (e: Error) => setFormError(e.message),
  })

  async function downloadReceipt(id: string) {
    const res = await fetch(`${API_URL}/api/fee/${id}/receipt-download`)
    const json = await res.json()
    if (!res.ok || !json.url) { alert('Receipt not available yet'); return }
    window.location.href = json.url
  }

  function openPayModal() {
    setPayForm({
      payment_mode: '',
      paid_date: format(new Date(), 'yyyy-MM-dd'),
      reference_id: '',
      paid_amount: (balanceForMonth > 0 ? balanceForMonth : monthlyAmount).toString() || '',
      cash_received_by: '',
    })
    setFormError('')
    setPayModal(true)
  }

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return format(startOfMonth(d), 'yyyy-MM')
  })

  const hasUpiConfig = payConfig.upi_id || payConfig.upi_qr_url
  const hasBankConfig = payConfig.account_number

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Fees</h1>
        <p className="text-sm text-gray-500 mt-1">View and pay monthly fees</p>
      </div>

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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Pay Fees</h2>
        <div className="flex items-end gap-4">
          <FormField label="Select Month">
            <Select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</option>)}
            </Select>
          </FormField>
          <div className="flex items-center gap-3">
            {totalPaidForMonth > 0 && (
              <span className={`badge ${balanceForMonth <= 0 ? 'badge-green' : 'badge-yellow'} text-sm px-3 py-1.5`}>
                {balanceForMonth <= 0 ? 'Paid ✓' : `Balance ${formatCurrency(balanceForMonth)}`}
              </span>
            )}
            <Button onClick={openPayModal} disabled={!feeStructure}>
              {totalPaidForMonth > 0 ? 'Add Payment' : 'Pay'}
            </Button>
          </div>
        </div>
      </div>

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
              const isVerified = fc.status === 'verified' || !!fc.receipt_url
              const isSubmitted = !isVerified && (fc.status === 'submitted' || (fc.paid_amount || 0) > 0)
              const statusLabel = isVerified ? 'Verified ✓' : isSubmitted ? 'Pending Verification' : 'Pending'
              const statusCls = isVerified ? 'badge-green' : isSubmitted ? 'badge-yellow' : 'badge-red'
              return (
                <tr key={fc.id}>
                  <td className="font-medium">{format(new Date(fc.month), 'MMMM yyyy')}</td>
                  <td>{formatCurrency(fc.amount)}</td>
                  <td className="text-green-600">{formatCurrency(fc.paid_amount || 0)}</td>
                  <td>{formatDate(fc.paid_date)}</td>
                  <td className="capitalize">{fc.payment_mode?.replace('_', ' ') || '—'}</td>
                  <td><span className={`badge ${statusCls}`}>{statusLabel}</span></td>
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

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Pay Fees" size="md">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">
              {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} — Amount Due: {formatCurrency(feeStructure?.amount || 0)}
            </p>
          </div>

          <FormField label="Amount (₹)" required>
            <Input type="number" value={payForm.paid_amount} onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))} />
          </FormField>

          <FormField label="Payment Mode" required>
            <Select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value, reference_id: '', cash_received_by: '' }))}>
              <option value="">— Select —</option>
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </FormField>

          {/* UPI */}
          {payForm.payment_mode === 'upi' && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Pay via UPI</p>
              {payConfig.upi_qr_url && (
                <div className="flex justify-center">
                  <img src={payConfig.upi_qr_url} alt="UPI QR Code" className="w-48 h-48 object-contain border rounded-lg p-2" />
                </div>
              )}
              {payConfig.upi_id && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">UPI ID</p>
                  <p className="font-mono font-semibold text-gray-800">{payConfig.upi_id}</p>
                  {payConfig.upi_name && <p className="text-xs text-gray-500">{payConfig.upi_name}</p>}
                </div>
              )}
              {!hasUpiConfig && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded p-2 text-center">UPI details not configured yet. Contact admin.</p>
              )}
              <FormField label="UTR / Transaction Reference" required>
                <Input value={payForm.reference_id} onChange={e => setPayForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="Enter UTR or transaction ID from your UPI app" />
              </FormField>
              <FormField label="Payment Date" required>
                <Input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
              </FormField>
            </div>
          )}

          {/* Bank Transfer */}
          {payForm.payment_mode === 'bank_transfer' && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Bank Transfer Details</p>
              {hasBankConfig ? (
                <div className="space-y-1.5 text-sm">
                  {payConfig.bank_name && <div className="flex justify-between"><span className="text-gray-500">Bank</span><span className="font-medium">{payConfig.bank_name}</span></div>}
                  {payConfig.account_holder && <div className="flex justify-between"><span className="text-gray-500">Account Name</span><span className="font-medium">{payConfig.account_holder}</span></div>}
                  {payConfig.account_number && <div className="flex justify-between"><span className="text-gray-500">Account Number</span><span className="font-mono font-medium">{payConfig.account_number}</span></div>}
                  {payConfig.ifsc_code && <div className="flex justify-between"><span className="text-gray-500">IFSC Code</span><span className="font-mono font-medium">{payConfig.ifsc_code}</span></div>}
                  {payConfig.branch && <div className="flex justify-between"><span className="text-gray-500">Branch</span><span className="font-medium">{payConfig.branch}</span></div>}
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 rounded p-2 text-center">Bank details not configured yet. Contact admin.</p>
              )}
              <FormField label="Transaction Reference Number" required>
                <Input value={payForm.reference_id} onChange={e => setPayForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="Enter NEFT/IMPS/RTGS reference number" />
              </FormField>
              <FormField label="Payment Date" required>
                <Input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
              </FormField>
            </div>
          )}

          {/* Cash */}
          {payForm.payment_mode === 'cash' && (
            <div className="space-y-3">
              <FormField label="Payment Date" required>
                <Input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
              </FormField>
              <FormField label="Cash Paid To" required hint="Select the coach or admin you paid">
                <Select value={payForm.cash_received_by} onChange={e => setPayForm(f => ({ ...f, cash_received_by: e.target.value }))}>
                  <option value="">— Select —</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.user_name} ({s.role})</option>)}
                </Select>
              </FormField>
            </div>
          )}

          {payForm.payment_mode && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 text-center">
              Your payment will be confirmed once verified by the admin. Receipt will be emailed after verification.
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setPayModal(false)}>Cancel</Button>
            <Button
              onClick={() => payMutation.mutate()}
              loading={payMutation.isPending}
              disabled={!payForm.payment_mode}
            >
              Submit Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
