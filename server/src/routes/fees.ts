import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getSignedUrl } from '../services/storage.js'

const router = Router()
router.use(requireAuth)

// ─── List fee collections (with filters) ─────────────────────────────────────
router.get('/fees', async (req, res) => {
  const conditions: string[] = []
  const params: any[] = []

  const { month, studentId, from, to } = req.query as Record<string, string>
  if (month) {
    params.push(month + '-01')
    conditions.push(`fc.month = $${params.length}`)
  }
  if (from) { params.push(from); conditions.push(`fc.month >= $${params.length}`) }
  if (to)   { params.push(to);   conditions.push(`fc.month <= $${params.length}`) }
  if (studentId) {
    params.push(studentId)
    conditions.push(`fc.student_id = $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(`
    SELECT fc.*,
      json_build_object('id', s.id, 'name', s.name, 'contact_phone', s.contact_phone,
        'email', s.email) AS students,
      CASE WHEN fs.id IS NOT NULL
        THEN json_build_object('id', fs.id, 'name', fs.name, 'amount', fs.amount)
        ELSE NULL END AS fee_structures,
      CASE WHEN u.id IS NOT NULL
        THEN json_build_object('id', u.id, 'user_name', u.user_name)
        ELSE NULL END AS cash_receiver
    FROM fee_collections fc
    JOIN students s ON s.id = fc.student_id
    LEFT JOIN fee_structures fs ON fs.id = fc.fee_structure_id
    LEFT JOIN users u ON u.id = fc.cash_received_by
    ${where}
    ORDER BY fc.created_at DESC
  `, params)
  return res.json(rows)
})

// ─── Fee collections for one student ─────────────────────────────────────────
router.get('/fee/student/:studentId', async (req, res) => {
  const { rows } = await db.query(`
    SELECT fc.*,
      CASE WHEN fs.id IS NOT NULL
        THEN json_build_object('id', fs.id, 'name', fs.name, 'amount', fs.amount)
        ELSE NULL END AS fee_structures
    FROM fee_collections fc
    LEFT JOIN fee_structures fs ON fs.id = fc.fee_structure_id
    WHERE fc.student_id = $1
    ORDER BY fc.month DESC, fc.created_at DESC
  `, [req.params.studentId])
  return res.json(rows)
})

// ─── Create fee record ────────────────────────────────────────────────────────
router.post('/fee', async (req, res) => {
  const { month, student_id, fee_structure_id, amount, paid_amount,
          paid_date, payment_mode, reference_id, notes, created_by, cash_received_by } = req.body
  if (!student_id || !amount) return res.status(400).json({ error: 'student_id and amount required' })

  try {
    const { rows } = await db.query(
      `INSERT INTO fee_collections (month, student_id, fee_structure_id, amount, paid_amount,
        paid_date, payment_mode, reference_id, notes, created_by, cash_received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [month, student_id, fee_structure_id || null, amount, paid_amount || 0,
       paid_date || null, payment_mode || null, reference_id || null,
       notes || null, created_by || null, cash_received_by || null]
    )
    const id = rows[0].id

    if ((paid_amount || 0) > 0 && payment_mode !== 'cash') {
      const { generateAndEmailFeeReceipt } = await import('../services/receipt.js')
      generateAndEmailFeeReceipt(id).catch(e => console.error('[RECEIPT]', e.message))
    }

    return res.json({ id })
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

// ─── Update fee record ────────────────────────────────────────────────────────
router.put('/fee/:id', async (req, res) => {
  const { month, student_id, fee_structure_id, amount, paid_amount,
          paid_date, payment_mode, reference_id, notes, created_by, cash_received_by } = req.body
  try {
    await db.query(
      `UPDATE fee_collections SET month=$1, student_id=$2, fee_structure_id=$3, amount=$4,
        paid_amount=$5, paid_date=$6, payment_mode=$7, reference_id=$8, notes=$9,
        created_by=$10, cash_received_by=$11, updated_at=NOW()
       WHERE id=$12`,
      [month, student_id, fee_structure_id || null, amount, paid_amount || 0,
       paid_date || null, payment_mode || null, reference_id || null, notes || null,
       created_by || null, cash_received_by || null, req.params.id]
    )

    if ((paid_amount || 0) > 0 && payment_mode !== 'cash') {
      const { generateAndEmailFeeReceipt } = await import('../services/receipt.js')
      generateAndEmailFeeReceipt(req.params.id).catch(e => console.error('[RECEIPT]', e.message))
    }

    return res.json({ id: req.params.id })
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

// ─── Send receipt ─────────────────────────────────────────────────────────────
router.post('/fee/:id/send-receipt', async (req, res) => {
  try {
    const { generateAndEmailFeeReceipt } = await import('../services/receipt.js')
    await generateAndEmailFeeReceipt(req.params.id)
    return res.json({ success: true })
  } catch (e: any) { return res.status(500).json({ error: e.message }) }
})

// ─── Receipt download signed URL ──────────────────────────────────────────────
router.get('/fee/:id/receipt-download', async (req, res) => {
  const { rows } = await db.query(
    `SELECT receipt_url FROM fee_collections WHERE id = $1`, [req.params.id]
  )
  if (!rows[0]?.receipt_url) return res.status(404).json({ error: 'No receipt stored' })
  try {
    const url = await getSignedUrl(rows[0].receipt_url, 300)
    return res.json({ url })
  } catch (e: any) { return res.status(500).json({ error: e.message }) }
})

// ─── Delete fee record ───────────────────────────────────────────────────────
router.delete('/fee/:id', async (req, res) => {
  await db.query(`DELETE FROM fee_collections WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

// ─── Razorpay: create order ───────────────────────────────────────────────────
router.post('/fee/create-order', async (req, res) => {
  const { amount, studentId, month, feeStructureId } = req.body
  if (!amount || !studentId || !month) return res.status(400).json({ error: 'amount, studentId, month required' })
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || keyId.startsWith('rzp_test_your')) return res.status(503).json({ error: 'Payment gateway not configured' })
  try {
    const Razorpay = (await import('razorpay')).default
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret! })
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `fee_${studentId.slice(0, 8)}_${month.replace('-', '')}`,
      notes: { studentId, month, feeStructureId: feeStructureId || '' },
    })
    return res.json({ orderId: order.id, amount: order.amount, currency: order.currency })
  } catch (e: any) { return res.status(500).json({ error: e.message }) }
})

// ─── Razorpay: verify payment ─────────────────────────────────────────────────
router.post('/fee/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature,
          studentId, month, feeStructureId, amount } = req.body

  const { createHmac } = await import('crypto')
  const hmac = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`)
  if (hmac.digest('hex') !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed — invalid signature' })
  }

  const { rows } = await db.query(
    `INSERT INTO fee_collections (month, student_id, fee_structure_id, amount, paid_amount,
      paid_date, payment_mode, reference_id)
     VALUES ($1,$2,$3,$4,$4,$5,'online',$6) RETURNING id`,
    [`${month}-01`, studentId, feeStructureId || null, amount / 100,
     new Date().toISOString().split('T')[0], razorpay_payment_id]
  )
  const { generateAndEmailFeeReceipt } = await import('../services/receipt.js')
  generateAndEmailFeeReceipt(rows[0].id).catch(e => console.error('[RECEIPT]', e.message))
  return res.json({ success: true, id: rows[0].id })
})

// ─── Staff list for cash-received-by selector ─────────────────────────────────
router.get('/staff-list', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, user_name, role FROM users WHERE role IN ('admin','coach','manager') ORDER BY user_name`
  )
  return res.json(rows)
})

export default router
