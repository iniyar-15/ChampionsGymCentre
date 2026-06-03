import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Save } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import type { BatchRow, LevelRow, ApparatusRow, SkillRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { FormField, Select, Input, Textarea } from '@/components/ui/FormField'
import { format } from 'date-fns'

export default function CurriculumPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const coachId = appUser?.type === 'staff' ? appUser.id : null

  const [batchId, setBatchId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [apparatusId, setApparatusId] = useState('')
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: batches = [] } = useQuery({
    queryKey: ['coach-batches', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase.from('coach_batches').select('batch_id, batches(id, name)').eq('coach_id', coachId)
      return (data?.map((d: any) => d.batches) || []) as BatchRow[]
    },
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['coach-levels', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase.from('coach_levels').select('level_id, levels(id, name)').eq('coach_id', coachId)
      return (data?.map((d: any) => d.levels) || []) as LevelRow[]
    },
  })

  const { data: apparatus = [] } = useQuery({
    queryKey: ['apparatus'],
    queryFn: async () => {
      const { data } = await supabase.from('apparatus').select('*').order('name')
      return (data || []) as ApparatusRow[]
    },
  })

  const { data: skills = [] } = useQuery({
    queryKey: ['skills-by-apparatus', apparatusId],
    enabled: !!apparatusId,
    queryFn: async () => {
      const { data } = await supabase.from('skills').select('*').eq('apparatus_id', apparatusId).order('name')
      return (data || []) as SkillRow[]
    },
  })

  // Load existing curriculum for this batch/date/apparatus
  useQuery({
    queryKey: ['curriculum', batchId, date, apparatusId],
    enabled: !!batchId && !!date && !!apparatusId,
    queryFn: async () => {
      const { data } = await supabase
        .from('curriculum')
        .select('id, notes, curriculum_skills(skill_id)')
        .eq('batch_id', batchId)
        .eq('date', date)
        .eq('apparatus_id', apparatusId)
        .single()
      if (data) {
        setNotes(data.notes || '')
        setSkillIds(data.curriculum_skills?.map((cs: any) => cs.skill_id) || [])
      } else {
        setNotes('')
        setSkillIds([])
      }
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!batchId || !levelId || !apparatusId) throw new Error('Select batch, level and apparatus')

      const { data: existing } = await supabase
        .from('curriculum')
        .select('id')
        .eq('batch_id', batchId)
        .eq('date', date)
        .eq('apparatus_id', apparatusId)
        .single()

      let curriculumId = existing?.id
      if (existing) {
        await supabase.from('curriculum').update({ notes, coach_id: coachId, level_id: levelId }).eq('id', existing.id)
        await supabase.from('curriculum_skills').delete().eq('curriculum_id', existing.id)
      } else {
        const { data } = await supabase
          .from('curriculum')
          .insert({ batch_id: batchId, level_id: levelId, date, apparatus_id: apparatusId, notes, coach_id: coachId })
          .select().single()
        curriculumId = data?.id
      }

      if (curriculumId && skillIds.length) {
        await supabase.from('curriculum_skills').insert(skillIds.map(s => ({ curriculum_id: curriculumId!, skill_id: s })))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['curriculum'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function toggleSkill(id: string) {
    setSkillIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  return (
    <div>
      <PageHeader title="Curriculum" subtitle="Record today's curriculum — apparatus and skills taught" />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-4 gap-4">
          <FormField label="Batch">
            <Select value={batchId} onChange={e => setBatchId(e.target.value)}>
              <option value="">— Select —</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Level">
            <Select value={levelId} onChange={e => setLevelId(e.target.value)}>
              <option value="">— Select —</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Date">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </FormField>
          <FormField label="Apparatus">
            <Select value={apparatusId} onChange={e => { setApparatusId(e.target.value); setSkillIds([]) }}>
              <option value="">— Select —</option>
              {apparatus.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
        </div>
      </div>

      {apparatusId && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Skills Taught Today</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {skills.map(s => (
              <label key={s.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                skillIds.includes(s.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} className="rounded" />
                <span className="text-sm font-medium">{s.name}</span>
              </label>
            ))}
            {!skills.length && <p className="text-sm text-gray-400 col-span-3">No skills for this apparatus</p>}
          </div>

          <FormField label="Notes (optional)">
            <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about today's session…" />
          </FormField>

          <div className="flex items-center justify-between mt-4">
            {saved && <p className="text-sm text-green-600 font-medium">✓ Curriculum saved!</p>}
            <div className="ml-auto">
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!levelId}>
                <Save size={16} /> Save Curriculum
              </Button>
            </div>
          </div>
        </div>
      )}

      {!apparatusId && batchId && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          Select an apparatus to record curriculum
        </div>
      )}
    </div>
  )
}