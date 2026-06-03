import { useAuth } from '@/context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calculateAge, formatDate } from '@/lib/utils'

export default function StudentProfilePage() {
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const { data: profile } = useQuery({
    queryKey: ['student-profile', student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('*, levels(name, start_age, end_age), fee_structures(name, days_per_week, amount), student_batches(batches(name, days, start_time, end_time))')
        .eq('id', student!.id)
        .single()
      return data
    },
  })

  if (!profile) return <div className="text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your details as registered at Champions Gymnastics Centre (CGC)</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{profile.name}</h2>
            <p className="text-blue-200 text-sm">Age {calculateAge(profile.date_of_birth)} · {profile.gender || 'N/A'}</p>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-5">
          <Section title="Personal Information">
            <Row label="Full Name" value={profile.name} />
            <Row label="Parent / Guardian" value={profile.parent_name} />
            <Row label="Date of Birth" value={formatDate(profile.date_of_birth)} />
            <Row label="Age" value={`${calculateAge(profile.date_of_birth)} years`} />
            <Row label="Gender" value={profile.gender} />
            <Row label="School" value={profile.school} />
          </Section>

          <Section title="Contact">
            <Row label="Primary Phone" value={profile.contact_phone} />
            <Row label="Secondary Phone" value={profile.secondary_phone} />
          </Section>

          <Section title="Training">
            <Row label="Level" value={(profile as any).levels?.name} />
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Batches Enrolled</p>
              <div className="flex flex-wrap gap-2">
                {(profile as any).student_batches?.map((sb: any) => (
                  <div key={sb.batches?.name} className="badge badge-blue">
                    {sb.batches?.name} · {sb.batches?.days?.join(', ')} · {sb.batches?.start_time?.slice(0, 5)}–{sb.batches?.end_time?.slice(0, 5)}
                  </div>
                ))}
                {!(profile as any).student_batches?.length && <p className="text-sm text-gray-400">No batches enrolled</p>}
              </div>
            </div>
          </Section>

          <Section title="Fee Plan">
            {(profile as any).fee_structures ? (
              <>
                <Row label="Plan" value={(profile as any).fee_structures?.name} />
                <Row label="Days per Week" value={`${(profile as any).fee_structures?.days_per_week} days`} />
                <Row label="Monthly Amount" value={`₹${(profile as any).fee_structures?.amount}`} />
              </>
            ) : (
              <p className="text-sm text-gray-400">No fee plan assigned</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between">
      <p className="text-sm text-gray-500 w-40 flex-shrink-0">{label}</p>
      <p className="text-sm font-medium text-gray-800 text-right">{value || '—'}</p>
    </div>
  )
}