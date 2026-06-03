import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { SkillRow, ApparatusRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SearchBar from '@/components/ui/SearchBar'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/FormField'

type SkillWithApparatus = SkillRow & { apparatus: { name: string } | null }

const emptyForm = {
  name: '',
  apparatus_id: '',
  category: '',
  description: '',
  value: '',
}

export default function SkillsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterApparatus, setFilterApparatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SkillRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data } = await supabase.from('skills').select('*, apparatus(name)').order('name')
      return (data || []) as SkillWithApparatus[]
    },
  })

  const { data: apparatusList = [] } = useQuery({
    queryKey: ['apparatus'],
    queryFn: async () => {
      const { data } = await supabase.from('apparatus').select('*').order('name')
      return (data || []) as ApparatusRow[]
    },
  })

  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))] as string[]

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required')
      const payload = {
        name: form.name.trim(),
        apparatus_id: form.apparatus_id || null,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        value: form.value.trim() || null,
      }
      if (editing) {
        await supabase.from('skills').update(payload).eq('id', editing.id)
      } else {
        await supabase.from('skills').insert(payload)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); closeModal() },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('skills').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); setDeleteId(null) },
  })

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(s: SkillRow) {
    setEditing(s)
    setForm({
      name: s.name,
      apparatus_id: s.apparatus_id || '',
      category: s.category || '',
      description: s.description || '',
      value: s.value != null ? String(s.value) : '',
    })
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditing(null) }

  const filtered = skills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) &&
    (!filterApparatus || s.apparatus_id === filterApparatus) &&
    (!filterCategory || s.category === filterCategory)
  )

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Manage gymnastics skills per apparatus"
        action={{ label: 'Add Skill', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 px-5 py-4 border-b flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search skills…" />
          <Select value={filterApparatus} onChange={e => setFilterApparatus(e.target.value)} className="w-44">
            <option value="">All Apparatus</option>
            {apparatusList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-40">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <span className="text-sm text-gray-500 ml-auto">{filtered.length} skills</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Skill Name</th>
              <th>Apparatus</th>
              <th>Category</th>
              <th>Value</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No skills found</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{s.apparatus?.name || '—'}</td>
                <td>
                  {s.category
                    ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.category}</span>
                    : '—'}
                </td>
                <td>{s.value != null ? s.value : '—'}</td>
                <td className="max-w-xs truncate text-gray-500 text-sm">{s.description || '—'}</td>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Skill' : 'Add Skill'} size="md">
        <div className="space-y-4">
          <FormField label="Skill Name" required>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Cartwheel, Back Handspring…"
            />
          </FormField>
          <FormField label="Apparatus">
            <Select value={form.apparatus_id} onChange={e => setForm(f => ({ ...f, apparatus_id: e.target.value }))}>
              <option value="">— None —</option>
              {apparatusList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <Input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Acrobatic, Dance…"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </FormField>
            <FormField label="Value">
              <Input
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder="e.g. A, B, 0.5…"
              />
            </FormField>
          </div>
          <FormField label="Description">
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of the skill…"
              rows={3}
            />
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
        title="Delete Skill"
        message="Delete this skill? This may affect levels and curriculum that reference it."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}