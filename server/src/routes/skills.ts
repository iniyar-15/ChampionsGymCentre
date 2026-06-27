import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/skills', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT s.*,
      CASE WHEN a.id IS NOT NULL
        THEN json_build_object('id', a.id, 'name', a.name, 'gender', a.gender)
        ELSE NULL END AS apparatus
    FROM skills s
    LEFT JOIN apparatus a ON a.id = s.apparatus_id
    ORDER BY a.name, s.name
  `)
  return res.json(rows)
})

router.post('/skills', async (req, res) => {
  const { name, apparatus_id, category, description, value } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO skills (name, apparatus_id, category, description, value)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, apparatus_id || null, category || null, description || null, value || null]
    )
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/skills/:id', async (req, res) => {
  const { name, apparatus_id, category, description, value } = req.body
  try {
    await db.query(
      `UPDATE skills SET name=$1, apparatus_id=$2, category=$3, description=$4, value=$5, updated_at=NOW()
       WHERE id=$6`,
      [name, apparatus_id || null, category || null, description || null, value || null, req.params.id]
    )
    const { rows } = await db.query(`SELECT * FROM skills WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/skills/:id', async (req, res) => {
  await db.query(`DELETE FROM skills WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
