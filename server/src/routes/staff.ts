import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// ─── List staff ───────────────────────────────────────────────────────────────
router.get('/staff', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.user_name, u.role, u.phone, u.email, u.date_of_birth, u.created_at,
      COALESCE(
        (SELECT json_agg(json_build_object('batch_id', cb.batch_id, 'batches', json_build_object('id', b.id, 'name', b.name)))
         FROM coach_batches cb JOIN batches b ON b.id = cb.batch_id
         WHERE cb.coach_id = u.id), '[]'
      ) AS coach_batches,
      COALESCE(
        (SELECT json_agg(json_build_object('level_id', cl.level_id, 'levels', json_build_object('id', l.id, 'name', l.name)))
         FROM coach_levels cl JOIN levels l ON l.id = cl.level_id
         WHERE cl.coach_id = u.id), '[]'
      ) AS coach_levels
    FROM users u
    ORDER BY u.user_name
  `)
  return res.json(rows)
})

// ─── Get single staff member ──────────────────────────────────────────────────
router.get('/staff/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, user_name, role, phone, email, date_of_birth, created_at FROM users WHERE id = $1`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'User not found' })
  return res.json(rows[0])
})

// ─── Create staff ─────────────────────────────────────────────────────────────
router.post('/staff', async (req, res) => {
  const { user_name, role, phone, email, date_of_birth, password, batch_ids, level_ids } = req.body
  const hash = await bcrypt.hash(password || phone?.replace(/\D/g, '') || 'Champions2024!', 10)
  try {
    const { rows } = await db.query(
      `INSERT INTO users (user_name, role, phone, email, date_of_birth, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, user_name, role, phone, email`,
      [user_name, role, phone || null, email?.toLowerCase().trim() || null, date_of_birth || null, hash]
    )
    const user = rows[0]
    await syncCoachAssignments(user.id, batch_ids, level_ids)
    return res.json(user)
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Update staff ─────────────────────────────────────────────────────────────
router.put('/staff/:id', async (req, res) => {
  const { user_name, role, phone, email, date_of_birth, batch_ids, level_ids } = req.body
  try {
    await db.query(
      `UPDATE users SET user_name=$1, role=$2, phone=$3, email=$4, date_of_birth=$5, updated_at=NOW()
       WHERE id=$6`,
      [user_name, role, phone || null, email?.toLowerCase().trim() || null, date_of_birth || null, req.params.id]
    )
    await syncCoachAssignments(req.params.id, batch_ids, level_ids)
    const { rows } = await db.query(
      `SELECT id, user_name, role, phone, email, date_of_birth FROM users WHERE id = $1`, [req.params.id]
    )
    return res.json(rows[0])
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Delete staff ─────────────────────────────────────────────────────────────
router.delete('/staff/:id', async (req, res) => {
  await db.query(`DELETE FROM users WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

async function syncCoachAssignments(coachId: string, batchIds?: string[], levelIds?: string[]) {
  if (batchIds !== undefined) {
    await db.query(`DELETE FROM coach_batches WHERE coach_id = $1`, [coachId])
    for (const bid of batchIds || []) {
      await db.query(`INSERT INTO coach_batches VALUES ($1,$2) ON CONFLICT DO NOTHING`, [coachId, bid])
    }
  }
  if (levelIds !== undefined) {
    await db.query(`DELETE FROM coach_levels WHERE coach_id = $1`, [coachId])
    for (const lid of levelIds || []) {
      await db.query(`INSERT INTO coach_levels VALUES ($1,$2) ON CONFLICT DO NOTHING`, [coachId, lid])
    }
  }
}

export default router
