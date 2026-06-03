import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import type { BatchRow, LevelRow, ApparatusRow, SkillRow, StudentRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { FormField, Select, Input, Textarea } from '@/components/ui/FormField'
import { format, startOfMonth } from 'date-fns'

export default function FeedbackPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const coachId = appUser?.type === 'staff' ? appUser.id : null

  const [batchId, setBatchId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [month, setMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'))
  const [apparatusId, setApparatusId] = useState('')
  const [skillId, setSkillId] = useState('')
  const [feedbackText, setFeedbackText] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: batches = [] } = useQuery({
    queryKey: ['coach-batches', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase.from('coach_batches').select('batch_id, batches(id, name)').eq('coach_id', coachId)
      return (data?.map((d: any) => d.batches) || []) as BatchRow[]
    },
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students-in-batch', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data } = await supabase.from('student_batches').select('students(id, name)').eq('batch_id', batchId)
      return (data?.map((d: any) => d.students) || []) as StudentRow[]
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

  // Load existing feedback
  useQuery({
    queryKey: ['feedback-entry', studentId, month, apparatusId, skillId],
    enabled: !!studentId && !!month && !!apparatusId,
    queryFn: async () => {
      let q = supabase.from('feedback').select('feedback_text')
        .eq('student_id', studentId).eq('month', `${month}-01`).eq('apparatus_id', apparatusId)
      if (skillId) q = q.eq('skill_id', skillId)
      const { data } = await q.single()
      setFeedbackText(data?.feedback_text || '')
      return data
    },
  })

  const { data: allFeedback = [] } = useQuery({
    queryKey: ['feedback-list', studentId, month],
    enabled: !!studentId && !!month,
    queryFn: async () => {
      const { data } = await supabase
        .from('feedback')
        .select('*, apparatus(name), skills(name)')
        .eq('student_id', studentId)
        .eq('month', `${month}-01`)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!studentId || !apparatusId) throw new Error('Select student and apparatus')
      const monthDate = `${month}-01`
      await supabase.from('feedback').upsert({
        student_id: studentId, month: monthDate, apparatus_id: apparatusId,
        skill_id: skillId || null, feedback_text: feedbackText, coach_id: coachId,
      }, { onConflict: 'student_id,month,apparatus_id' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback-list'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return format(startOfMonth(d), 'yyyy-MM')
  })

  return (
    <div>
      <PageHeader title="Feedback" subtitle="Provide monthly feedback for students per apparatus and skill" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Write Feedback</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField label="Batch">
              <Select value={batchId} onChange={e => { setBatchId(e.target.value); setStudentId('') }}>
                <option value="">— Select Batch —</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Month">
              <Select value={month} onChange={e => setMonth(e.target.value)}>
                {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</option>)}
              </Select>
            </FormField>
            <FormField label="Student">
              <Select value={studentId} onChange={e => setStudentId(e.target.value)}>
                <option value="">— Select Student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Apparatus">
              <Select value={apparatusId} onChange={e => { setApparatusId(e.target.value); setSkillId('') }}>
                <option value="">— Select Apparatus —</option>
                {apparatus.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Skill (optional)">
              <Select value={skillId} onChange={e => setSkillId(e.target.value)}>
                <option value="">— Overall —</option>
                {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
          </div>

          <FormField label="Feedback">
            <Textarea
              rows={5}
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="Write your feedback about this student's performance…"
            />
          </FormField>

          <div className="flex items-center justify-between mt-4">
            {saved && <p className="text-sm text-green-600 font-medium">✓ Feedback saved!</p>}
            <div className="ml-auto">
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!studentId || !apparatusId}>
                <Save size={16} /> Save Feedback
              </Button>
            </div>
          </div>
        </div>

        {/* Recent feedback list */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Previous Feedback</h2>
          {studentId ? (
            <div className="space-y-3">
              {allFeedback.map((fb: any) => (
                <div key={fb.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge badge-blue">{fb.apparatus?.name}</span>
                    {fb.skills && <span className="badge badge-green">{fb.skills.name}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{fb.feedback_text}</p>
                </div>
              ))}
              {!allFeedback.length && <p className="text-sm text-gray-400">No feedback for this month</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Select a student to view feedback history</p>
          )}
        </div>
      </div>
    </div>
  )
}