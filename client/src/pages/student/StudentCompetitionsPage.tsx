import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import { Trophy, Bell, MapPin, CalendarDays, Banknote, X, CheckCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/FormField'
import { PAYMENT_MODES } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  shortlisted: { label: 'Shortlisted',  cls: 'bg-blue-100 text-blue-700' },
  finalized:   { label: 'Shortlisted',  cls: 'bg-blue-100 text-blue-700' },
  confirmed:   { label: 'Confirmed ✓',  cls: 'bg-green-100 text-green-700' },
}

export default function StudentCompetitionsPage() {
  const qc = useQueryClient()
  const { appUser } = useAuth()
  const student = appUser?.type === 'student' ? appUser : null

  const [confirmModal, setConfirmModal] = useState(false)
  const [confirmEntry, setConfirmEntry] = useState<any>(null)
  const [feePaid, setFeePaid] = useState(false)
  const [payMode, setPayMode] = useState('')

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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const ag = confirmEntry?.competition_age_groups
      const hasEntryFee = ag?.entry_fee != null && ag.entry_fee > 0
      const res = await fetch(`${API_URL}/api/student/competitions/${confirmEntry.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_fee_paid: hasEntryFee ? feePaid : false,
          entry_fee_payment_mode: hasEntryFee && feePaid ? payMode || null : null,
        }),
      })
      if (!res.ok) throw new Error('Failed to confirm')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-competitions', student?.id] })
      setConfirmModal(false)
      setConfirmEntry(null)
    },
  })

  function openConfirm(entry: any) {
    setConfirmEntry(entry)
    setFeePaid(false)
    setPayMode('')
    setConfirmModal(true)
  }

  const ag = confirmEntry?.competition_age_groups
  const comp = ag?.competitions
  const hasEntryFee = ag?.entry_fee != null && ag.entry_fee > 0

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
                <button onClick={() => dismissMutation.mutate(ann.id)} className="text-amber-400 hover:text-amber-600 flex-shrink-0 mt-0.5">
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
          const agItem = entry.competition_age_groups
          const compItem = agItem?.competitions
          const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.shortlisted
          const canConfirm = entry.status !== 'confirmed'

          return (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-3">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{compItem?.name}</h3>
                  {compItem?.organized_by && <p className="text-xs text-gray-500 mt-0.5">Organised by {compItem.organized_by}</p>}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Trophy size={14} className="text-gray-400" />
                  <span>Age Group: <span className="font-medium text-gray-800">{agItem?.name}</span></span>
                </div>
                {(agItem?.start_date || compItem?.start_date) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <CalendarDays size={14} className="text-gray-400" />
                    <span>
                      {formatDate(agItem?.start_date || compItem?.start_date)}
                      {agItem?.start_time && ` at ${agItem.start_time.slice(0, 5)}`}
                      {agItem?.end_time && ` – ${agItem.end_time.slice(0, 5)}`}
                    </span>
                  </div>
                )}
                {compItem?.location && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={14} className="text-gray-400" />
                    <span>{compItem.location}</span>
                  </div>
                )}
                {agItem?.entry_fee != null && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Banknote size={14} className="text-gray-400" />
                    <span>Entry fee: <span className="font-medium text-gray-800">₹{agItem.entry_fee}</span></span>
                  </div>
                )}
              </div>

              {entry.status === 'confirmed' && (
                <div className="mt-3 pt-3 border-t flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle size={16} />
                  <span>Participation confirmed{entry.entry_fee_paid ? ` · Entry fee paid (${entry.entry_fee_payment_mode || '—'})` : ''}</span>
                </div>
              )}

              {canConfirm && (
                <div className="mt-3 pt-3 border-t">
                  <Button size="sm" onClick={() => openConfirm(entry)}>
                    Confirm Participation
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* Confirm participation modal */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Confirm Participation" size="sm">
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-semibold">{comp?.name}</p>
            <p className="text-xs mt-0.5">{ag?.name}{(ag?.start_date || comp?.start_date) ? ` · ${formatDate(ag?.start_date || comp?.start_date)}` : ''}</p>
          </div>

          {hasEntryFee && (
            <>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="fee-paid"
                  checked={feePaid}
                  onChange={e => setFeePaid(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="fee-paid" className="text-sm font-medium text-gray-700">
                  I have paid the entry fee of ₹{ag?.entry_fee}
                </label>
              </div>

              {feePaid && (
                <FormField label="Payment Mode">
                  <Select value={payMode} onChange={e => setPayMode(e.target.value)}>
                    <option value="">— Select —</option>
                    {PAYMENT_MODES.map(m => (
                      <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                    ))}
                  </Select>
                </FormField>
              )}
            </>
          )}

          {!hasEntryFee && (
            <p className="text-sm text-gray-600">No entry fee required for this age group.</p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setConfirmModal(false)}>Cancel</Button>
            <Button onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>
              Confirm Participation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
