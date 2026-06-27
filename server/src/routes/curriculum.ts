import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/curriculum', async (req, res) => {
  const { batchId, levelId, date, from, to } = req.query as Record<string, string>
  const conditions: string[] = []
  const params: any[] = []

  if (batchId) { params.push(batchId); conditions.push(`c.batch_id = $${params.length}`) }
  if (levelId) { params.push(levelId); conditions.push(`c.level_id = $${params.length}`) }
  if (date)    { params.push(date);    conditions.push(`c.date = $${params.length}`) }
  if (from)    { params.push(from);    conditions.push(`c.date >= $${params.length}`) }
  if (to)      { params.push(to);      conditions.push(`c.date <= $${params.length}`) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(`
    SELECT c.*,
      json_build_object('id', a.id, 'name', a.name) AS apparatus,
      json_build_object('id', b.id, 'name', b.name) AS batches,
      json_build_object('id', l.id, 'name', l.name) AS levels,
      COALESCE(
        (SELECT json_agg(json_build_object('skill_id', cs.skill_id,
            'skills', json_build_object('id', sk.id, 'name', sk.name, 'category', sk.category)))
         FROM curriculum_skills cs JOIN skills sk ON sk.id = cs.skill_id
         WHERE cs.curriculum_id = c.id), '[]'
      ) AS curriculum_skills
    FROM curriculum c
    JOIN apparatus a ON a.id = c.apparatus_id
    JOIN batches b ON b.id = c.batch_id
    JOIN levels l ON l.id = c.level_id
    ${where}
    ORDER BY c.date DESC
  `, params)
  return res.json(rows)
})

router.post('/curriculum', async (req, res) => {
  const { batch_id, level_id, date, apparatus_id, coach_id, notes, skill_ids } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO curriculum (batch_id, level_id, date, apparatus_id, coach_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [batch_id, level_id, date, apparatus_id, coach_id || null, notes || null]
    )
    const curr = rows[0]
    if (skill_ids?.length) {
      for (const sid of skill_ids) {
        await db.query(
          `INSERT INTO curriculum_skills VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [curr.id, sid]
        )
      }
    }
    return res.json(curr)
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/curriculum/:id', async (req, res) => {
  const { batch_id, level_id, date, apparatus_id, coach_id, notes, skill_ids } = req.body
  try {
    await db.query(
      `UPDATE curriculum SET batch_id=$1, level_id=$2, date=$3, apparatus_id=$4, coach_id=$5, notes=$6
       WHERE id=$7`,
      [batch_id, level_id, date, apparatus_id, coach_id || null, notes || null, req.params.id]
    )
    if (skill_ids !== undefined) {
      await db.query(`DELETE FROM curriculum_skills WHERE curriculum_id = $1`, [req.params.id])
      for (const sid of skill_ids || []) {
        await db.query(`INSERT INTO curriculum_skills VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, sid])
      }
    }
    const { rows } = await db.query(`SELECT * FROM curriculum WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/curriculum/:id', async (req, res) => {
  await db.query(`DELETE FROM curriculum WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
