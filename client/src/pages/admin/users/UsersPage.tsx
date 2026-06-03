import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { UserRow, BatchRow, LevelRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import { formatDate } from '@/lib/utils'

type UserWithAssignments = UserRow & {
  coach_batches?: { batch_id: string }[]
  coach_levels?: { level_id: string }[]
}

const emptyForm = {
  user_name: '', role: 'coach' as UserRow['role'], phone: '', email: '',
  date_of_birth: '', password: '', batch_ids: [] as string[], level_ids: [] as string[],
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('*, coach_batches(batch_id), coach_levels(level_id)')
        .order('user_name')
      return (data || []) as UserWithAssignments[]
    },
  })

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-list'],
    queryFn: async () => {
      const { data } = await supabase.from('batches').select('id, name').order('name')
      return (data || []) as BatchRow[]
    },
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['levels-list'],
    queryFn: async () => {
      const { data } = await supabase.from('levels').select('id, name').order('name')
      return (data || []) as LevelRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.user_name.trim()) throw new Error('Name is required')
      if ((form.role === 'admin' || form.role === 'manager') && !form.email.trim())
        throw new Error('Email is required for admin and manager')

      if (!editing) {
        // Create auth user via server API (service key required)
        const password = form.password || (form.date_of_birth?.replace(/-/g, '') ?? 'changeme')
        const emailVal = form.email || `${form.user_name.toLowerCase().replace(/\s/g, '.')}@cgc.internal`

        const res = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailVal, password,
            userData: { user_name: form.user_name, role: form.role, phone: form.phone || null, email: form.email || null, date_of_birth: form.date_of_birth || null },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to create user')

        const userId: string = json.user.id
        if (!userId) throw new Error('Failed to create auth user')

        await supabase.from('users').insert({
          id: userId, user_name: form.user_name, role: form.role,
          phone: form.phone || null, email: form.email || null,
          date_of_birth: form.date_of_birth || null,
        })

        if (form.role === 'coach') {
          if (form.batch_ids.length) {
            await supabase.from('coach_batches').insert(form.batch_ids.map(b => ({ coach_id: userId, batch_id: b })))
          }
          if (form.level_ids.length) {
            await supabase.from('coach_levels').insert(form.level_ids.map(l => ({ coach_id: userId, level_id: l })))
          }
        }
      } else {
        await supabase.from('users').update({
          user_name: form.user_name, role: form.role,
          phone: form.phone || null, email: form.email || null,
          date_of_birth: form.date_of_birth || null,
        }).eq('id', editing.id)

        if (form.role === 'coach') {
          await supabase.from('coach_batches').delete().eq('coach_id', editing.id)
          await supabase.from('coach_levels').delete().eq('coach_id', editing.id)
          if (form.batch_ids.length) {
            await supabase.from('coach_batches').insert(form.batch_ids.map(b => ({ coach_id: editing.id, batch_id: b })))
          }
          if (form.level_ids.length) {
            await supabase.from('coach_levels').insert(form.level_ids.map(l => ({ coach_id: editing.id, level_id: l })))
          }
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('users').delete().eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteId(null) },
  })

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(u: UserWithAssignments) {
    setEditing(u)
    setForm({
      user_name: u.user_name, role: u.role, phone: u.phone || '',
      email: u.email || '', date_of_birth: u.date_of_birth || '', password: '',
      batch_ids: u.coach_batches?.map(b => b.batch_id) || [],
      level_ids: u.coach_levels?.map(l => l.level_id) || [],
    })
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditing(null) }

  function toggleMulti(field: 'batch_ids' | 'level_ids', id: string) {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(id) ? f[field].filter(x => x !== id) : [...f[field], id],
    }))
  }

  const filtered = users.filter(u =>
    u.user_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage admin, manager, and coach accounts"
        action={{ label: 'Add User', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder="Search users…" />
          <span className="text-sm text-gray-500">{filtered.length} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Date of Birth</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td className="font-medium">{u.user_name}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-blue' : u.role === 'manager' ? 'badge-purple' : 'badge-green'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.email || '—'}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{formatDate(u.date_of_birth)}</td>
                  <td>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(u.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Form Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit User' : 'Add User'} size="lg">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full Name" required>
              <Input value={form.user_name} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} />
            </FormField>
            <FormField label="Role" required>
              <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRow['role'] }))}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="coach">Coach</option>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" required={form.role !== 'coach'}>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </FormField>
            <FormField label="Phone">
              <Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date of Birth" hint="Used as default password (YYYYMMDD)">
              <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            </FormField>
            {!editing && (
              <FormField label="Password" hint="Leave blank to use DOB as password">
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </FormField>
            )}
          </div>

          {form.role === 'coach' && (
            <>
              <FormField label="Assign Batches">
                <div className="flex flex-wrap gap-2 mt-1">
                  {batches.map(b => (
                    <label key={b.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.batch_ids.includes(b.id)}
                        onChange={() => toggleMulti('batch_ids', b.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{b.name}</span>
                    </label>
                  ))}
                </div>
              </FormField>

              <FormField label="Assign Levels">
                <div className="flex flex-wrap gap-2 mt-1">
                  {levels.map(l => (
                    <label key={l.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.level_ids.includes(l.id)}
                        onChange={() => toggleMulti('level_ids', l.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{l.name}</span>
                    </label>
                  ))}
                </div>
              </FormField>
            </>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete User"
        message="Are you sure you want to delete this user? This cannot be undone."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}