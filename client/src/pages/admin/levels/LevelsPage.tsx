import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import type { LevelRow, ApparatusRow, SkillRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/FormField'

type LevelDetail = LevelRow & {
  level_apparatus: { apparatus_id: string; apparatus: { name: string } }[]
  level_skills: { skill_id: string; skills: { name: string; apparatus_id: string | null } }[]
}

const emptyForm = { name: '', start_age: '', end_age: '', apparatus_ids: [] as string[], skill_ids: [] as string[] }

export default function LevelsPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LevelRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['levels'],
    queryFn: async () => {
      const { data } = await supabase
        .from('levels')
        .select('*, level_apparatus(apparatus_id, apparatus(name)), level_skills(skill_id, skills(name, apparatus_id))')
        .order('name')
      return (data || []) as LevelDetail[]
    },
  })

  const { data: apparatusList = [] } = useQuery({
    queryKey: ['apparatus'],
    queryFn: async () => {
      const { data } = await supabase.from('apparatus').select('*').order('name')
      return (data || []) as ApparatusRow[]
    },
  })

  const { data: allSkills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data } = await supabase.from('skills').select('*, apparatus(name)').order('name')
      return (data || []) as (SkillRow & { apparatus: { name: string } | null })[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.name.trim()) throw new Error('Level name is required')

      let levelId = editing?.id
      if (editing) {
        await supabase.from('levels').update({
          name: form.name,
          start_age: form.start_age ? parseInt(form.start_age) : null,
          end_age: form.end_age ? parseInt(form.end_age) : null,
        }).eq('id', editing.id)
        await supabase.from('level_apparatus').delete().eq('level_id', editing.id)
        await supabase.from('level_skills').delete().eq('level_id', editing.id)
      } else {
        const { data } = await supabase.from('levels').insert({
          name: form.name,
          start_age: form.start_age ? parseInt(form.start_age) : null,
          end_age: form.end_age ? parseInt(form.end_age) : null,
        }).select().single()
        levelId = data?.id
      }

      if (!levelId) throw new Error('Failed to save level')

      if (form.apparatus_ids.length) {
        await supabase.from('level_apparatus').insert(form.apparatus_ids.map(a => ({ level_id: levelId!, apparatus_id: a })))
      }
      if (form.skill_ids.length) {
        await supabase.from('level_skills').insert(form.skill_ids.map(s => ({ level_id: levelId!, skill_id: s })))
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['levels'] }); qc.invalidateQueries({ queryKey: ['levels-list'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('levels').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['levels'] }); setDeleteId(null) },
  })

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(l: LevelDetail) {
    setEditing(l)
    setForm({
      name: l.name,
      start_age: l.start_age?.toString() || '',
      end_age: l.end_age?.toString() || '',
      apparatus_ids: l.level_apparatus.map(a => a.apparatus_id),
      skill_ids: l.level_skills.map(s => s.skill_id),
    })
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditing(null) }

  function toggle(field: 'apparatus_ids' | 'skill_ids', id: string) {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(id) ? f[field].filter(x => x !== id) : [...f[field], id],
    }))
  }

  const filteredSkills = form.apparatus_ids.length
    ? allSkills.filter(s => s.apparatus_id && form.apparatus_ids.includes(s.apparatus_id))
    : allSkills

  return (
    <div>
      <PageHeader
        title="Levels"
        subtitle="Manage training levels with apparatus and skills"
        action={{ label: 'Add Level', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {levels.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    {expanded === l.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </button>
                  <div>
                    <p className="font-semibold text-gray-800">{l.name}</p>
                    {(l.start_age || l.end_age) && (
                      <p className="text-xs text-gray-500">Age: {l.start_age || '?'} – {l.end_age || '?'} years</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-500">{l.level_apparatus.length} apparatus · {l.level_skills.length} skills</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(l)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(l.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                  </div>
                </div>
              </div>

              {expanded === l.id && (
                <div className="px-5 pb-4 border-t bg-gray-50 grid grid-cols-2 gap-6 pt-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Apparatus</p>
                    <div className="flex flex-wrap gap-1.5">
                      {l.level_apparatus.length ? l.level_apparatus.map(a => (
                        <span key={a.apparatus_id} className="badge badge-blue">{a.apparatus.name}</span>
                      )) : <span className="text-xs text-gray-400">None assigned</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {l.level_skills.length ? l.level_skills.map(s => (
                        <span key={s.skill_id} className="badge badge-green">{s.skills.name}</span>
                      )) : <span className="text-xs text-gray-400">None assigned</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!levels.length && <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">No levels yet</div>}
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Level' : 'Add Level'} size="lg">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}

          <FormField label="Level Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Beginner, Level 1, Advanced…" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Age (years)">
              <Input type="number" min="0" max="99" value={form.start_age} onChange={e => setForm(f => ({ ...f, start_age: e.target.value }))} />
            </FormField>
            <FormField label="End Age (years)">
              <Input type="number" min="0" max="99" value={form.end_age} onChange={e => setForm(f => ({ ...f, end_age: e.target.value }))} />
            </FormField>
          </div>

          <FormField label="Apparatus">
            <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {apparatusList.map(a => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.apparatus_ids.includes(a.id)} onChange={() => toggle('apparatus_ids', a.id)} className="rounded" />
                  <span className="text-sm">{a.name}</span>
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Skills" hint={form.apparatus_ids.length ? 'Filtered by selected apparatus' : 'Select apparatus above to filter'}>
            <div className="flex flex-wrap gap-2 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {filteredSkills.map(s => (
                <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.skill_ids.includes(s.id)} onChange={() => toggle('skill_ids', s.id)} className="rounded" />
                  <span className="text-sm">{s.name} {s.apparatus && <span className="text-gray-400">({(s as any).apparatus.name})</span>}</span>
                </label>
              ))}
              {!filteredSkills.length && <p className="text-sm text-gray-400 p-1">No skills available</p>}
            </div>
          </FormField>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Level'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Level"
        message="Delete this level? Students assigned to it will lose their level."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}