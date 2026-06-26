import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format, startOfMonth, endOfMonth, getDaysInMonth, subMonths } from 'date-fns'
import { TrendingUp, Banknote, AlertCircle } from 'lucide-react'

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionHeader({ title, count, color }: { title: string; count?: number; color?: string }) {
  return (
    <div className="px-5 py-4 border-b flex items-center gap-3">
      <h2 className="font-semibold text-gray-800 flex-1">{title}</h2>
      {count != null && count > 0 && color && (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>{count}</span>
      )}
    </div>
  )
}

export default function ManagerDashboard() {
  const now = new Date()
  const thisMonthLabel = format(now, 'MMMM yyyy')
  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
  const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
  const prevMonthLabel = format(subMonths(now, 1), 'MMMM yyyy')
  const today = format(now, 'yyyy-MM-dd')
  const daysInMonth = getDaysInMonth(now)
  const weeksInMonth = daysInMonth / 7

  // ── Revenue + alerts ──────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['manager-dashboard', thisMonthStart],
    queryFn: async () => {
      const [studentsRes, feesRes, attendanceRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, contact_phone, created_at, fee_structure_id, fee_structures(amount, days_per_week)')
          .eq('is_active', true)
          .not('fee_structure_id', 'is', null),
        supabase
          .from('fee_collections')
          .select('student_id, amount, paid_amount')
          .eq('month', thisMonthStart),
        supabase
          .from('attendance')
          .select('student_id, status')
          .gte('date', thisMonthStart)
          .lte('date', thisMonthEnd),
      ])

      const students = (studentsRes.data || []) as any[]
      const fees = feesRes.data || []
      const attendance = attendanceRes.data || []

      const monthStart = startOfMonth(now)
      const studentExpected: Record<string, number> = {}
      for (const s of students) {
        const fullAmount: number = s.fee_structures?.amount || 0
        if (!fullAmount) continue
        const joined = new Date(s.created_at)
        let expected = fullAmount
        if (joined >= monthStart && joined.getDate() > 1) {
          const remaining = daysInMonth - joined.getDate() + 1
          expected = Math.round((fullAmount / daysInMonth) * remaining)
        }
        studentExpected[s.id] = expected
      }

      const studentPaid: Record<string, number> = {}
      for (const f of fees) {
        studentPaid[f.student_id] = (studentPaid[f.student_id] || 0) + (f.paid_amount || 0)
      }

      const totalExpected = Object.values(studentExpected).reduce((a, b) => a + b, 0)
      const totalCollected = Object.values(studentPaid).reduce((a, b) => a + b, 0)
      const totalPending = Math.max(0, totalExpected - totalCollected)

      const unpaid = students
        .filter(s => (studentExpected[s.id] || 0) > 0 && (studentPaid[s.id] || 0) < (studentExpected[s.id] || 0))
        .map(s => ({
          id: s.id, name: s.name, contact_phone: s.contact_phone,
          expected: studentExpected[s.id],
          paid: studentPaid[s.id] || 0,
          balance: (studentExpected[s.id] || 0) - (studentPaid[s.id] || 0),
        }))
        .sort((a, b) => b.balance - a.balance)

      const attendPresent: Record<string, number> = {}
      const attendTotal: Record<string, number> = {}
      for (const a of attendance) {
        attendTotal[a.student_id] = (attendTotal[a.student_id] || 0) + 1
        if (a.status === 'present') attendPresent[a.student_id] = (attendPresent[a.student_id] || 0) + 1
      }

      const lowAttendance = students
        .filter(s => (attendTotal[s.id] || 0) > 0 && (attendPresent[s.id] || 0) / (attendTotal[s.id] || 1) < 0.5)
        .map(s => ({
          id: s.id, name: s.name, contact_phone: s.contact_phone,
          present: attendPresent[s.id] || 0,
          total: attendTotal[s.id] || 0,
          pct: Math.round(((attendPresent[s.id] || 0) / (attendTotal[s.id] || 1)) * 100),
        }))
        .sort((a, b) => a.pct - b.pct)

      const overAttending = students
        .filter(s => {
          const dpw: number = s.fee_structures?.days_per_week || 0
          return dpw > 0 && (attendPresent[s.id] || 0) > Math.round(dpw * weeksInMonth)
        })
        .map(s => {
          const dpw: number = s.fee_structures?.days_per_week || 0
          const expectedSessions = Math.round(dpw * weeksInMonth)
          const actual = attendPresent[s.id] || 0
          return { id: s.id, name: s.name, contact_phone: s.contact_phone, daysPerWeek: dpw, expectedSessions, actual, extra: actual - expectedSessions }
        })
        .sort((a, b) => b.extra - a.extra)

      return { totalExpected, totalCollected, totalPending, unpaid, lowAttendance, overAttending }
    },
  })

  // ── New enrollments ───────────────────────────────────────────────────────────
  const { data: enrollments } = useQuery({
    queryKey: ['manager-enrollments', thisMonthStart, prevMonthStart],
    queryFn: async () => {
      const [thisMonthRes, prevMonthRes] = await Promise.all([
        supabase.from('students')
          .select('id, name, contact_phone, date_of_birth, gender, created_at, levels(name), fee_structures(name)')
          .gte('created_at', thisMonthStart)
          .lte('created_at', thisMonthEnd + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase.from('students')
          .select('id, name, contact_phone, date_of_birth, gender, created_at, levels(name), fee_structures(name)')
          .gte('created_at', prevMonthStart)
          .lte('created_at', prevMonthEnd + 'T23:59:59')
          .order('created_at', { ascending: false }),
      ])
      return { thisMonth: (thisMonthRes.data || []) as any[], prevMonth: (prevMonthRes.data || []) as any[] }
    },
  })

  // ── Upcoming competitions ─────────────────────────────────────────────────────
  const { data: competitions } = useQuery({
    queryKey: ['manager-competitions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('competitions')
        .select('id, name, start_date, end_date, location, organized_by, competition_age_groups(competition_shortlist(student_id))')
        .gte('start_date', today)
        .order('start_date')
      return (data || []).map((c: any) => {
        const studentIds = new Set(
          (c.competition_age_groups || []).flatMap((ag: any) => (ag.competition_shortlist || []).map((s: any) => s.student_id))
        )
        return { ...c, studentCount: studentIds.size }
      })
    },
  })

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard…</div>

  const { totalExpected = 0, totalCollected = 0, totalPending = 0,
          unpaid = [], lowAttendance = [], overAttending = [] } = data || {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{thisMonthLabel} — live overview</p>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Expected Revenue" value={formatCurrency(totalExpected)} sub="Prorated by joining date" icon={TrendingUp} color="bg-blue-600" />
        <StatCard
          label="Fees Collected"
          value={formatCurrency(totalCollected)}
          sub={totalExpected > 0 ? `${Math.round((totalCollected / totalExpected) * 100)}% collection rate` : undefined}
          icon={Banknote}
          color="bg-emerald-600"
        />
        <StatCard
          label="Pending Collection"
          value={formatCurrency(totalPending)}
          sub={`${unpaid.length} student${unpaid.length !== 1 ? 's' : ''} yet to pay fully`}
          icon={AlertCircle}
          color={totalPending > 0 ? 'bg-red-500' : 'bg-emerald-600'}
        />
      </div>

      {/* Enrollments — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <SectionHeader title={`New Enrollments — ${thisMonthLabel}`} count={enrollments?.thisMonth.length} color="bg-blue-100 text-blue-700" />
          {!enrollments?.thisMonth.length ? (
            <p className="text-center py-8 text-gray-400 text-sm">No new students this month</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Level</th><th>Enrolled On</th></tr></thead>
              <tbody>
                {enrollments.thisMonth.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.contact_phone}</p>
                    </td>
                    <td>{(s as any).levels?.name || '—'}</td>
                    <td>{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <SectionHeader title={`New Enrollments — ${prevMonthLabel}`} count={enrollments?.prevMonth.length} color="bg-slate-100 text-slate-600" />
          {!enrollments?.prevMonth.length ? (
            <p className="text-center py-8 text-gray-400 text-sm">No new students last month</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Level</th><th>Enrolled On</th></tr></thead>
              <tbody>
                {enrollments.prevMonth.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.contact_phone}</p>
                    </td>
                    <td>{(s as any).levels?.name || '—'}</td>
                    <td>{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upcoming competitions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <SectionHeader title="Upcoming Competitions" count={competitions?.length} color="bg-amber-100 text-amber-700" />
        {!competitions?.length ? (
          <p className="text-center py-8 text-gray-400 text-sm">No upcoming competitions</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Competition</th><th>Organized By</th><th>Location</th><th>Start Date</th><th>End Date</th><th>Students Enrolled</th></tr>
            </thead>
            <tbody>
              {competitions.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-gray-500">{c.organized_by || '—'}</td>
                  <td className="text-gray-500">{c.location || '—'}</td>
                  <td>{formatDate(c.start_date)}</td>
                  <td>{formatDate(c.end_date)}</td>
                  <td>
                    {c.studentCount > 0
                      ? <span className="badge badge-green">{c.studentCount} student{c.studentCount !== 1 ? 's' : ''}</span>
                      : <span className="text-gray-400 text-sm">None shortlisted</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Unpaid students */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <SectionHeader title="Students with Outstanding Fees" count={unpaid.length} color="bg-red-100 text-red-700" />
        {unpaid.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">All students have paid in full</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Phone</th><th>Expected</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {unpaid.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-gray-500">{s.contact_phone}</td>
                  <td>{formatCurrency(s.expected)}</td>
                  <td className="text-green-600">{formatCurrency(s.paid)}</td>
                  <td><span className="text-red-600 font-semibold">{formatCurrency(s.balance)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Low attendance */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <SectionHeader title="Students with Low Attendance (< 50%)" count={lowAttendance.length} color="bg-amber-100 text-amber-700" />
        {lowAttendance.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No students below 50% attendance</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Phone</th><th>Present</th><th>Total Sessions</th><th>Attendance</th></tr></thead>
            <tbody>
              {lowAttendance.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-gray-500">{s.contact_phone}</td>
                  <td>{s.present}</td>
                  <td>{s.total}</td>
                  <td><span className={`badge ${s.pct < 30 ? 'badge-red' : 'badge-yellow'}`}>{s.pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Over-attending */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <SectionHeader title="Students Attending More Than Their Plan" count={overAttending.length} color="bg-purple-100 text-purple-700" />
        {overAttending.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No students exceeding their scheduled classes</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Phone</th><th>Plan (days/wk)</th><th>Expected Sessions</th><th>Actual Sessions</th><th>Extra</th></tr></thead>
            <tbody>
              {overAttending.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-gray-500">{s.contact_phone}</td>
                  <td>{s.daysPerWeek} days/wk</td>
                  <td>{s.expectedSessions}</td>
                  <td className="font-medium">{s.actual}</td>
                  <td><span className="badge bg-purple-100 text-purple-700">+{s.extra}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
