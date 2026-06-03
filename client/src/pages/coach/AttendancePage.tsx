import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Check, X, Save } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import type { BatchRow, LevelRow, StudentRow } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { FormField, Select, Input } from '@/components/ui/FormField'
import { format } from 'date-fns'

type AttendanceStatus = 'present' | 'absent' | null

export default function AttendancePage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const coachId = appUser?.type === 'staff' ? appUser.id : null

  const [batchId, setBatchId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [saved, setSaved] = useState(false)

  const { data: batches = [] } = useQuery({
    queryKey: ['coach-batches', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase
        .from('coach_batches')
        .select('batch_id, batches(id, name)')
        .eq('coach_id', coachId)
      return (data?.map((d: any) => d.batches) || []) as BatchRow[]
    },
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['coach-levels', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase
        .from('coach_levels')
        .select('level_id, levels(id, name)')
        .eq('coach_id', coachId)
      return (data?.map((d: any) => d.levels) || []) as LevelRow[]
    },
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students-in-batch', batchId, levelId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data } = await supabase
        .from('student_batches')
        .select('students(id, name, level_id)')
        .eq('batch_id', batchId)
      const all = (data?.map((d: any) => d.students) || []) as StudentRow[]
      return levelId ? all.filter(s => s.level_id === levelId) : all
    },
  })

  const { data: existingAttendance } = useQuery({
    queryKey: ['attendance', batchId, date],
    enabled: !!batchId && !!date,
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('batch_id', batchId)
        .eq('date', date)
      const map: Record<string, AttendanceStatus> = {}
      data?.forEach(a => { map[a.student_id] = a.status as AttendanceStatus })
      setAttendance(map)
      return map
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!batchId || !levelId || !date) throw new Error('Select batch, level and date')
      const records = students.map(s => ({
        batch_id: batchId, level_id: levelId, student_id: s.id,
        date, status: attendance[s.id] || 'absent', marked_by: coachId,
      }))

      await supabase.from('attendance')
        .upsert(records, { onConflict: 'batch_id,student_id,date' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); setSaved(true); setTimeout(() => setSaved(false), 3000) },
  })

  function markAll(status: 'present' | 'absent') {
    const map: Record<string, AttendanceStatus> = {}
    students.forEach(s => { map[s.id] = status })
    setAttendance(map)
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark student attendance for today's class" />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Batch">
            <Select value={batchId} onChange={e => { setBatchId(e.target.value); setAttendance({}) }}>
              <option value="">— Select Batch —</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Level">
            <Select value={levelId} onChange={e => setLevelId(e.target.value)}>
              <option value="">— Select Level —</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Date">
            <Input type="date" value={date} onChange={e => { setDate(e.target.value); setAttendance({}) }} />
          </FormField>
        </div>
      </div>

      {batchId && students.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-800">{students.length} Students</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => markAll('present')}>
                <Check size={14} /> Mark All Present
              </Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('absent')}>
                <X size={14} /> Mark All Absent
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-2">
            {students.map(s => {
              const status = attendance[s.id]
              return (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{s.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAttendance(a => ({ ...a, [s.id]: 'present' }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        status === 'present' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      <Check size={14} className="inline mr-1" />Present
                    </button>
                    <button
                      onClick={() => setAttendance(a => ({ ...a, [s.id]: 'absent' }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        status === 'absent' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-300 hover:border-red-400'
                      }`}
                    >
                      <X size={14} className="inline mr-1" />Absent
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50">
            {saved && <p className="text-sm text-green-600 font-medium">✓ Attendance saved!</p>}
            <div className="ml-auto">
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!levelId}>
                <Save size={16} /> Save Attendance
              </Button>
            </div>
          </div>
        </div>
      )}

      {batchId && students.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          No students enrolled in this batch
        </div>
      )}

      {!batchId && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          Select a batch to view students
        </div>
      )}
    </div>
  )
}