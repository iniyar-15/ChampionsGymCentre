import { NavLink } from 'react-router-dom'
import { PraxisMark, PraxisWordmark } from '@/components/branding/PraxisLogo'
import { useAuth } from '@/context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { cn, calculateAge } from '@/lib/utils'
import {
  LayoutDashboard, Users, GraduationCap, Calendar, Layers, Dumbbell,
  Award, Trophy, Wallet, FileText, ClipboardList, BookOpen,
  MessageSquare, BarChart3, User, CreditCard, LogOut
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const adminNav = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'Students', to: '/admin/students', icon: GraduationCap },
  { label: 'Batches', to: '/admin/batches', icon: Calendar },
  { label: 'Levels', to: '/admin/levels', icon: Layers },
  { label: 'Apparatus', to: '/admin/apparatus', icon: Dumbbell },
  { label: 'Skills', to: '/admin/skills', icon: Award },
  { label: 'Competitions', to: '/admin/competitions', icon: Trophy },
  { label: 'Fee Structures', to: '/admin/fee-structures', icon: Wallet },
  { label: 'Fee Collection', to: '/admin/fee-collection', icon: CreditCard },
  { label: 'Reports', to: '/admin/reports', icon: BarChart3 },
]

const coachNav = [
  { label: 'Dashboard', to: '/coach', icon: LayoutDashboard, end: true },
  { label: 'Attendance', to: '/coach/attendance', icon: ClipboardList },
  { label: 'Curriculum', to: '/coach/curriculum', icon: BookOpen },
  { label: 'Feedback', to: '/coach/feedback', icon: MessageSquare },
]

const managerNav = [
  { label: 'Dashboard', to: '/manager', icon: LayoutDashboard, end: true },
  { label: 'Reports', to: '/manager/reports', icon: BarChart3 },
]

const studentNav = [
  { label: 'My Profile', to: '/student', icon: User, end: true },
  { label: 'Competitions', to: '/student/competitions', icon: Trophy },
  { label: 'Pay Fees', to: '/student/fees', icon: CreditCard },
  { label: 'My Classes', to: '/student/classes', icon: Calendar },
]

function NavItem({ to, icon: Icon, label, end, badge }: { to: string; icon: React.ElementType; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('sidebar-link', isActive && 'active')
      }
    >
      <Icon size={18} />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { appUser, relatedStudents, selectStudent, signOut } = useAuth()

  const studentId = appUser?.type === 'student' ? appUser.id : null

  const { data: announcementCount = 0 } = useQuery({
    queryKey: ['student-announcement-count', studentId],
    enabled: !!studentId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/student/announcements?studentId=${studentId}`)
      if (!res.ok) return 0
      const data = await res.json()
      return Array.isArray(data) ? data.length : 0
    },
  })

  if (!appUser) return null

  const role = appUser.type === 'staff' ? appUser.role : 'student'
  const nav = role === 'admin' ? adminNav : role === 'coach' ? coachNav : role === 'manager' ? managerNav : studentNav
  const displayName = appUser.type === 'staff' ? appUser.user_name : appUser.name
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  const activeStudentId = appUser.type === 'student' ? appUser.id : null

  return (
    <aside className="w-64 min-h-screen bg-slate-900 flex flex-col flex-shrink-0">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <PraxisMark className="w-9 h-9 rounded-lg flex-shrink-0" />
          <div className="overflow-hidden">
            <p className="text-white font-semibold text-lg truncate"><PraxisWordmark /></p>
            <p className="text-slate-400 text-xs truncate">Academy Management</p>
          </div>
        </div>
      </div>

      {/* Student switcher */}
      {appUser.type === 'student' && relatedStudents.length > 1 && (
        <div className="px-3 py-3 border-b border-slate-700">
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 px-1">Switch Student</p>
          <div className="space-y-1">
            {relatedStudents.map(s => (
              <button
                key={s.id}
                onClick={() => selectStudent(s)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
                  s.id === activeStudentId
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                  s.id === activeStudentId ? 'bg-blue-500' : 'bg-slate-700'
                )}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className={cn('text-xs truncate', s.id === activeStudentId ? 'text-blue-200' : 'text-slate-500')}>
                    Age {calculateAge(s.date_of_birth)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User info */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-slate-400 text-xs">{roleLabel}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(item => (
          <NavItem
            key={item.to}
            {...item}
            badge={item.to === '/student/competitions' ? announcementCount : undefined}
          />
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-slate-700">
        <button
          onClick={signOut}
          className="sidebar-link w-full"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}