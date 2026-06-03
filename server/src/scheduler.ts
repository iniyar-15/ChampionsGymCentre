import cron from 'node-cron'
import { supabaseAdmin } from './index.js'
import { format, startOfMonth, subMonths } from 'date-fns'
import { sendReportEmail } from './services/email.js'

export function setupScheduledJobs() {
  // ─── Class reminder — 9 AM daily ─────────────────────────────────────────
  cron.schedule('0 9 * * *', async () => {
    const dayMap: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
    const todayDay = dayMap[new Date().getDay()]

    const { data: batches } = await supabaseAdmin
      .from('batches')
      .select('id, name, days')

    const todayBatches = (batches || []).filter(b => b.days?.includes(todayDay))
    if (!todayBatches.length) return

    const batchIds = todayBatches.map(b => b.id)
    const { data: enrollments } = await supabaseAdmin
      .from('student_batches')
      .select('student_id, students(name, contact_phone)')
      .in('batch_id', batchIds)

    const phones = new Set<string>()
    enrollments?.forEach((e: any) => {
      if (e.students?.contact_phone) phones.add(e.students.contact_phone)
    })

    // SMS sending would go here — for now just log
    console.log(`[REMINDER] Class reminder: ${phones.size} students, batches: ${todayBatches.map(b => b.name).join(', ')}`)
  })

  // ─── Fee reminder — 8th of every month ────────────────────────────────────
  cron.schedule('0 9 8 * *', async () => {
    await sendFeeReminders()
  })

  // ─── Fee reminder follow-up — every 2 days after 10th ──────────────────────
  cron.schedule('0 9 */2 * *', async () => {
    const day = new Date().getDate()
    if (day > 10) {
      await sendFeeReminders()
    }
  })

  // ─── Competition notice — weekly on Monday ────────────────────────────────
  cron.schedule('0 10 * * 1', async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: competitions } = await supabaseAdmin
      .from('competitions')
      .select('id, name, start_date, location')
      .gte('start_date', today)
      .order('start_date')
      .limit(3)

    if (!competitions?.length) return
    console.log(`[COMPETITION] ${competitions.length} upcoming competitions to notify about`)
  })

  // ─── Monthly reports — 1st of each month at 6 AM ─────────────────────────
  cron.schedule('0 6 1 * *', async () => {
    try {
      await sendReportEmail()
      console.log('[REPORTS] Monthly reports sent to manager')
    } catch (e) {
      console.error('[REPORTS] Failed to send monthly reports:', e)
    }
  })
}

async function sendFeeReminders() {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: allStudents } = await supabaseAdmin
    .from('students')
    .select('id, name, contact_phone, fee_structure_id')
    .eq('is_active', true)

  const { data: paidFees } = await supabaseAdmin
    .from('fee_collections')
    .select('student_id, paid_amount, amount')
    .eq('month', monthStart)

  const paidSet = new Set(
    (paidFees || []).filter(f => (f.paid_amount || 0) >= f.amount).map(f => f.student_id)
  )

  const unpaid = (allStudents || []).filter(s => s.fee_structure_id && !paidSet.has(s.id))
  console.log(`[FEE REMINDER] ${unpaid.length} students have unpaid fees for ${monthStart}`)
}