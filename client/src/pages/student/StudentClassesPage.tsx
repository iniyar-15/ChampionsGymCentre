import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function StudentClassesPage() {
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null
  const [viewMonth, setViewMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthStart = format(startOfMonth(viewMonth), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data: attendance = [] } = useQuery({
    queryKey: ['student-attendance', student?.id, monthStart],
    enabled: !!student?.id,
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/student/attendance?studentId=${student!.id}&from=${monthStart}&to=${monthEnd}`
      )
      return res.ok ? await res.json() : []
    },
  })

  const { data: curriculum = [] } = useQuery({
    queryKey: ['student-curriculum', student?.id, selectedDate],
    enabled: !!student?.id && !!selectedDate,
    queryFn: async () => {
      // Get batches student is enrolled in
      const { data: batchData } = await supabase
        .from('student_batches')
        .select('batch_id')
        .eq('student_id', student!.id)

      const batchIds = batchData?.map((b: any) => b.batch_id) || []
      if (!batchIds.length) return []

      let query = supabase
        .from('curriculum')
        .select('*, apparatus(name), curriculum_skills(skills(name))')
        .in('batch_id', batchIds)
        .eq('date', selectedDate!)

      if (student!.level_id) {
        query = query.eq('level_id', student!.level_id)
      }

      const { data } = await query
      return data || []
    },
  })

  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) })
  const presentDates = attendance.filter((a: any) => a.status === 'present').map((a: any) => a.date)
  const absentDates = attendance.filter((a: any) => a.status === 'absent').map((a: any) => a.date)

  function prevMonth() { setViewMonth(d => { const m = new Date(d); m.setMonth(m.getMonth() - 1); return m }) }
  function nextMonth() { setViewMonth(d => { const m = new Date(d); m.setMonth(m.getMonth() + 1); return m }) }

  const selectedAttendance = selectedDate ? attendance.find((a: any) => a.date === selectedDate) : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
        <p className="text-sm text-gray-500 mt-1">View your attendance and curriculum</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-gray-800">{format(viewMonth, 'MMMM yyyy')}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank cells before first day */}
            {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={`blank-${i}`} />)}

            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const isPresent = presentDates.includes(dateStr)
              const isAbsent = absentDates.includes(dateStr)
              const isSelected = selectedDate === dateStr
              const isToday = isSameDay(day, new Date())

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                  className={`
                    aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors
                    ${isSelected ? 'ring-2 ring-blue-500' : ''}
                    ${isPresent ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}
                    ${isAbsent ? 'bg-red-100 text-red-700 hover:bg-red-200' : ''}
                    ${!isPresent && !isAbsent ? 'hover:bg-gray-100 text-gray-600' : ''}
                    ${isToday && !isPresent && !isAbsent ? 'border-2 border-blue-400' : ''}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-300" /><span className="text-xs text-gray-500">Present</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300" /><span className="text-xs text-gray-500">Absent</span></div>
          </div>

          {/* Month summary */}
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
            <div className="text-center bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-600">{presentDates.length}</p>
              <p className="text-xs text-gray-500">Days Present</p>
            </div>
            <div className="text-center bg-red-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-600">{absentDates.length}</p>
              <p className="text-xs text-gray-500">Days Absent</p>
            </div>
          </div>
        </div>

        {/* Curriculum panel */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {selectedDate ? (
            <>
              <h2 className="font-semibold text-gray-800 mb-1">
                {format(parseISO(selectedDate), 'EEE, d MMM yyyy')}
              </h2>
              {selectedAttendance && (
                <span className={`badge text-xs mb-4 inline-block ${selectedAttendance.status === 'present' ? 'badge-green' : 'badge-red'}`}>
                  {selectedAttendance.status === 'present' ? 'Present' : 'Absent'}
                </span>
              )}

              {curriculum.length > 0 ? (
                <div className="space-y-3 mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Curriculum</p>
                  {curriculum.map((c: any) => (
                    <div key={c.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="font-medium text-sm text-blue-700 mb-2">{c.apparatus?.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {c.curriculum_skills?.map((cs: any) => (
                          <span key={cs.skills?.name} className="badge badge-green text-xs">{cs.skills?.name}</span>
                        ))}
                      </div>
                      {c.notes && <p className="text-xs text-gray-500 mt-2">{c.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-3">No curriculum recorded for this day</p>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">Click a date on the calendar to view curriculum</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}