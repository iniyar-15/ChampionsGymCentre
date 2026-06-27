import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/apparatus', async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM apparatus ORDER BY name`)
  return res.json(rows)
})

router.post('/apparatus', async (req, res) => {
  const { name, gender } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO apparatus (name, gender) VALUES ($1,$2) RETURNING *`,
      [name, gender || 'mixed']
    )
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/apparatus/:id', async (req, res) => {
  const { name, gender } = req.body
  try {
    await db.query(
      `UPDATE apparatus SET name=$1, gender=$2, updated_at=NOW() WHERE id=$3`,
      [name, gender || 'mixed', req.params.id]
    )
    const { rows } = await db.query(`SELECT * FROM apparatus WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/apparatus/:id', async (req, res) => {
  await db.query(`DELETE FROM apparatus WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
