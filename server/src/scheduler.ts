import cron from 'node-cron'
import { supabaseAdmin } from './index.js'
import { format, startOfMonth, getDaysInMonth } from 'date-fns'
import { sendReportEmail, sendFeeReminderEmail } from './services/email.js'

export function setupScheduledJobs() {
  if (process.env.CRON_ENABLED !== 'true') {
    console.log('[SCHEDULER] Cron disabled — set CRON_ENABLED=true on one instance to enable')
    return
  }

  console.log('[SCHEDULER] Cron enabled')

  // ─── 1st of month: auto-create fee bills for all active students ─────────────
  cron.schedule('1 0 1 * *', async () => {
    await autoCreateMonthlyBills()
  })

  // ─── Fee reminders: 2nd and 8th at 9 AM ─────────────────────────────────────
  cron.schedule('0 9 2 * *', async () => { await sendFeeReminders(2) })
  cron.schedule('0 9 8 * *', async () => { await sendFeeReminders(8) })

  // ─── Monthly reports — 1st of each month at 6 AM ─────────────────────────────
  cron.schedule('0 6 1 * *', async () => {
    try {
      await sendReportEmail()
      console.log('[REPORTS] Monthly reports sent to manager')
    } catch (e) {
      console.error('[REPORTS] Failed to send monthly reports:', e)
    }
  })

  // ─── Supabase keepalive — ping every 5 days to prevent free-tier auto-pause ──
  cron.schedule('0 8 */5 * *', async () => {
    const { data, error } = await supabaseAdmin.from('users').select('id').limit(1)
    console.log('[KEEPALIVE] Supabase ping:', error ? `failed — ${error.message}` : 'ok')
  })
}

// ─── Auto-create monthly bills ────────────────────────────────────────────────
async function autoCreateMonthlyBills() {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  console.log(`[BILLING] Auto-creating bills for ${monthStart}`)

  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name, created_at, fee_structure_id, fee_structures(amount)')
    .eq('is_active', true)
    .not('fee_structure_id', 'is', null)

  if (!students?.length) return

  // Fetch existing bills for this month to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from('fee_collections')
    .select('student_id')
    .eq('month', monthStart)

  const alreadyBilled = new Set((existing || []).map((r: any) => r.student_id))

  const now = new Date()
  const daysInMonth = getDaysInMonth(now)

  const rows: any[] = []
  for (const s of students) {
    if (alreadyBilled.has(s.id)) continue

    const fullAmount: number = (s as any).fee_structures?.amount || 0
    if (!fullAmount) continue

    // Prorate if student joined during the current month
    const joinedAt = new Date(s.created_at)
    let amount = fullAmount
    if (
      joinedAt.getFullYear() === now.getFullYear() &&
      joinedAt.getMonth() === now.getMonth() &&
      joinedAt.getDate() > 1
    ) {
      const remainingDays = daysInMonth - joinedAt.getDate() + 1
      amount = Math.round((fullAmount / daysInMonth) * remainingDays)
    }

    rows.push({
      month: monthStart,
      student_id: s.id,
      fee_structure_id: (s as any).fee_structure_id,
      amount,
      paid_amount: 0,
    })
  }

  if (rows.length) {
    const { error } = await supabaseAdmin.from('fee_collections').insert(rows)
    if (error) console.error('[BILLING] Insert error:', error.message)
    else console.log(`[BILLING] Created ${rows.length} fee records for ${monthStart}`)
  }
}

// ─── Fee reminders via email ──────────────────────────────────────────────────
async function sendFeeReminders(day: number) {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthLabel = format(new Date(), 'MMMM yyyy')
  console.log(`[FEE REMINDER] Day ${day} — checking unpaid fees for ${monthStart}`)

  // Get all fee records for this month
  const { data: fees } = await supabaseAdmin
    .from('fee_collections')
    .select('student_id, amount, paid_amount')
    .eq('month', monthStart)

  // Sum paid per student
  const paidByStudent: Record<string, number> = {}
  const dueByStudent: Record<string, number> = {}
  for (const f of fees || []) {
    paidByStudent[f.student_id] = (paidByStudent[f.student_id] || 0) + (f.paid_amount || 0)
    dueByStudent[f.student_id] = (dueByStudent[f.student_id] || 0) + f.amount
  }

  const unpaidIds = Object.keys(dueByStudent).filter(
    id => paidByStudent[id] < dueByStudent[id]
  )

  if (!unpaidIds.length) {
    console.log('[FEE REMINDER] Everyone has paid — no reminders needed')
    return
  }

  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name, email')
    .in('id', unpaidIds)

  let sent = 0
  for (const s of students || []) {
    if (!s.email) continue
    const balance = dueByStudent[s.id] - (paidByStudent[s.id] || 0)
    try {
      await sendFeeReminderEmail({
        to: s.email,
        studentName: s.name,
        month: monthLabel,
        amountDue: balance,
        reminderDay: day,
      })
      sent++
    } catch (err: any) {
      console.error(`[FEE REMINDER] Failed to email ${s.email}:`, err.message)
    }
  }

  console.log(`[FEE REMINDER] Sent ${sent} reminders for day ${day}`)
}
