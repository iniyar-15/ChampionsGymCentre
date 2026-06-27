import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// ─── List all students ────────────────────────────────────────────────────────
router.get('/students', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT s.*,
      CASE WHEN l.id IS NOT NULL
        THEN json_build_object('id', l.id, 'name', l.name, 'start_age', l.start_age, 'end_age', l.end_age)
        ELSE NULL END AS levels,
      CASE WHEN fs.id IS NOT NULL
        THEN json_build_object('id', fs.id, 'name', fs.name, 'amount', fs.amount, 'days_per_week', fs.days_per_week)
        ELSE NULL END AS fee_structures,
      COALESCE(
        (SELECT json_agg(json_build_object(
            'batch_id', sb.batch_id,
            'enrolled_at', sb.enrolled_at,
            'batches', json_build_object('id', b.id, 'name', b.name, 'days', b.days,
              'start_time', b.start_time, 'end_time', b.end_time)
          ))
         FROM student_batches sb
         JOIN batches b ON b.id = sb.batch_id
         WHERE sb.student_id = s.id
        ), '[]'
      ) AS student_batches
    FROM students s
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN fee_structures fs ON fs.id = s.fee_structure_id
    ORDER BY s.name
  `)
  return res.json(rows)
})

// ─── Get single student ───────────────────────────────────────────────────────
router.get('/students/:id', async (req, res) => {
  const { rows } = await db.query(`
    SELECT s.*,
      CASE WHEN l.id IS NOT NULL
        THEN json_build_object('id', l.id, 'name', l.name)
        ELSE NULL END AS levels
    FROM students s
    LEFT JOIN levels l ON l.id = s.level_id
    WHERE s.id = $1
  `, [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Student not found' })
  return res.json(rows[0])
})

// ─── Create student ───────────────────────────────────────────────────────────
router.post('/students', async (req, res) => {
  const { name, parent_name, contact_phone, secondary_phone, email,
          date_of_birth, gender, school, level_id, fee_structure_id,
          is_active, batch_ids, password } = req.body
  const hash = await bcrypt.hash(password || contact_phone.replace(/\D/g, ''), 10)
  try {
    const { rows } = await db.query(
      `INSERT INTO students (name, parent_name, contact_phone, secondary_phone, email,
        date_of_birth, gender, school, level_id, fee_structure_id, is_active, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, parent_name || null, contact_phone, secondary_phone || null, email || null,
       date_of_birth, gender || null, school || null, level_id || null,
       fee_structure_id || null, is_active !== false, hash]
    )
    const student = rows[0]
    if (batch_ids?.length) {
      for (const bid of batch_ids) {
        await db.query(
          `INSERT INTO student_batches (student_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [student.id, bid]
        )
      }
    }
    return res.json(student)
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Update student ───────────────────────────────────────────────────────────
router.put('/students/:id', async (req, res) => {
  const { name, parent_name, contact_phone, secondary_phone, email,
          date_of_birth, gender, school, level_id, fee_structure_id,
          is_active, batch_ids } = req.body
  try {
    await db.query(
      `UPDATE students SET name=$1, parent_name=$2, contact_phone=$3, secondary_phone=$4, email=$5,
        date_of_birth=$6, gender=$7, school=$8, level_id=$9, fee_structure_id=$10,
        is_active=$11, updated_at=NOW() WHERE id=$12`,
      [name, parent_name || null, contact_phone, secondary_phone || null, email || null,
       date_of_birth, gender || null, school || null, level_id || null,
       fee_structure_id || null, is_active !== false, req.params.id]
    )
    if (batch_ids !== undefined) {
      await db.query(`DELETE FROM student_batches WHERE student_id = $1`, [req.params.id])
      for (const bid of (batch_ids || [])) {
        await db.query(
          `INSERT INTO student_batches (student_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, bid]
        )
      }
    }
    const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Delete student ───────────────────────────────────────────────────────────
router.delete('/students/:id', async (req, res) => {
  await db.query(`DELETE FROM students WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
