import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Users, GraduationCap, Calendar, Trophy, CreditCard } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format, startOfMonth } from 'date-fns'

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const thisMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [students, users, batches, competitions, fees] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('batches').select('id', { count: 'exact', head: true }),
        supabase.from('competitions').select('id', { count: 'exact', head: true }),
        supabase.from('fee_collections').select('paid_amount').gte('month', thisMonth),
      ])
      const totalFees = fees.data?.reduce((sum, f) => sum + (f.paid_amount || 0), 0) || 0
      return {
        students: students.count || 0,
        users: users.count || 0,
        batches: batches.count || 0,
        competitions: competitions.count || 0,
        monthlyFees: totalFees,
      }
    },
  })

  const { data: recentStudents } = useQuery({
    queryKey: ['recent-students'],
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, date_of_birth, gender, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Praxis — Admin Overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <StatCard label="Active Students" value={stats?.students || 0} icon={GraduationCap} color="bg-blue-500" />
        <StatCard label="Staff Users" value={stats?.users || 0} icon={Users} color="bg-violet-500" />
        <StatCard label="Batches" value={stats?.batches || 0} icon={Calendar} color="bg-emerald-500" />
        <StatCard label="Competitions" value={stats?.competitions || 0} icon={Trophy} color="bg-amber-500" />
        <StatCard label="This Month Fees" value={formatCurrency(stats?.monthlyFees || 0)} icon={CreditCard} color="bg-rose-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Recently Enrolled Students</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Gender</th>
              <th>Date of Birth</th>
              <th>Enrolled On</th>
            </tr>
          </thead>
          <tbody>
            {recentStudents?.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{s.gender || '—'}</td>
                <td>{s.date_of_birth}</td>
                <td>{format(new Date(s.created_at), 'dd MMM yyyy')}</td>
              </tr>
            ))}
            {!recentStudents?.length && (
              <tr><td colSpan={4} className="text-center text-gray-400 py-8">No students yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}