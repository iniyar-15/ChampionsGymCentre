import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// ─── List attendance (filters: batchId, date, studentId, from, to) ───────────
router.get('/attendance', async (req, res) => {
  const { batchId, date, studentId, from, to } = req.query as Record<string, string>
  const conditions: string[] = []
  const params: any[] = []

  if (batchId) { params.push(batchId); conditions.push(`a.batch_id = $${params.length}`) }
  if (date)    { params.push(date);    conditions.push(`a.date = $${params.length}`) }
  if (studentId) { params.push(studentId); conditions.push(`a.student_id = $${params.length}`) }
  if (from)    { params.push(from);    conditions.push(`a.date >= $${params.length}`) }
  if (to)      { params.push(to);      conditions.push(`a.date <= $${params.length}`) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(`
    SELECT a.*,
      json_build_object('id', s.id, 'name', s.name) AS students,
      json_build_object('id', b.id, 'name', b.name) AS batches
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    JOIN batches b ON b.id = a.batch_id
    ${where}
    ORDER BY a.date DESC, s.name
  `, params)
  return res.json(rows)
})

// ─── Bulk upsert attendance (coach marks attendance for a date) ───────────────
router.post('/attendance/bulk', async (req, res) => {
  const { records } = req.body as {
    records: Array<{ batch_id: string; level_id: string; student_id: string; date: string; status: string; marked_by?: string }>
  }
  try {
    for (const r of records) {
      await db.query(
        `INSERT INTO attendance (batch_id, level_id, student_id, date, status, marked_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (batch_id, student_id, date)
         DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
        [r.batch_id, r.level_id, r.student_id, r.date, r.status, r.marked_by || null]
      )
    }
    return res.json({ success: true })
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

// ─── Students in a batch (for attendance marking) ────────────────────────────
router.get('/attendance/students', async (req, res) => {
  const { batchId } = req.query as Record<string, string>
  if (!batchId) return res.status(400).json({ error: 'batchId required' })
  const { rows } = await db.query(`
    SELECT s.id, s.name, s.level_id,
      CASE WHEN l.id IS NOT NULL THEN json_build_object('id', l.id, 'name', l.name) ELSE NULL END AS levels
    FROM student_batches sb
    JOIN students s ON s.id = sb.student_id
    LEFT JOIN levels l ON l.id = s.level_id
    WHERE sb.batch_id = $1 AND s.is_active = true
    ORDER BY s.name
  `, [batchId])
  return res.json(rows)
})

// ─── Coach batches (with student count) ──────────────────────────────────────
router.get('/coach/batches', async (req, res) => {
  const coachId = req.user!.id
  const { rows } = await db.query(`
    SELECT b.*,
      (SELECT count(*) FROM student_batches sb WHERE sb.batch_id = b.id) AS student_count
    FROM coach_batches cb
    JOIN batches b ON b.id = cb.batch_id
    WHERE cb.coach_id = $1
    ORDER BY b.name
  `, [coachId])
  return res.json(rows)
})

export default router
