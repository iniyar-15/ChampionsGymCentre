import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { setupScheduledJobs } from './scheduler.js'
import competitionRoutes from './routes/competitions.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/create-user', async (req, res) => {
  const { email, password, userData } = req.body
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) return res.status(400).json({ error: error.message })

  await supabaseAdmin.from('users').insert({ id: data.user.id, ...userData })
  return res.json({ user: data.user })
})

app.post('/api/auth/create-student', async (req, res) => {
  const { phone, password, studentData } = req.body
  const email = `${phone.replace(/\D/g, '')}@cgc.internal`

  // Reuse existing auth account if this phone is already registered
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existing?.users?.find(u => u.email === email)

  let authUserId: string
  if (existingUser) {
    authUserId = existingUser.id
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return res.status(400).json({ error: error.message })
    authUserId = data.user.id
  }

  const { data: student, error: dbError } = await supabaseAdmin
    .from('students')
    .insert({ ...studentData, auth_id: authUserId })
    .select()
    .single()

  if (dbError) return res.status(400).json({ error: dbError.message })
  return res.json({ student })
})

app.delete('/api/auth/delete-user/:id', async (req, res) => {
  const { id } = req.params
  await supabaseAdmin.auth.admin.deleteUser(id)
  return res.json({ success: true })
})

// ─── Competition + student routes ────────────────────────────────────────────
app.use('/api', competitionRoutes)

// ─── Student data endpoints (bypass RLS for multi-student auth accounts) ─────
app.get('/api/student/attendance', async (req, res) => {
  const { studentId, from, to } = req.query as Record<string, string>
  if (!studentId) return res.status(400).json({ error: 'studentId required' })

  let query = supabaseAdmin
    .from('attendance')
    .select('date, status, batch_id, batches(name)')
    .eq('student_id', studentId)
    .order('date')

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

// ─── Fee collection: create ───────────────────────────────────────────────────
app.post('/api/fee', async (req, res) => {
  const { month, student_id, fee_structure_id, amount, paid_amount,
          paid_date, payment_mode, reference_id, notes, created_by } = req.body
  if (!student_id || !amount) return res.status(400).json({ error: 'student_id and amount required' })

  const { data, error } = await supabaseAdmin
    .from('fee_collections')
    .insert({ month, student_id, fee_structure_id: fee_structure_id || null,
              amount, paid_amount: paid_amount || 0,
              paid_date: paid_date || null, payment_mode: payment_mode || null,
              reference_id: reference_id || null, notes: notes || null,
              created_by: created_by || null })
    .select('id')
    .single()

  if (error) return res.status(400).json({ error: error.message })

  if ((paid_amount || 0) > 0) {
    const { generateAndEmailFeeReceipt } = await import('./services/receipt.js')
    generateAndEmailFeeReceipt(data.id).catch(e => console.error('[RECEIPT]', e.message))
  }

  return res.json({ id: data.id })
})

// ─── Fee collection: update ───────────────────────────────────────────────────
app.put('/api/fee/:id', async (req, res) => {
  const { month, student_id, fee_structure_id, amount, paid_amount,
          paid_date, payment_mode, reference_id, notes, created_by } = req.body

  const { error } = await supabaseAdmin
    .from('fee_collections')
    .update({ month, student_id, fee_structure_id: fee_structure_id || null,
              amount, paid_amount: paid_amount || 0,
              paid_date: paid_date || null, payment_mode: payment_mode || null,
              reference_id: reference_id || null, notes: notes || null,
              created_by: created_by || null })
    .eq('id', req.params.id)

  if (error) return res.status(400).json({ error: error.message })

  if ((paid_amount || 0) > 0) {
    const { generateAndEmailFeeReceipt } = await import('./services/receipt.js')
    generateAndEmailFeeReceipt(req.params.id).catch(e => console.error('[RECEIPT]', e.message))
  }

  return res.json({ id: req.params.id })
})

// ─── Fee collections: list for student (bypasses RLS) ────────────────────────
app.get('/api/fee/student/:studentId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('fee_collections')
    .select('*, fee_structures(name, amount)')
    .eq('student_id', req.params.studentId)
    .order('month', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

// ─── Fee receipt: generate + email + store ────────────────────────────────────
app.post('/api/fee/:id/send-receipt', async (req, res) => {
  try {
    const { generateAndEmailFeeReceipt } = await import('./services/receipt.js')
    await generateAndEmailFeeReceipt(req.params.id)
    return res.json({ success: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
})

// ─── Fee receipt: download signed URL ────────────────────────────────────────
app.get('/api/fee/:id/receipt-download', async (req, res) => {
  const { data: fc } = await supabaseAdmin
    .from('fee_collections')
    .select('receipt_url')
    .eq('id', req.params.id)
    .single()

  if (!fc?.receipt_url) return res.status(404).json({ error: 'No receipt stored for this payment' })

  const { data, error } = await supabaseAdmin.storage
    .from('receipts')
    .createSignedUrl(fc.receipt_url, 300) // 5-minute signed URL

  if (error || !data?.signedUrl) return res.status(500).json({ error: 'Could not generate download link' })
  return res.json({ url: data.signedUrl })
})

// ─── Reports email endpoint ────────────────────────────────────────────────────
app.post('/api/reports/send-monthly', async (req, res) => {
  try {
    await sendMonthlyReports()
    return res.json({ success: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
})

// ─── Scheduled jobs ───────────────────────────────────────────────────────────
setupScheduledJobs()

async function sendMonthlyReports() {
  const { sendReportEmail } = await import('./services/email.js')
  await sendReportEmail()
}

app.listen(PORT, () => {
  console.log(`CGC Server running on port ${PORT}`)
})