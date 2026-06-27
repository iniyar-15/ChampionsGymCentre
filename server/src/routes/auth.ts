import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  const { email, password, phone } = req.body

  // Staff login via email
  if (email) {
    const { rows } = await db.query(
      `SELECT id, user_name, role, password_hash FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()]
    )
    const user = rows[0]
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = signToken({ id: user.id, role: user.role, type: 'staff', name: user.user_name })
    return res.json({ token, user: { id: user.id, role: user.role, type: 'staff', name: user.user_name } })
  }

  // Student login via phone
  if (phone) {
    const normalised = phone.replace(/\D/g, '')
    const { rows } = await db.query(
      `SELECT id, name, password_hash FROM students WHERE contact_phone ~ $1 AND is_active = true LIMIT 1`,
      [normalised]
    )
    const student = rows[0]
    if (!student || !await bcrypt.compare(password, student.password_hash)) {
      return res.status(401).json({ error: 'Invalid phone or password' })
    }
    const token = signToken({ id: student.id, role: 'student', type: 'student', name: student.name })
    return res.json({ token, user: { id: student.id, role: 'student', type: 'student', name: student.name } })
  }

  return res.status(400).json({ error: 'email or phone required' })
})

// ─── Create staff user ────────────────────────────────────────────────────────
router.post('/auth/create-user', async (req, res) => {
  const { email, password, userData } = req.body
  const hash = await bcrypt.hash(password, 10)
  try {
    const { rows } = await db.query(
      `INSERT INTO users (user_name, role, phone, email, date_of_birth, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_name, role, email`,
      [userData.user_name, userData.role, userData.phone || null,
       email?.toLowerCase().trim() || null, userData.date_of_birth || null, hash]
    )
    return res.json({ user: rows[0] })
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Create student ───────────────────────────────────────────────────────────
router.post('/auth/create-student', async (req, res) => {
  const { phone, password, studentData } = req.body
  const hash = await bcrypt.hash(password || phone.replace(/\D/g, ''), 10)
  try {
    const { rows } = await db.query(
      `INSERT INTO students (name, parent_name, contact_phone, secondary_phone, email,
        date_of_birth, gender, school, level_id, fee_structure_id, is_active, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [studentData.name, studentData.parent_name || null, studentData.contact_phone,
       studentData.secondary_phone || null, studentData.email || null,
       studentData.date_of_birth, studentData.gender || null, studentData.school || null,
       studentData.level_id || null, studentData.fee_structure_id || null,
       studentData.is_active !== false, hash]
    )
    const student = rows[0]

    // Enroll in batches
    if (studentData.batch_ids?.length) {
      for (const bid of studentData.batch_ids) {
        await db.query(
          `INSERT INTO student_batches (student_id, batch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [student.id, bid]
        )
      }
    }

    // Welcome email
    if (student.email) {
      let levelName: string | null = null
      if (student.level_id) {
        const { rows: lr } = await db.query(`SELECT name FROM levels WHERE id = $1`, [student.level_id])
        levelName = lr[0]?.name || null
      }
      const { sendWelcomeEmail } = await import('../services/email.js')
      sendWelcomeEmail({ to: student.email, studentName: student.name,
        parentName: student.parent_name, loginPhone: phone, password, levelName })
        .catch(e => console.error('[WELCOME EMAIL]', e.message))
    }

    return res.json({ student })
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
})

// ─── Delete user (staff or student) ──────────────────────────────────────────
router.delete('/auth/delete-user/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  await db.query(`DELETE FROM users WHERE id = $1`, [id])
  return res.json({ success: true })
})

// ─── Change password ──────────────────────────────────────────────────────────
router.post('/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const user = req.user!
  const table = user.type === 'staff' ? 'users' : 'students'
  const { rows } = await db.query(`SELECT password_hash FROM ${table} WHERE id = $1`, [user.id])
  if (!rows[0] || !await bcrypt.compare(currentPassword, rows[0].password_hash)) {
    return res.status(401).json({ error: 'Current password incorrect' })
  }
  const hash = await bcrypt.hash(newPassword, 10)
  await db.query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [hash, user.id])
  return res.json({ success: true })
})

// ─── Reset a user's password (admin only) ────────────────────────────────────
router.post('/auth/reset-password', requireAuth, async (req, res) => {
  const { userId, newPassword, userType } = req.body
  const hash = await bcrypt.hash(newPassword, 10)
  const table = userType === 'student' ? 'students' : 'users'
  await db.query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [hash, userId])
  return res.json({ success: true })
})

// ─── Get current user profile ─────────────────────────────────────────────────
router.get('/auth/me', requireAuth, async (req, res) => {
  const user = req.user!
  if (user.type === 'staff') {
    const { rows } = await db.query(`SELECT id, user_name, role, phone, email FROM users WHERE id = $1`, [user.id])
    return res.json(rows[0] || null)
  } else {
    const { rows } = await db.query(`SELECT * FROM students WHERE id = $1`, [user.id])
    return res.json(rows[0] || null)
  }
})

export default router
