import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { FeeStructureRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/FormField'
import { formatCurrency } from '@/lib/utils'

const emptyForm = { name: '', days_per_week: '', amount: '' }

export default function FeeStructuresPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FeeStructureRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['fee-structures'],
    queryFn: async () => {
      const { data } = await supabase.from('fee_structures').select('*').order('days_per_week')
      return (data || []) as FeeStructureRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.name.trim()) throw new Error('Name is required')
      if (!form.days_per_week || isNaN(Number(form.days_per_week))) throw new Error('Days per week is required')
      if (!form.amount || isNaN(Number(form.amount))) throw new Error('Fee amount is required')

      const payload = { name: form.name, days_per_week: parseInt(form.days_per_week), amount: parseFloat(form.amount) }
      if (editing) {
        await supabase.from('fee_structures').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('fee_structures').insert(payload)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee-structures'] }); qc.invalidateQueries({ queryKey: ['fee-structures-list'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('fee_structures').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee-structures'] }); setDeleteId(null) },
  })

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setFormError(''); setModalOpen(true) }
  function openEdit(fs: FeeStructureRow) {
    setEditing(fs)
    setForm({ name: fs.name, days_per_week: fs.days_per_week.toString(), amount: fs.amount.toString() })
    setFormError('')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditing(null) }

  return (
    <div>
      <PageHeader
        title="Fee Structures"
        subtitle="Configure fee plans by days per week"
        action={{ label: 'Add Structure', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : structures.map(fs => (
          <div key={fs.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-800">{fs.name}</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(fs)}><Pencil size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteId(fs.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
              </div>
            </div>
            <p className="text-3xl font-bold text-blue-600">{formatCurrency(fs.amount)}</p>
            <p className="text-sm text-gray-500 mt-1">{fs.days_per_week} days per week</p>
          </div>
        ))}
        {!isLoading && !structures.length && (
          <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
            No fee structures yet. Add one to get started.
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Fee Structure' : 'Add Fee Structure'} size="sm">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <FormField label="Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 3 Days Plan" />
          </FormField>
          <FormField label="Days Per Week" required>
            <Input type="number" min="1" max="7" value={form.days_per_week} onChange={e => setForm(f => ({ ...f, days_per_week: e.target.value }))} />
          </FormField>
          <FormField label="Monthly Fee Amount (₹)" required>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </FormField>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Fee Structure"
        message="Delete this fee structure? Students using it won't be affected but will have no active plan."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}