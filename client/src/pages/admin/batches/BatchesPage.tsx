import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { BatchRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/FormField'
import { DAYS_OF_WEEK, formatDate, formatTime } from '@/lib/utils'

const emptyForm = {
  name: '', days: [] as string[],
  start_time: '', end_time: '',
  start_date: '', end_date: '',
}

export default function BatchesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BatchRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const { data } = await supabase.from('batches').select('*').order('name')
      return (data || []) as BatchRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.name.trim()) throw new Error('Batch name is required')
      if (!form.days.length) throw new Error('Select at least one day')
      if (!form.start_time || !form.end_time) throw new Error('Start and end time are required')

      const payload = {
        name: form.name,
        days: form.days,
        start_time: form.start_time,
        end_time: form.end_time,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }

      if (editing) {
        await supabase.from('batches').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('batches').insert(payload)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['batches-list'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('batches').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['batches'] }); setDeleteId(null) },
  })

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setFormError(''); setModalOpen(true) }
  function openEdit(b: BatchRow) {
    setEditing(b)
    setForm({ name: b.name, days: b.days || [], start_time: b.start_time, end_time: b.end_time, start_date: b.start_date || '', end_date: b.end_date || '' })
    setFormError('')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditing(null) }

  function toggleDay(day: string) {
    setForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day] }))
  }

  const filtered = batches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <PageHeader
        title="Batches"
        subtitle="Manage class batches and schedules"
        action={{ label: 'Add Batch', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder="Search batches…" />
          <span className="text-sm text-gray-500">{filtered.length} batches</span>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Batch Name</th><th>Days</th><th>Time</th><th>Start Date</th><th>End Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No batches found</td></tr>
            ) : filtered.map(b => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {b.days?.map(d => <span key={d} className="badge badge-blue">{d}</span>)}
                  </div>
                </td>
                <td>{formatTime(b.start_time)} – {formatTime(b.end_time)}</td>
                <td>{formatDate(b.start_date)}</td>
                <td>{formatDate(b.end_date)}</td>
                <td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(b.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Batch' : 'Add Batch'} size="md">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <FormField label="Batch Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Morning Batch A" />
          </FormField>

          <FormField label="Days" required>
            <div className="flex gap-2 flex-wrap mt-1">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.days.includes(day) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time" required>
              <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </FormField>
            <FormField label="End Time" required>
              <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Batch Start Date">
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </FormField>
            <FormField label="Batch End Date">
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </FormField>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Batch'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Batch"
        message="Delete this batch? Students will be unenrolled."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}