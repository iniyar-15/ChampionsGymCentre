import { Router } from 'express'
import { supabaseAdmin } from '../index.js'
import { sendCompetitionShortlistEmail } from '../services/email.js'
import { sendSMS } from '../services/sms.js'

const router = Router()

// ─── Create competition ───────────────────────────────────────────────────────
router.post('/competitions', async (req, res) => {
  const { name, organized_by, location, start_date, end_date, start_time, end_time } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Competition name is required' })
  const { data, error } = await supabaseAdmin.from('competitions').insert({
    name: name.trim(), organized_by: organized_by || null, location: location || null,
    start_date: start_date || null, end_date: end_date || null,
    start_time: start_time || null, end_time: end_time || null,
  }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

// ─── Update competition ───────────────────────────────────────────────────────
router.put('/competitions/:id', async (req, res) => {
  const { id } = req.params
  const { name, organized_by, location, start_date, end_date, start_time, end_time } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Competition name is required' })
  const { data, error } = await supabaseAdmin.from('competitions').update({
    name: name.trim(), organized_by: organized_by || null, location: location || null,
    start_date: start_date || null, end_date: end_date || null,
    start_time: start_time || null, end_time: end_time || null,
  }).eq('id', id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

// ─── Delete competition ───────────────────────────────────────────────────────
router.delete('/competitions/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await supabaseAdmin.from('competitions').delete().eq('id', id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ success: true })
})

// ─── List all competitions with full detail ───────────────────────────────────
router.get('/competitions', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('competitions')
    .select(`
      *,
      competition_age_groups(
        id, name, min_age, max_age, level_id, entry_fee, is_finalized,
        start_date, end_date, start_time, end_time,
        levels(name),
        competition_age_group_apparatus(id, apparatus_id, apparatus(name)),
        competition_shortlist(id, student_id, status, students(name))
      )
    `)
    .order('start_date', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

// ─── Create age group ─────────────────────────────────────────────────────────
router.post('/competitions/:compId/age-groups', async (req, res) => {
  const { compId } = req.params
  const { name, min_age, max_age, level_id, entry_fee, apparatus_ids,
          start_date, end_date, start_time, end_time } = req.body

  if (!name?.trim()) return res.status(400).json({ error: 'Age group name is required' })

  const { data: ag, error } = await supabaseAdmin
    .from('competition_age_groups')
    .insert({
      competition_id: compId,
      name: name.trim(),
      min_age: min_age ?? null,
      max_age: max_age ?? null,
      level_id: level_id || null,
      entry_fee: entry_fee ?? null,
      start_date: start_date || null,
      end_date: end_date || null,
      start_time: start_time || null,
      end_time: end_time || null,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  if (ag && apparatus_ids?.length) {
    await supabaseAdmin.from('competition_age_group_apparatus').insert(
      apparatus_ids.map((aid: string) => ({ age_group_id: ag.id, apparatus_id: aid }))
    )
  }

  return res.json(ag)
})

// ─── Shortlist candidates for an age group ────────────────────────────────────
router.get('/competitions/:compId/age-groups/:agId/shortlist-candidates', async (req, res) => {
  const { agId } = req.params

  const { data: ag, error: agErr } = await supabaseAdmin
    .from('competition_age_groups')
    .select('min_age, max_age, level_id')
    .eq('id', agId)
    .single()

  if (agErr || !ag) return res.status(404).json({ error: 'Age group not found' })

  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id, name, date_of_birth, level_id, levels(name)')
    .eq('is_active', true)
    .order('name')

  if (sErr) return res.status(400).json({ error: sErr.message })

  const today = new Date()
  const candidates = (students || []).map((s: any) => {
    const dob = new Date(s.date_of_birth)
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--

    const ageMatch =
      (ag.min_age === null || age >= ag.min_age) &&
      (ag.max_age === null || age <= ag.max_age)
    const levelMatch = ag.level_id === null || s.level_id === ag.level_id

    let matchReason: string | null = null
    if (ag.min_age !== null || ag.max_age !== null || ag.level_id !== null) {
      if (ageMatch && levelMatch && ag.level_id !== null && (ag.min_age !== null || ag.max_age !== null)) {
        matchReason = 'both'
      } else if (ageMatch && (ag.min_age !== null || ag.max_age !== null)) {
        matchReason = 'age'
      } else if (levelMatch && ag.level_id !== null) {
        matchReason = 'level'
      }
    } else {
      matchReason = 'all'
    }

    const qualified = ageMatch && levelMatch
    return { ...s, age, matchReason: qualified ? matchReason : null, qualified }
  })

  return res.json(candidates)
})

// ─── Save shortlist + notify newly added students ─────────────────────────────
router.post('/competitions/age-groups/:agId/shortlist', async (req, res) => {
  const { agId } = req.params
  const { studentIds }: { studentIds: string[] } = req.body

  // Load age group + competition details for notifications
  const { data: ag } = await supabaseAdmin
    .from('competition_age_groups')
    .select('name, entry_fee, competitions(id, name, start_date, start_time, location)')
    .eq('id', agId)
    .single()

  if (!ag) return res.status(404).json({ error: 'Age group not found' })
  const comp = (ag as any).competitions

  // Find which students are already notified so we don't double-notify
  const { data: existing } = await supabaseAdmin
    .from('competition_shortlist')
    .select('student_id, notified_at')
    .eq('age_group_id', agId)
    .neq('status', 'removed')

  const alreadyNotified = new Set(
    (existing || []).filter((e: any) => e.notified_at).map((e: any) => e.student_id)
  )

  // Soft-remove students not in the new list
  if (studentIds.length) {
    await supabaseAdmin
      .from('competition_shortlist')
      .update({ status: 'removed' })
      .eq('age_group_id', agId)
      .not('student_id', 'in', `(${studentIds.map(id => `"${id}"`).join(',')})`)
  } else {
    await supabaseAdmin
      .from('competition_shortlist')
      .update({ status: 'removed' })
      .eq('age_group_id', agId)
  }

  // Upsert selected students as shortlisted
  if (studentIds.length) {
    const rows = studentIds.map(id => ({ age_group_id: agId, student_id: id, status: 'shortlisted' }))
    const { error: upsertErr } = await supabaseAdmin
      .from('competition_shortlist')
      .upsert(rows, { onConflict: 'age_group_id,student_id', ignoreDuplicates: false })
    if (upsertErr) return res.status(400).json({ error: upsertErr.message })
  }

  // Notify newly shortlisted students (those not previously notified)
  const newlyShortlisted = studentIds.filter(id => !alreadyNotified.has(id))
  if (newlyShortlisted.length) {
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id, name, contact_phone, email')
      .in('id', newlyShortlisted)

    const dateStr = comp?.start_date
      ? new Date(comp.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    const locationStr: string = comp?.location ?? ''
    const competitionName: string = comp?.name ?? ''
    const notifiedIds: string[] = []

    for (const student of (students || []) as any[]) {
      // SMS to parent's phone
      const smsText = `Your child ${student.name} is shortlisted for the ${competitionName}${dateStr ? ` on ${dateStr}` : ''}${locationStr ? ` at ${locationStr}` : ''}. Please check the app for more details.`
      await sendSMS(student.contact_phone, smsText)

      // Email if available
      if (student.email) {
        try {
          await sendCompetitionShortlistEmail({
            to: student.email,
            studentName: student.name,
            competitionName,
            ageGroupName: (ag as any).name,
            startDate: comp?.start_date ?? null,
            startTime: comp?.start_time ?? null,
            location: locationStr || null,
            entryFee: (ag as any).entry_fee ?? null,
          })
        } catch (err) {
          console.error(`[EMAIL] Failed for ${student.email}:`, err)
        }
      }

      // Mark as notified
      const { data: sl } = await supabaseAdmin
        .from('competition_shortlist')
        .select('id')
        .eq('age_group_id', agId)
        .eq('student_id', student.id)
        .single()
      if (sl) notifiedIds.push((sl as any).id)
    }

    if (notifiedIds.length) {
      await supabaseAdmin
        .from('competition_shortlist')
        .update({ notified_at: new Date().toISOString() })
        .in('id', notifiedIds)
    }
  }

  return res.json({ success: true, notified: newlyShortlisted.length })
})

// ─── Student: confirm competition participation ───────────────────────────────
router.post('/student/competitions/:shortlistId/confirm', async (req, res) => {
  const { shortlistId } = req.params
  const { entry_fee_paid, entry_fee_payment_mode } = req.body

  const { error } = await supabaseAdmin
    .from('competition_shortlist')
    .update({
      status: 'confirmed',
      entry_fee_paid: entry_fee_paid ?? false,
      entry_fee_payment_mode: entry_fee_payment_mode || null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', shortlistId)

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ success: true })
})

// ─── Student: shortlisted + finalized competitions ────────────────────────────
router.get('/student/competitions', async (req, res) => {
  const { studentId } = req.query as Record<string, string>
  if (!studentId) return res.status(400).json({ error: 'studentId required' })

  const { data, error } = await supabaseAdmin
    .from('competition_shortlist')
    .select(`
      id, status, notified_at,
      competition_age_groups(
        id, name, min_age, max_age, entry_fee,
        competitions(id, name, organized_by, location, start_date, end_date, start_time, end_time)
      )
    `)
    .eq('student_id', studentId)
    .in('status', ['shortlisted', 'finalized', 'confirmed'])
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

// ─── Student: announcements ───────────────────────────────────────────────────
router.get('/student/announcements', async (req, res) => {
  const { studentId } = req.query as Record<string, string>
  if (!studentId) return res.status(400).json({ error: 'studentId required' })

  // Find competitions where this student is shortlisted, finalized or confirmed
  const { data: shortlistEntries } = await supabaseAdmin
    .from('competition_shortlist')
    .select('competition_age_groups(competition_id)')
    .eq('student_id', studentId)
    .in('status', ['shortlisted', 'finalized', 'confirmed'])

  const competitionIds: string[] = (shortlistEntries || [])
    .map((e: any) => e.competition_age_groups?.competition_id)
    .filter(Boolean)

  // Already-read announcement IDs
  const { data: reads } = await supabaseAdmin
    .from('announcement_reads')
    .select('announcement_id')
    .eq('student_id', studentId)

  const readIds = (reads || []).map((r: any) => r.announcement_id)

  // Only show announcements for competitions the student is shortlisted in
  // (non-competition announcements where competition_id IS NULL are shown to everyone)
  let query = supabaseAdmin
    .from('announcements')
    .select('id, title, body, competition_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (competitionIds.length) {
    query = query.or(`competition_id.is.null,competition_id.in.(${competitionIds.join(',')})`)
  } else {
    // Student has no shortlistings — only show non-competition announcements
    query = query.is('competition_id', null)
  }

  if (readIds.length) {
    query = query.not('id', 'in', `(${readIds.map((id: string) => `"${id}"`).join(',')})`)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

// ─── Student: mark announcement read ─────────────────────────────────────────
router.post('/student/announcements/:id/read', async (req, res) => {
  const { id } = req.params
  const { studentId } = req.body
  if (!studentId) return res.status(400).json({ error: 'studentId required' })

  const { error } = await supabaseAdmin
    .from('announcement_reads')
    .upsert({ announcement_id: id, student_id: studentId }, { onConflict: 'announcement_id,student_id', ignoreDuplicates: true })

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ success: true })
})

export default router
