import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import { formatCurrency, formatDate, PAYMENT_MODES } from '@/lib/utils'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Download, CreditCard } from 'lucide-react'

type StaffMember = { id: string; user_name: string; role: string }

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function StudentFeesPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const [payModal, setPayModal] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'))
  const [payForm, setPayForm] = useState({ payment_mode: '', paid_date: format(new Date(), 'yyyy-MM-dd'), reference_id: '', paid_amount: '', cash_received_by: '' })
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
      if (!payForm.payment_mode) throw new Error('Select payment mode')
      if (!payForm.paid_date) throw new Error('Enter payment date')
      if (!payForm.paid_amount) throw new Error('Enter amount paid')
      if (payForm.payment_mode === 'cash' && !payForm.cash_received_by)
        throw new Error('Please select who received the cash payment')

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student-fees'] }); setPayModal(false) },
    onError: (e: Error) => setFormError(e.message),
  })

  async function loadRazorpayScript(): Promise<boolean> {
    if ((window as any).Razorpay) return true
    return new Promise(resolve => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handlePayOnline(amountOverride?: number) {
    if (!feeStructure || !student) return
    const loaded = await loadRazorpayScript()
    if (!loaded) { alert('Failed to load payment gateway. Please try again.'); return }

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID
    if (!keyId || keyId.startsWith('rzp_test_your')) {
      alert('Payment gateway not configured yet. Please contact the admin.')
      return
    }

    setPayModal(false)

    // Create order on server
    const res = await fetch(`${API_URL}/api/fee/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountOverride ?? feeStructure.amount,
        studentId: student.id,
        month: selectedMonth,
        feeStructureId: student.fee_structure_id,
      }),
    })
    const order = await res.json()
    if (!res.ok) { alert(order.error || 'Failed to initiate payment'); return }

    const options = {
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Champions Gymnastics Center',
      description: `Fee for ${format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}`,
      order_id: order.orderId,
      prefill: {
        name: student.name,
        contact: student.contact_phone,
        email: student.email || '',
      },
      theme: { color: '#1d4ed8' },
      handler: async (response: any) => {
        const verifyRes = await fetch(`${API_URL}/api/fee/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            studentId: student.id,
            month: selectedMonth,
            feeStructureId: student.fee_structure_id,
            amount: order.amount,
          }),
        })
        const result = await verifyRes.json()
        if (verifyRes.ok) {
          qc.invalidateQueries({ queryKey: ['student-fees', student.id] })
          alert('Payment successful! A receipt has been emailed to you.')
        } else {
          alert(result.error || 'Payment recorded but verification failed. Contact admin.')
        }
      },
    }
    const rzp = new (window as any).Razorpay(options)
    rzp.open()
  }

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
              const isCash = fc.payment_mode === 'cash'
              const hasPaid = (fc.paid_amount || 0) > 0
              const isApproved = !!fc.receipt_url
              const isPendingApproval = isCash && hasPaid && !isApproved
              const balance = fc.amount - (fc.paid_amount || 0)
              const status = isPendingApproval ? 'Pending Approval' : balance <= 0 ? 'Paid' : fc.paid_amount ? 'Partial' : 'Pending'
              return (
                <tr key={fc.id}>
                  <td className="font-medium">{format(new Date(fc.month), 'MMMM yyyy')}</td>
                  <td>{formatCurrency(fc.amount)}</td>
                  <td className="text-green-600">{formatCurrency(fc.paid_amount || 0)}</td>
                  <td>{formatDate(fc.paid_date)}</td>
                  <td>{fc.payment_mode || '—'}</td>
                  <td>
                    <span className={`badge ${
                      status === 'Paid' ? 'badge-green'
                      : status === 'Pending Approval' ? 'badge-yellow'
                      : status === 'Partial' ? 'badge-yellow'
                      : 'badge-red'
                    }`}>{status}</span>
                  </td>
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
        {(() => {
          const txnFeePercent = parseFloat(import.meta.env.VITE_TRANSACTION_FEE_PERCENT || '2')
          const baseAmount = parseFloat(payForm.paid_amount) || 0
          const isOnline = payForm.payment_mode && payForm.payment_mode !== 'cash'
          const txnFee = isOnline ? Math.round(baseAmount * txnFeePercent) / 100 : 0
          const txnFeeGST = Math.round(txnFee * 18) / 100
          const totalAmount = baseAmount + txnFee + txnFeeGST

          return (
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
                <Select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}>
                  <option value="">— Select —</option>
                  {PAYMENT_MODES.map(m => (
                    <option key={m} value={m}>
                      {m === 'upi' ? 'UPI' : m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* Cash-only fields */}
              {payForm.payment_mode === 'cash' && (
                <>
                  <FormField label="Payment Date" required>
                    <Input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
                  </FormField>
                  <FormField label="Cash Paid To" required hint="Select the coach or admin you paid">
                    <Select value={payForm.cash_received_by} onChange={e => setPayForm(f => ({ ...f, cash_received_by: e.target.value }))}>
                      <option value="">— Select —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.user_name} ({s.role})</option>
                      ))}
                    </Select>
                  </FormField>
                </>
              )}

              {/* Online payment breakdown */}
              {isOnline && baseAmount > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-2 bg-gray-50">
                    <span className="text-gray-600">Fee amount</span>
                    <span>{formatCurrency(baseAmount)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 bg-gray-50 border-t border-gray-200">
                    <span className="text-gray-600">Transaction fee ({txnFeePercent}%)</span>
                    <span>{formatCurrency(txnFee)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 bg-gray-50 border-t border-gray-200">
                    <span className="text-gray-600">GST on transaction fee (18%)</span>
                    <span>{formatCurrency(txnFeeGST)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 bg-blue-600 text-white font-semibold border-t">
                    <span>Total to Pay</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              )}

              {isOnline && baseAmount > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  You'll be redirected to our secure payment gateway
                </p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setPayModal(false)}>Cancel</Button>
                {payForm.payment_mode === 'cash' ? (
                  <Button onClick={() => payMutation.mutate()} loading={payMutation.isPending}>
                    Record Payment
                  </Button>
                ) : (
                  <Button
                    onClick={() => handlePayOnline(totalAmount)}
                    disabled={!payForm.payment_mode || !payForm.paid_amount}
                  >
                    <CreditCard size={15} /> Pay {baseAmount > 0 ? formatCurrency(totalAmount) : ''} →
                  </Button>
                )}
              </div>
            </div>
          )
        })()}

      </Modal>
    </div>
  )
}