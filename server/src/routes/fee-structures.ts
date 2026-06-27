import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/fee-structures', async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM fee_structures ORDER BY days_per_week, amount`)
  return res.json(rows)
})

router.post('/fee-structures', async (req, res) => {
  const { name, days_per_week, amount } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO fee_structures (name, days_per_week, amount) VALUES ($1,$2,$3) RETURNING *`,
      [name, days_per_week, amount]
    )
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/fee-structures/:id', async (req, res) => {
  const { name, days_per_week, amount } = req.body
  try {
    await db.query(
      `UPDATE fee_structures SET name=$1, days_per_week=$2, amount=$3, updated_at=NOW() WHERE id=$4`,
      [name, days_per_week, amount, req.params.id]
    )
    const { rows } = await db.query(`SELECT * FROM fee_structures WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/fee-structures/:id', async (req, res) => {
  await db.query(`DELETE FROM fee_structures WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
