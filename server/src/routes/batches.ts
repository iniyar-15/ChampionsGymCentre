import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/batches', async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM batches ORDER BY name`)
  return res.json(rows)
})

router.post('/batches', async (req, res) => {
  const { name, days, start_time, end_time, start_date, end_date } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO batches (name, days, start_time, end_time, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, days, start_time, end_time, start_date || null, end_date || null]
    )
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.put('/batches/:id', async (req, res) => {
  const { name, days, start_time, end_time, start_date, end_date } = req.body
  try {
    await db.query(
      `UPDATE batches SET name=$1, days=$2, start_time=$3, end_time=$4, start_date=$5, end_date=$6, updated_at=NOW()
       WHERE id=$7`,
      [name, days, start_time, end_time, start_date || null, end_date || null, req.params.id]
    )
    const { rows } = await db.query(`SELECT * FROM batches WHERE id = $1`, [req.params.id])
    return res.json(rows[0])
  } catch (e: any) { return res.status(400).json({ error: e.message }) }
})

router.delete('/batches/:id', async (req, res) => {
  await db.query(`DELETE FROM batches WHERE id = $1`, [req.params.id])
  return res.json({ success: true })
})

export default router
