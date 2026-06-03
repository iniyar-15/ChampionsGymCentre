import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { StudentRow, LevelRow, FeeStructureRow, BatchRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import { calculateAge, formatDate, GENDER_OPTIONS } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

type StudentFull = StudentRow & {
  levels: { name: string } | null
  fee_structures: { name: string; amount: number } | null
  student_batches: { batch_id: string; batches: { name: string } }[]
}

const emptyForm = {
  name: '', parent_name: '', contact_phone: '', secondary_phone: '',
  email: '', date_of_birth: '', gender: '' as string, school: '',
  level_id: '', fee_structure_id: '', batch_ids: [] as string[],
}

export default function StudentsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('*, levels(name), fee_structures(name, amount), student_batches(batch_id, batches(name))')
        .order('name')
      return (data || []) as StudentFull[]
    },
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['levels-list'],
    queryFn: async () => {
      const { data } = await supabase.from('levels').select('id, name').order('name')
      return (data || []) as LevelRow[]
    },
  })

  const { data: feeStructures = [] } = useQuery({
    queryKey: ['fee-structures-list'],
    queryFn: async () => {
      const { data } = await supabase.from('fee_structures').select('id, name, days_per_week, amount').order('days_per_week')
      return (data || []) as FeeStructureRow[]
    },
  })

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-list'],
    queryFn: async () => {
      const { data } = await supabase.from('batches').select('id, name').order('name')
      return (data || []) as BatchRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.name.trim()) throw new Error('Student name is required')
      if (!form.contact_phone.trim()) throw new Error('Contact phone is required')
      if (!form.email.trim()) throw new Error('Email address is required')
      if (!form.date_of_birth) throw new Error('Date of birth is required')

      const payload = {
        name: form.name.trim(),
        parent_name: form.parent_name || null,
        contact_phone: form.contact_phone.trim(),
        secondary_phone: form.secondary_phone || null,
        email: form.email.trim(),
        date_of_birth: form.date_of_birth,
        gender: (form.gender || null) as StudentRow['gender'],
        school: form.school || null,
        level_id: form.level_id || null,
        fee_structure_id: form.fee_structure_id || null,
      }

      let studentId = editing?.id
      if (editing) {
        await supabase.from('students').update(payload).eq('id', editing.id)
        await supabase.from('student_batches').delete().eq('student_id', editing.id)
      } else {
        const password = form.date_of_birth.replace(/-/g, '')
        const res = await fetch(`${API_URL}/api/auth/create-student`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: form.contact_phone.trim(), password, studentData: payload }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to create student account')
        studentId = json.student?.id
      }

      if (studentId && form.batch_ids.length) {
        await supabase.from('student_batches').insert(
          form.batch_ids.map(b => ({ student_id: studentId!, batch_id: b }))
        )
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const student = students.find(s => s.id === id)
      await supabase.from('students').delete().eq('id', id)
      if (student?.auth_id) {
        await fetch(`${API_URL}/api/auth/delete-user/${student.auth_id}`, { method: 'DELETE' })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); setDeleteId(null) },
  })

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setFormError(''); setModalOpen(true) }
  function openEdit(s: StudentFull) {
    setEditing(s)
    setForm({
      name: s.name, parent_name: s.parent_name || '', contact_phone: s.contact_phone,
      secondary_phone: s.secondary_phone || '', email: s.email || '',
      date_of_birth: s.date_of_birth,
      gender: s.gender || '', school: s.school || '', level_id: s.level_id || '',
      fee_structure_id: s.fee_structure_id || '',
      batch_ids: s.student_batches?.map((sb: any) => sb.batch_id) || [],
    })
    setFormError('')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditing(null) }

  function toggleBatch(id: string) {
    setForm(f => ({ ...f, batch_ids: f.batch_ids.includes(id) ? f.batch_ids.filter(x => x !== id) : [...f.batch_ids, id] }))
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_phone.includes(search)
  )

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Manage student enrollments"
        action={{ label: 'Add Student', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />
          <span className="text-sm text-gray-500">{filtered.length} students</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age / Gender</th>
                <th>Contact</th>
                <th>Level</th>
                <th>Batches</th>
                <th>Fee Structure</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No students found</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.parent_name && <p className="text-xs text-gray-500">{s.parent_name}</p>}
                    </div>
                  </td>
                  <td>{calculateAge(s.date_of_birth)} yrs · {s.gender || '—'}</td>
                  <td>
                    <p>{s.contact_phone}</p>
                    {s.secondary_phone && <p className="text-xs text-gray-500">{s.secondary_phone}</p>}
                  </td>
                  <td>{s.levels?.name || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.student_batches?.map((sb: any) => (
                        <span key={sb.batches?.name} className="badge badge-blue text-xs">{sb.batches?.name}</span>
                      )) || '—'}
                    </div>
                  </td>
                  <td>{s.fee_structures ? `${s.fee_structures.name}` : '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Student' : 'Add Student'} size="xl">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Student Name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Parent / Guardian Name">
              <Input value={form.parent_name} onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Phone" required>
              <Input type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
            </FormField>
            <FormField label="Secondary Phone">
              <Input type="tel" value={form.secondary_phone} onChange={e => setForm(f => ({ ...f, secondary_phone: e.target.value }))} />
            </FormField>
          </div>

          <FormField label="Email Address" required>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@example.com" />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Date of Birth" required hint="Default password is YYYYMMDD">
              <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            </FormField>
            <FormField label="Gender">
              <Select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">— Select —</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </Select>
            </FormField>
            <FormField label="School">
              <Input value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Level">
              <Select value={form.level_id} onChange={e => setForm(f => ({ ...f, level_id: e.target.value }))}>
                <option value="">— None —</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Fee Structure">
              <Select value={form.fee_structure_id} onChange={e => setForm(f => ({ ...f, fee_structure_id: e.target.value }))}>
                <option value="">— None —</option>
                {feeStructures.map(fs => <option key={fs.id} value={fs.id}>{fs.name} ({fs.days_per_week} days/wk — ₹{fs.amount})</option>)}
              </Select>
            </FormField>
          </div>

          <FormField label="Enroll in Batches">
            <div className="flex flex-wrap gap-2 mt-1 border border-gray-200 rounded-lg p-3">
              {batches.map(b => (
                <label key={b.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.batch_ids.includes(b.id)} onChange={() => toggleBatch(b.id)} className="rounded" />
                  <span className="text-sm">{b.name}</span>
                </label>
              ))}
              {!batches.length && <p className="text-sm text-gray-400">No batches configured</p>}
            </div>
          </FormField>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Student"
        message="Delete this student record? All attendance and fee history will also be removed."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}