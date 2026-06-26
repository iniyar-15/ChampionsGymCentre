import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Mail, Download } from 'lucide-react'
import type { FeeCollectionRow, StudentRow, FeeStructureRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/FormField'
import { formatCurrency, formatDate, PAYMENT_MODES } from '@/lib/utils'
import { format, startOfMonth, subMonths, addMonths } from 'date-fns'
import { useAuth } from '@/context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

type FeeCollectionFull = FeeCollectionRow & {
  students: { name: string; contact_phone: string } | null
  fee_structures: { name: string; amount: number } | null
}

type StaffMember = { id: string; user_name: string; role: string }

const emptyForm = {
  month: format(startOfMonth(new Date()), 'yyyy-MM'),
  student_id: '', fee_structure_id: '', amount: '',
  paid_amount: '0', paid_date: '', payment_mode: '', reference_id: '', notes: '',
  cash_received_by: '',
}

export default function FeeCollectionPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'))
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FeeCollectionRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['fee-collections', filterMonth],
    queryFn: async () => {
      const monthStart = `${filterMonth}-01`
      const { data } = await supabase
        .from('fee_collections')
        .select('*, students(name, contact_phone), fee_structures(name, amount)')
        .eq('month', monthStart)
        .order('created_at', { ascending: false })
      return (data || []) as FeeCollectionFull[]
    },
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, contact_phone, fee_structure_id, fee_structures(name, amount)')
        .eq('is_active', true)
        .order('name')
      return (data || []) as unknown as { id: string; name: string; contact_phone: string; fee_structure_id: string | null; fee_structures: { name: string; amount: number } | null }[]
    },
  })

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/staff`)
      return res.json()
    },
  })

  function onStudentChange(studentId: string) {
    const student = students.find(s => s.id === studentId)
    setForm(f => ({
      ...f,
      student_id: studentId,
      fee_structure_id: student?.fee_structure_id || '',
      amount: student?.fee_structures?.amount?.toString() || '',
    }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.student_id) throw new Error('Student is required')
      if (!form.amount) throw new Error('Fee amount is required')
      if (form.payment_mode === 'cash' && parseFloat(form.paid_amount) > 0 && !form.cash_received_by)
        throw new Error('Please select who received the cash payment')

      const payload = {
        month: `${form.month}-01`,
        student_id: form.student_id,
        fee_structure_id: form.fee_structure_id || null,
        amount: parseFloat(form.amount),
        paid_amount: parseFloat(form.paid_amount) || 0,
        paid_date: form.paid_date || null,
        payment_mode: form.payment_mode || null,
        reference_id: form.reference_id || null,
        notes: form.notes || null,
        created_by: appUser?.type === 'staff' ? appUser.id : null,
        cash_received_by: form.payment_mode === 'cash' ? form.cash_received_by || null : null,
      }

      const url = editing ? `${API_URL}/api/fee/${editing.id}` : `${API_URL}/api/fee`
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save fee record')
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee-collections'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const resendReceiptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/fee/${id}/send-receipt`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to send receipt')
    },
    onSuccess: () => alert('Receipt emailed to student.'),
    onError: () => alert('Failed to send receipt. Check student email is set.'),
  })

  async function downloadReceipt(id: string) {
    const res = await fetch(`${API_URL}/api/fee/${id}/receipt-download`)
    const json = await res.json()
    if (!res.ok || !json.url) { alert(json.error || 'No receipt available'); return }
    window.location.href = json.url
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('fee_collections').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee-collections'] }); setDeleteId(null) },
  })

  function openCreate() { setEditing(null); setForm({ ...emptyForm, month: filterMonth }); setFormError(''); setModalOpen(true) }
  function openEdit(fc: FeeCollectionFull) {
    setEditing(fc)
    setForm({
      month: fc.month.slice(0, 7),
      student_id: fc.student_id,
      fee_structure_id: fc.fee_structure_id || '',
      amount: fc.amount.toString(),
      paid_amount: fc.paid_amount?.toString() || '0',
      paid_date: fc.paid_date || '',
      payment_mode: fc.payment_mode || '',
      reference_id: fc.reference_id || '',
      notes: fc.notes || '',
      cash_received_by: (fc as any).cash_received_by || '',
    })
    setFormError('')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditing(null) }

  const filtered = collections.filter(fc =>
    fc.students?.name.toLowerCase().includes(search.toLowerCase()) ||
    fc.students?.contact_phone.includes(search)
  )

  const totalCollected = filtered.reduce((s, fc) => s + (fc.paid_amount || 0), 0)
  const totalDue = filtered.reduce((s, fc) => s + (fc.amount - (fc.paid_amount || 0)), 0)

  // Month options: last 12 months → current → next 2
  const now = startOfMonth(new Date())
  const monthOptions = Array.from({ length: 15 }, (_, i) =>
    format(addMonths(subMonths(now, 12), i), 'yyyy-MM')
  )

  return (
    <div>
      <PageHeader
        title="Fee Collection"
        subtitle="Track monthly fee payments"
        action={{ label: 'Record Payment', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium mb-1">Total Billed</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(filtered.reduce((s, fc) => s + fc.amount, 0))}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium mb-1">Collected</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDue)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 px-5 py-4 border-b flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by student…" />
          <Select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-44">
            {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy')}</option>)}
          </Select>
          <span className="text-sm text-gray-500 ml-auto">{filtered.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Fee Structure</th>
                <th>Due Amount</th>
                <th>Paid Amount</th>
                <th>Paid On</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No records for this month</td></tr>
              ) : filtered.map(fc => {
                const balance = fc.amount - (fc.paid_amount || 0)
                const status = balance <= 0 ? 'Paid' : fc.paid_amount ? 'Partial' : 'Pending'
                return (
                  <tr key={fc.id}>
                    <td>
                      <p className="font-medium">{fc.students?.name}</p>
                      <p className="text-xs text-gray-500">{fc.students?.contact_phone}</p>
                    </td>
                    <td>{fc.fee_structures?.name || '—'}</td>
                    <td>{formatCurrency(fc.amount)}</td>
                    <td className="font-medium text-green-600">{formatCurrency(fc.paid_amount || 0)}</td>
                    <td>{formatDate(fc.paid_date)}</td>
                    <td>{fc.payment_mode || '—'}</td>
                    <td className="text-xs">{fc.reference_id || '—'}</td>
                    <td>
                      <span className={`badge ${status === 'Paid' ? 'badge-green' : status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(fc)}><Pencil size={14} /></Button>
                        {(fc as any).receipt_url && (
                          <Button size="sm" variant="ghost" onClick={() => downloadReceipt(fc.id)} title="Download receipt">
                            <Download size={14} />
                          </Button>
                        )}
                        {(fc.paid_amount || 0) > 0 && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => resendReceiptMutation.mutate(fc.id)}
                            loading={resendReceiptMutation.isPending}
                            title="Email receipt"
                          >
                            <Mail size={14} />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(fc.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Fee Record' : 'Record Fee Payment'} size="lg">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Month" required>
              <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
            </FormField>
            <FormField label="Student" required>
              <Select value={form.student_id} onChange={e => onStudentChange(e.target.value)}>
                <option value="">— Select Student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.contact_phone})</option>)}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fee Amount (₹)" required>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </FormField>
            <FormField label="Amount Paid (₹)" required>
              <Input type="number" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment Date">
              <Input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))} />
            </FormField>
            <FormField label="Payment Mode">
              <Select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}>
                <option value="">— Select —</option>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </Select>
            </FormField>
          </div>

          {form.payment_mode === 'cash' && parseFloat(form.paid_amount) > 0 && (
            <FormField label="Cash Received By" required hint="Select who received the cash">
              <Select value={form.cash_received_by} onChange={e => setForm(f => ({ ...f, cash_received_by: e.target.value }))}>
                <option value="">— Select Staff —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.user_name} ({s.role})
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {form.payment_mode !== 'cash' && (
            <FormField label="Reference / Transaction ID">
              <Input value={form.reference_id} onChange={e => setForm(f => ({ ...f, reference_id: e.target.value }))} placeholder="UPI ref, cheque no…" />
            </FormField>
          )}

          <FormField label="Notes">
            <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Save Record'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Fee Record"
        message="Delete this fee collection record?"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}