import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Search, CheckSquare, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type AgeGroupFull = {
  id: string
  name: string
  min_age: number | null
  max_age: number | null
  level_id: string | null
  entry_fee: number | null
  is_finalized: boolean
  levels: { name: string } | null
}

type Candidate = {
  id: string
  name: string
  age: number
  level_id: string | null
  levels: { name: string } | null
  qualified: boolean
  matchReason: 'age' | 'level' | 'both' | 'all' | null
}

interface ShortlistModalProps {
  open: boolean
  onClose: () => void
  ageGroup: AgeGroupFull
  competitionId: string
  onSaved: () => void
}

const matchBadge: Record<string, { label: string; cls: string }> = {
  both: { label: 'Age + Level', cls: 'bg-green-100 text-green-700' },
  age: { label: 'Age match', cls: 'bg-blue-100 text-blue-700' },
  level: { label: 'Level match', cls: 'bg-purple-100 text-purple-700' },
  all: { label: 'All eligible', cls: 'bg-gray-100 text-gray-600' },
}

export default function ShortlistModal({ open, onClose, ageGroup, competitionId, onSaved }: ShortlistModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [initialized, setInitialized] = useState(false)

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ['shortlist-candidates', competitionId, ageGroup.id],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/competitions/${competitionId}/age-groups/${ageGroup.id}/shortlist-candidates`)
      if (!res.ok) throw new Error('Failed to load candidates')
      return (await res.json()) as Candidate[]
    },
  })

  const { data: existingShortlist = [] } = useQuery({
    queryKey: ['shortlist-existing', ageGroup.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('competition_shortlist')
        .select('student_id, status')
        .eq('age_group_id', ageGroup.id)
        .neq('status', 'removed')
      return data || []
    },
  })

  // Initialize selections: existing shortlist first, then auto-select qualified if no shortlist yet
  useEffect(() => {
    if (!open) { setInitialized(false); return }
    if (loadingCandidates) return
    if (initialized) return

    if (existingShortlist.length > 0) {
      setSelected(new Set(existingShortlist.map((e: any) => e.student_id)))
    } else {
      setSelected(new Set(candidates.filter(c => c.qualified).map(c => c.id)))
    }
    setInitialized(true)
  }, [open, loadingCandidates, existingShortlist, candidates, initialized])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/competitions/age-groups/${ageGroup.id}/shortlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: Array.from(selected) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save shortlist')
      return json
    },
    onSuccess: (data) => {
      if (data.notified > 0) {
        alert(`Shortlist saved. ${data.notified} student(s) notified via SMS${data.notified > 0 ? ' and email' : ''}.`)
      }
      onSaved()
      onClose()
    },
  })

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(c => c.id)))
  }

  function selectQualified() {
    setSelected(new Set(candidates.filter(c => c.qualified).map(c => c.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  const filtered = candidates.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const qualifiedCount = candidates.filter(c => c.qualified).length
  const ageLabel = ageGroup.min_age || ageGroup.max_age
    ? `Age ${ageGroup.min_age ?? '?'}–${ageGroup.max_age ?? '?'}`
    : null
  const levelLabel = ageGroup.levels?.name ?? null

  return (
    <Modal open={open} onClose={onClose} title={`Shortlist — ${ageGroup.name}`} size="lg">
      <div className="space-y-4">
        {/* Criteria summary */}
        <div className="flex flex-wrap gap-2 text-sm">
          {ageLabel && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{ageLabel}</span>}
          {levelLabel && <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">{levelLabel}</span>}
          {ageGroup.entry_fee && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">Entry: ₹{ageGroup.entry_fee}</span>}
          <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">{qualifiedCount} auto-matched</span>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search students…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={selectQualified} className="text-xs text-blue-600 hover:underline">Auto-select qualified</button>
          <button onClick={selectAll} className="text-xs text-gray-500 hover:underline">All</button>
          <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">None</button>
        </div>

        {/* Student list */}
        {loadingCandidates ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No students found</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
            {filtered.map(c => {
              const isSelected = selected.has(c.id)
              const badge = c.matchReason ? matchBadge[c.matchReason] : null
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border',
                    isSelected
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  )}
                >
                  {isSelected
                    ? <CheckSquare size={18} className="text-blue-600 flex-shrink-0" />
                    : <Square size={18} className="text-gray-300 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{c.name}</span>
                      {badge && (
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.cls)}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Age {c.age}{c.levels ? ` · ${c.levels.name}` : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-gray-500">{selected.size} student{selected.size !== 1 ? 's' : ''} selected</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              Save Shortlist
            </Button>
          </div>
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-red-500">{(saveMutation.error as Error).message}</p>
        )}
      </div>
    </Modal>
  )
}
