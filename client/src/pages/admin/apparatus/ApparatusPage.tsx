import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { ApparatusRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'

const emptyForm = { name: '', gender: 'mixed' as 'male' | 'female' | 'mixed' }

export default function ApparatusPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApparatusRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: apparatusList = [], isLoading } = useQuery({
    queryKey: ['apparatus'],
    queryFn: async () => {
      const { data } = await supabase.from('apparatus').select('*').order('name')
      return (data || []) as ApparatusRow[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required')
      if (editing) {
        await supabase.from('apparatus').update({ name: form.name, gender: form.gender }).eq('id', editing.id)
      } else {
        await supabase.from('apparatus').insert({ name: form.name, gender: form.gender })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apparatus'] }); closeModal() },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('apparatus').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apparatus'] }); setDeleteId(null) },
  })

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setModalOpen(true) }
  function openEdit(a: ApparatusRow) { setEditing(a); setForm({ name: a.name, gender: a.gender || 'mixed' }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  const filtered = apparatusList.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <PageHeader
        title="Apparatus"
        subtitle="Manage gymnastics apparatus"
        action={{ label: 'Add Apparatus', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder="Search apparatus…" />
          <span className="text-sm text-gray-500">{filtered.length} items</span>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Gender</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">No apparatus found</td></tr>
            ) : filtered.map(a => (
              <tr key={a.id}>
                <td className="font-medium">{a.name}</td>
                <td><span className={`badge ${a.gender === 'male' ? 'badge-blue' : a.gender === 'female' ? 'badge-purple' : 'badge-gray'}`}>{a.gender}</span></td>
                <td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(a.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Apparatus' : 'Add Apparatus'} size="sm">
        <div className="space-y-4">
          <FormField label="Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Floor, Vault, Beam…" />
          </FormField>
          <FormField label="Gender">
            <Select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value as typeof form.gender }))}>
              <option value="mixed">Mixed</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
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
        title="Delete Apparatus"
        message="Delete this apparatus? All associated skills will also be deleted."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}