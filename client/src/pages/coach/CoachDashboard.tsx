import { useAuth } from '@/context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ClipboardList, BookOpen, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CoachDashboard() {
  const { appUser } = useAuth()
  const coachId = appUser?.type === 'staff' ? appUser.id : null
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: batches = [] } = useQuery({
    queryKey: ['coach-batches', coachId],
    queryFn: async () => {
      if (!coachId) return []
      const { data } = await supabase.from('coach_batches').select('batch_id, batches(id, name, days, start_time, end_time)').eq('coach_id', coachId)
      return data?.map((d: any) => d.batches) || []
    },
  })

  const { data: todayCount } = useQuery({
    queryKey: ['today-attendance-count', coachId, today],
    queryFn: async () => {
      const { count } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('date', today)
      return count || 0
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hello, {appUser?.type === 'staff' ? appUser.user_name : ''}!</h1>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Link to="/coach/attendance" className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-blue-300 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
            <ClipboardList size={20} className="text-blue-600" />
          </div>
          <p className="font-semibold text-gray-800">Mark Attendance</p>
          <p className="text-sm text-gray-500 mt-1">{todayCount} marked today</p>
        </Link>
        <Link to="/coach/curriculum" className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-blue-300 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
            <BookOpen size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-gray-800">Plan Curriculum</p>
          <p className="text-sm text-gray-500 mt-1">Record today's lessons</p>
        </Link>
        <Link to="/coach/feedback" className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-blue-300 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
            <MessageSquare size={20} className="text-purple-600" />
          </div>
          <p className="font-semibold text-gray-800">Give Feedback</p>
          <p className="text-sm text-gray-500 mt-1">Monthly student feedback</p>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">My Batches</h2>
        </div>
        <div className="p-4 space-y-2">
          {batches.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
              <div>
                <p className="font-medium text-gray-800">{b.name}</p>
                <p className="text-xs text-gray-500">{b.days?.join(', ')}</p>
              </div>
              <p className="text-sm text-gray-600">{b.start_time?.slice(0, 5)} – {b.end_time?.slice(0, 5)}</p>
            </div>
          ))}
          {!batches.length && <p className="text-sm text-gray-400 p-2">No batches assigned</p>}
        </div>
      </div>
    </div>
  )
}