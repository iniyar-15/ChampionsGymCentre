import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserRow, StudentRow } from '@/types/database'

type StaffUser = UserRow & { type: 'staff' }
type StudentUser = StudentRow & { type: 'student' }
type AppUser = StaffUser | StudentUser | null

interface AuthContextType {
  session: Session | null
  user: User | null
  appUser: AppUser
  relatedStudents: StudentRow[]
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithPhone: (phone: string, password: string) => Promise<{ error: Error | null }>
  selectStudent: (student: StudentRow) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser>(null)
  const [relatedStudents, setRelatedStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadAppUser(session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        loadAppUser(session.user)
      } else {
        setAppUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadAppUser(authUser: User) {
    const { data: staffData } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (staffData) {
      setRelatedStudents([])
      setAppUser({ ...(staffData as UserRow), type: 'staff' })
      setLoading(false)
      return
    }

    const { data: studentsData } = await supabase
      .from('students')
      .select('*')
      .eq('auth_id', authUser.id)
      .order('name')

    if (studentsData && studentsData.length > 0) {
      setRelatedStudents(studentsData as StudentRow[])
      setAppUser({ ...(studentsData[0] as StudentRow), type: 'student' })
    }
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signInWithPhone(phone: string, password: string) {
    const email = `${phone.replace(/\D/g, '')}@cgc.internal`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error as Error }
    return { error: null }
  }

  function selectStudent(student: StudentRow) {
    setAppUser({ ...student, type: 'student' })
    setRelatedStudents(prev => prev.length ? prev : [student])
  }

  async function signOut() {
    await supabase.auth.signOut()
    setAppUser(null)
    setRelatedStudents([])
  }

  return (
    <AuthContext.Provider value={{ session, user, appUser, relatedStudents, loading, signIn, signInWithPhone, selectStudent, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useStaffUser() {
  const { appUser } = useAuth()
  if (!appUser || appUser.type !== 'staff') return null
  return appUser
}

export function useStudentUser() {
  const { appUser } = useAuth()
  if (!appUser || appUser.type !== 'student') return null
  return appUser
}