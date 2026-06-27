import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/levels', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT l.*,
      COALESCE(
        (SELECT json_agg(json_build_object('apparatus_id', la.apparatus_id,
            'apparatus', json_build_object('id', a.id, 'name', a.name, 'gender', a.gender)))
         FROM level_apparatus la JOIN apparatus a ON a.id = la.apparatus_id
         WHERE la.level_id = l.id), '[]'
      ) AS level_apparatus,
      COALESCE(
        (SELECT json_agg(json_build_object('skill_id', ls.skill_id,
            'skills', json_build_object('id', sk.id, 'name', sk.name, 'category', sk.category)))
         FROM level_skills ls JOIN skills sk ON sk.id = ls.skill_id
         WHERE ls.level_id = l.id), '[]'
      ) AS level_skills
    FROM levels l ORDER BY l.name
  `)
  return res.json(rows)
})

router.post('/levels', async (req, res) => {
  const { name, start_age, end_age, apparatus_ids, skill_ids } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO levels (name, start_age, end_age) VALUES ($1,$2,$3) RETURNING *`,
      [name, start_age || null, end_age || null]
    )
    const level = rows[0]
    await syncLevelRelations(level.id, apparatus_ids, skill_ids)
    return res.json(level)
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/levels/:id', async (req, res) => {
  const { name, start_age, end_age, apparatus_ids, skill_ids } = req.body
  try {
    await db.query(
      `UPDATE levels SET name=$1, start_age=$2, end_age=$3, updated_at=NOW() WHERE id=$4`,
      [name, start_age || null, end_age || null, req.params.id]
    )
    await syncLevelRelations(req.params.id, apparatus_ids, skill_ids)
    const { rows } = await db.query(`SELECT * FROM levels WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/levels/:id', async (req, res) => {
  await db.query(`DELETE FROM levels WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

async function syncLevelRelations(levelId: string, apparatusIds?: string[], skillIds?: string[]) {
  if (apparatusIds !== undefined) {
    await db.query(`DELETE FROM level_apparatus WHERE level_id = $1`, [levelId])
    for (const aid of apparatusIds || []) {
      await db.query(`INSERT INTO level_apparatus VALUES ($1,$2) ON CONFLICT DO NOTHING`, [levelId, aid])
    }
  }
  if (skillIds !== undefined) {
    await db.query(`DELETE FROM level_skills WHERE level_id = $1`, [levelId])
    for (const sid of skillIds || []) {
      await db.query(`INSERT INTO level_skills VALUES ($1,$2) ON CONFLICT DO NOTHING`, [levelId, sid])
    }
  }
}

export default router
