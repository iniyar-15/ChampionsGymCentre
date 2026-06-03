import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Users } from 'lucide-react'
import type { CompetitionRow, ApparatusRow, LevelRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/FormField'
import { formatDate, calculateAge } from '@/lib/utils'
import ShortlistModal from './ShortlistModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

type AgeGroupFull = {
  id: string
  competition_id: string
  name: string
  min_age: number | null
  max_age: number | null
  level_id: string | null
  entry_fee: number | null
  is_finalized: boolean
  levels: { name: string } | null
  competition_age_group_apparatus: {
    id: string; apparatus_id: string; apparatus: { name: string }
  }[]
  competition_shortlist: { id: string; student_id: string; status: string; students: { name: string } }[]
}

type CompetitionFull = CompetitionRow & { competition_age_groups: AgeGroupFull[] }

const emptyCompForm = { name: '', organized_by: '', location: '', start_date: '', end_date: '', start_time: '', end_time: '' }
const emptyAgForm = { name: '', min_age: '', max_age: '', level_id: '', entry_fee: '', apparatus_ids: [] as string[] }

export default function CompetitionsPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CompetitionRow | null>(null)
  const [form, setForm] = useState({ ...emptyCompForm })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const [agGroupModal, setAgeGroupModal] = useState(false)
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [agForm, setAgForm] = useState({ ...emptyAgForm })

  const [shortlistModal, setShortlistModal] = useState(false)
  const [shortlistAgeGroup, setShortlistAgeGroup] = useState<AgeGroupFull | null>(null)
  const [shortlistCompId, setShortlistCompId] = useState<string>('')
  const [agFormError, setAgFormError] = useState('')

  const { data: competitions = [], isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/competitions`)
      if (!res.ok) throw new Error('Failed to load competitions')
      return res.json() as Promise<CompetitionFull[]>
    },
  })

  const { data: apparatusList = [] } = useQuery({
    queryKey: ['apparatus'],
    queryFn: async () => {
      const { data } = await supabase.from('apparatus').select('*').order('name')
      return (data || []) as ApparatusRow[]
    },
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['levels-list'],
    queryFn: async () => {
      const { data } = await supabase.from('levels').select('id, name').order('name')
      return (data || []) as LevelRow[]
    },
  })

  const { data: allStudents = [] } = useQuery({
    queryKey: ['students-for-competitions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, date_of_birth, level_id')
        .eq('is_active', true)
        .order('name')
      return (data || []) as { id: string; name: string; date_of_birth: string; level_id: string | null }[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setFormError('')
      if (!form.name.trim()) throw new Error('Competition name is required')
      const payload = {
        name: form.name, organized_by: form.organized_by || null,
        location: form.location || null,
        start_date: form.start_date || null, end_date: form.end_date || null,
        start_time: form.start_time || null, end_time: form.end_time || null,
      }
      const url = editing
        ? `${API_URL}/api/competitions/${editing.id}`
        : `${API_URL}/api/competitions`
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save competition')
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['competitions'] }); closeModal() },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/competitions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['competitions'] }); setDeleteId(null) },
  })

  const saveAgeGroup = useMutation({
    mutationFn: async () => {
      setAgFormError('')
      if (!agForm.name.trim()) throw new Error('Age group name is required')
      if (!selectedComp) throw new Error('No competition selected')
      const res = await fetch(`${API_URL}/api/competitions/${selectedComp}/age-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agForm.name,
          min_age: agForm.min_age ? parseInt(agForm.min_age) : null,
          max_age: agForm.max_age ? parseInt(agForm.max_age) : null,
          level_id: agForm.level_id || null,
          entry_fee: agForm.entry_fee ? parseFloat(agForm.entry_fee) : null,
          apparatus_ids: agForm.apparatus_ids,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create age group')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] })
      setAgeGroupModal(false)
      setAgForm({ ...emptyAgForm })
      setAgFormError('')
    },
    onError: (e: Error) => setAgFormError(e.message),
  })


  function openCreate() { setEditing(null); setForm({ ...emptyCompForm }); setFormError(''); setModalOpen(true) }
  function openEdit(c: CompetitionRow) {
    setEditing(c)
    setForm({
      name: c.name, organized_by: c.organized_by || '', location: c.location || '',
      start_date: c.start_date || '', end_date: c.end_date || '',
      start_time: (c as any).start_time || '', end_time: (c as any).end_time || '',
    })
    setFormError('')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditing(null) }

  function openShortlist(ag: AgeGroupFull, compId: string) {
    setShortlistAgeGroup(ag)
    setShortlistCompId(compId)
    setShortlistModal(true)
  }

  function getEligibleStudents(ag: AgeGroupFull) {
    return allStudents.filter(s => {
      const age = calculateAge(s.date_of_birth)
      const ageOk = (ag.min_age === null || age >= ag.min_age) && (ag.max_age === null || age <= ag.max_age)
      const levelOk = ag.level_id === null || s.level_id === ag.level_id
      return ageOk && levelOk
    })
  }

  return (
    <div>
      <PageHeader
        title="Competitions"
        subtitle="Manage competitions, age groups, shortlists and results"
        action={{ label: 'Add Competition', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {isLoading ? <p className="text-gray-400">Loading…</p> : (
        <div className="space-y-4">
          {competitions.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    {expanded === c.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </button>
                  <div>
                    <p className="font-semibold text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.organized_by && `${c.organized_by} · `}{c.location && `${c.location} · `}
                      {formatDate(c.start_date)}{c.end_date && ` – ${formatDate(c.end_date)}`}
                      {(c as any).start_time && ` · ${(c as any).start_time.slice(0, 5)}`}
                      {(c as any).end_time && ` – ${(c as any).end_time.slice(0, 5)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{c.competition_age_groups?.length || 0} age groups</span>
                  <Button size="sm" variant="secondary" onClick={() => { setSelectedComp(c.id); setAgeGroupModal(true) }}>
                    <Plus size={14} /> Age Group
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(c.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></Button>
                </div>
              </div>

              {expanded === c.id && c.competition_age_groups?.map(ag => {
                const shortlisted = ag.competition_shortlist?.filter(s => s.status !== 'removed') || []
                const eligible = getEligibleStudents(ag)
                return (
                  <div key={ag.id} className="border-t bg-gray-50 px-8 py-4">
                    {/* Age group header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="font-medium text-gray-700">{ag.name}</h4>
                          {(ag.min_age != null || ag.max_age != null) && (
                            <span className="text-xs text-gray-500">Age {ag.min_age ?? '?'}–{ag.max_age ?? '?'}</span>
                          )}
                          {ag.levels && <span className="badge badge-blue text-xs">{ag.levels.name}</span>}
                          {ag.entry_fee != null && <span className="text-xs text-gray-500">Fee: ₹{ag.entry_fee}</span>}
                        </div>
                        {ag.competition_age_group_apparatus?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Apparatus: {ag.competition_age_group_apparatus.map(a => a.apparatus.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <span className="text-xs text-gray-500">{shortlisted.length} shortlisted</span>
                        <Button size="sm" variant="secondary" onClick={() => openShortlist(ag, c.id)}>
                          <Users size={14} /> Shortlist
                        </Button>
                      </div>
                    </div>

                    {/* Eligible students (always visible) */}
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Eligible students ({eligible.length})
                      </p>
                      {eligible.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No students match the age/level criteria</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {eligible.map(s => {
                            const isShortlisted = shortlisted.some(sl => sl.student_id === s.id)
                            return (
                              <span
                                key={s.id}
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  isShortlisted
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-white text-gray-600 border-gray-200'
                                }`}
                              >
                                {s.name} · {calculateAge(s.date_of_birth)} yrs
                                {isShortlisted && ' ✓'}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Shortlisted names */}
                    {shortlisted.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Shortlisted</p>
                        <div className="flex flex-wrap gap-1.5">
                          {shortlisted.map(s => (
                            <span key={s.id} className="badge badge-blue text-xs">{s.students?.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {!competitions.length && <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">No competitions yet</div>}
        </div>
      )}

      {/* Competition form modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Competition' : 'Add Competition'} size="md">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <FormField label="Competition Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Organized By">
              <Input value={form.organized_by} onChange={e => setForm(f => ({ ...f, organized_by: e.target.value }))} />
            </FormField>
            <FormField label="Location">
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date">
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </FormField>
            <FormField label="End Date">
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time">
              <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </FormField>
            <FormField label="End Time">
              <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </FormField>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Age group form modal */}
      <Modal open={agGroupModal} onClose={() => { setAgeGroupModal(false); setAgFormError('') }} title="Add Age Group" size="md">
        <div className="space-y-4">
          {agFormError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{agFormError}</div>}
          <FormField label="Age Group Name" required>
            <Input value={agForm.name} onChange={e => setAgForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Under 10, 12–14 yrs" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min Age">
              <Input type="number" value={agForm.min_age} onChange={e => setAgForm(f => ({ ...f, min_age: e.target.value }))} />
            </FormField>
            <FormField label="Max Age">
              <Input type="number" value={agForm.max_age} onChange={e => setAgForm(f => ({ ...f, max_age: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Applicable Level">
              <Select value={agForm.level_id} onChange={e => setAgForm(f => ({ ...f, level_id: e.target.value }))}>
                <option value="">— Any Level —</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Entry Fee (₹)">
              <Input type="number" step="0.01" value={agForm.entry_fee} onChange={e => setAgForm(f => ({ ...f, entry_fee: e.target.value }))} placeholder="0" />
            </FormField>
          </div>
          <FormField label="Apparatus">
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-lg p-2 mt-1">
              {apparatusList.map(a => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox"
                    checked={agForm.apparatus_ids.includes(a.id)}
                    onChange={() => setAgForm(f => ({
                      ...f, apparatus_ids: f.apparatus_ids.includes(a.id)
                        ? f.apparatus_ids.filter(x => x !== a.id) : [...f.apparatus_ids, a.id]
                    }))}
                    className="rounded" />
                  <span className="text-sm">{a.name}</span>
                </label>
              ))}
            </div>
          </FormField>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setAgeGroupModal(false)}>Cancel</Button>
            <Button onClick={() => saveAgeGroup.mutate()} loading={saveAgeGroup.isPending}>Add Age Group</Button>
          </div>
        </div>
      </Modal>

      {/* Shortlist modal */}
      {shortlistAgeGroup && (
        <ShortlistModal
          open={shortlistModal}
          onClose={() => setShortlistModal(false)}
          ageGroup={shortlistAgeGroup}
          competitionId={shortlistCompId}
          onSaved={() => qc.invalidateQueries({ queryKey: ['competitions'] })}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Competition"
        message="Delete this competition and all its age groups and shortlist data?"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
