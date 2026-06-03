import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import { Trophy, Bell, MapPin, CalendarDays, Banknote, X } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function StudentCompetitionsPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const { data: announcements = [] } = useQuery({
    queryKey: ['student-announcements', student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/student/announcements?studentId=${student!.id}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: competitions = [], isLoading } = useQuery({
    queryKey: ['student-competitions', student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/student/competitions?studentId=${student!.id}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const dismissMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      await fetch(`${API_URL}/api/student/announcements/${announcementId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student!.id }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-announcements', student?.id] })
      qc.invalidateQueries({ queryKey: ['student-announcement-count', student?.id] })
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Competitions</h1>
        <p className="text-sm text-gray-500 mt-1">Your shortlisted and confirmed competitions</p>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Announcements</h2>
          <div className="space-y-2">
            {announcements.map((ann: any) => (
              <div key={ann.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Bell size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-900 text-sm">{ann.title}</p>
                  {ann.body && <p className="text-amber-800 text-sm mt-0.5">{ann.body}</p>}
                </div>
                <button
                  onClick={() => dismissMutation.mutate(ann.id)}
                  className="text-amber-400 hover:text-amber-600 flex-shrink-0 mt-0.5"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Competitions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">My Competitions</h2>

        {isLoading ? (
          <div className="text-center text-gray-400 py-10 text-sm">Loading…</div>
        ) : competitions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <Trophy size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">You have not been shortlisted for any competitions yet</p>
          </div>
        ) : competitions.map((entry: any) => {
          const ag = entry.competition_age_groups
          const comp = ag?.competitions
          return (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-3">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{comp?.name}</h3>
                  {comp?.organized_by && (
                    <p className="text-xs text-gray-500 mt-0.5">Organised by {comp.organized_by}</p>
                  )}
                </div>
                {entry.status === 'finalized'
                  ? <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Confirmed</span>
                  : <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Shortlisted</span>
                }
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Trophy size={14} className="text-gray-400" />
                  <span>Age Group: <span className="font-medium text-gray-800">{ag?.name}</span></span>
                </div>

                {(comp?.start_date || comp?.end_date) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <CalendarDays size={14} className="text-gray-400" />
                    <span>
                      {comp.start_date && formatDate(comp.start_date)}
                      {comp.start_time && ` at ${comp.start_time.slice(0, 5)}`}
                      {comp.end_date && comp.end_date !== comp.start_date && ` – ${formatDate(comp.end_date)}`}
                    </span>
                  </div>
                )}

                {comp?.location && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={14} className="text-gray-400" />
                    <span>{comp.location}</span>
                  </div>
                )}

                {ag?.entry_fee != null && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Banknote size={14} className="text-gray-400" />
                    <span>Entry fee: <span className="font-medium text-gray-800">₹{ag.entry_fee}</span></span>
                  </div>
                )}
              </div>

              {entry.notified_at && (
                <p className="text-xs text-gray-400 mt-3 border-t pt-2">
                  Notified on {new Date(entry.notified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
