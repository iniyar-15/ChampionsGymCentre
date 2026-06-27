import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/feedback', async (req, res) => {
  const { studentId, month, coachId } = req.query as Record<string, string>
  const conditions: string[] = []
  const params: any[] = []

  if (studentId) { params.push(studentId); conditions.push(`f.student_id = $${params.length}`) }
  if (month)     { params.push(month + '-01'); conditions.push(`f.month = $${params.length}`) }
  if (coachId)   { params.push(coachId);  conditions.push(`f.coach_id = $${params.length}`) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(`
    SELECT f.*,
      json_build_object('id', s.id, 'name', s.name) AS students,
      json_build_object('id', a.id, 'name', a.name) AS apparatus,
      CASE WHEN sk.id IS NOT NULL THEN json_build_object('id', sk.id, 'name', sk.name) ELSE NULL END AS skills
    FROM feedback f
    JOIN students s ON s.id = f.student_id
    JOIN apparatus a ON a.id = f.apparatus_id
    LEFT JOIN skills sk ON sk.id = f.skill_id
    ${where}
    ORDER BY f.created_at DESC
  `, params)
  return res.json(rows)
})

router.post('/feedback', async (req, res) => {
  const { student_id, month, apparatus_id, skill_id, feedback_text, coach_id } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO feedback (student_id, month, apparatus_id, skill_id, feedback_text, coach_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (student_id, month, apparatus_id)
       DO UPDATE SET feedback_text = EXCLUDED.feedback_text, skill_id = EXCLUDED.skill_id,
         coach_id = EXCLUDED.coach_id, updated_at = NOW()
       RETURNING *`,
      [student_id, month + '-01', apparatus_id, skill_id || null, feedback_text || null, coach_id || null]
    )
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/feedback/:id', async (req, res) => {
  const { feedback_text, skill_id } = req.body
  try {
    await db.query(
      `UPDATE feedback SET feedback_text=$1, skill_id=$2, updated_at=NOW() WHERE id=$3`,
      [feedback_text || null, skill_id || null, req.params.id]
    )
    const { rows } = await db.query(`SELECT * FROM feedback WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/feedback/:id', async (req, res) => {
  await db.query(`DELETE FROM feedback WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
