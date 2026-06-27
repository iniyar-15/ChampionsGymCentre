import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { startOfMonth, getDaysInMonth, differenceInDays, addDays } from 'date-fns'

const router = Router()
router.use(requireAuth)

// ─── Admin / Manager: counts ──────────────────────────────────────────────────
router.get('/dashboard/stats', async (_req, res) => {
  const [students, staff, batches, competitions, recentStudents] = await Promise.all([
    db.query(`SELECT count(*) FROM students WHERE is_active = true`),
    db.query(`SELECT count(*) FROM users`),
    db.query(`SELECT count(*) FROM batches`),
    db.query(`SELECT count(*) FROM competitions`),
    db.query(`SELECT id, name, date_of_birth, gender, created_at FROM students ORDER BY created_at DESC LIMIT 5`),
  ])
  return res.json({
    activeStudents: parseInt(students.rows[0].count),
    staffUsers: parseInt(staff.rows[0].count),
    batches: parseInt(batches.rows[0].count),
    competitions: parseInt(competitions.rows[0].count),
    recentStudents: recentStudents.rows,
  })
})

// ─── Fee metrics (prorated expected revenue) ──────────────────────────────────
router.get('/dashboard/fee-metrics', async (_req, res) => {
  const now = new Date()
  const thisMonthStart = startOfMonth(now).toISOString().split('T')[0]
  const nextMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const daysInMonth = getDaysInMonth(now)

  // Students enrolled this month and their fee structures
  const { rows: enrolled } = await db.query(`
    SELECT s.id, s.created_at, fs.amount
    FROM students s
    LEFT JOIN fee_structures fs ON fs.id = s.fee_structure_id
    WHERE s.is_active = true
  `)

  let expectedRevenue = 0
  for (const s of enrolled) {
    const amount = parseFloat(s.amount) || 0
    const joinedAt = new Date(s.created_at)
    const joinedThisMonth = joinedAt >= new Date(thisMonthStart)
    if (joinedThisMonth && joinedAt.getDate() > 1) {
      const remaining = daysInMonth - joinedAt.getDate() + 1
      expectedRevenue += Math.round((amount / daysInMonth) * remaining)
    } else {
      expectedRevenue += amount
    }
  }

  const { rows: collected } = await db.query(`
    SELECT COALESCE(SUM(paid_amount), 0) AS total
    FROM fee_collections
    WHERE month >= $1 AND month < $2
  `, [thisMonthStart, nextMonthStart])

  const feesCollected = parseFloat(collected[0]?.total || '0')
  const pending = Math.max(0, expectedRevenue - feesCollected)

  return res.json({ expectedRevenue, feesCollected, pending })
})

// ─── Manager dashboard ────────────────────────────────────────────────────────
router.get('/dashboard/manager', async (_req, res) => {
  const now = new Date()
  const thisMonthStart = startOfMonth(now).toISOString().split('T')[0]
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().split('T')[0]
  const nextMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]

  const [unpaid, lowAttendance, overAttending, thisMonthEnroll, lastMonthEnroll, competitions] = await Promise.all([
    // Unpaid students this month
    db.query(`
      SELECT DISTINCT s.id, s.name, s.contact_phone,
        COALESCE(l.name, '—') AS level,
        COALESCE(SUM(fc.paid_amount), 0) AS paid,
        COALESCE(MAX(fs.amount), 0) AS expected
      FROM students s
      LEFT JOIN levels l ON l.id = s.level_id
      LEFT JOIN fee_structures fs ON fs.id = s.fee_structure_id
      LEFT JOIN fee_collections fc ON fc.student_id = s.id
        AND fc.month >= $1 AND fc.month < $2
      WHERE s.is_active = true AND fs.amount IS NOT NULL
      GROUP BY s.id, s.name, s.contact_phone, l.name
      HAVING COALESCE(SUM(fc.paid_amount), 0) < COALESCE(MAX(fs.amount), 0)
      ORDER BY s.name
    `, [thisMonthStart, nextMonthStart]),

    // Low attendance (< 50% this month)
    db.query(`
      SELECT s.id, s.name,
        COUNT(a.id) FILTER (WHERE a.status = 'present') AS present_count,
        COUNT(a.id) AS total_count
      FROM students s
      JOIN attendance a ON a.student_id = s.id
        AND a.date >= $1 AND a.date < $2
      WHERE s.is_active = true
      GROUP BY s.id, s.name
      HAVING COUNT(a.id) > 0
        AND (COUNT(a.id) FILTER (WHERE a.status = 'present'))::decimal / COUNT(a.id) < 0.5
      ORDER BY s.name
    `, [thisMonthStart, nextMonthStart]),

    // Over-attending students
    db.query(`
      SELECT s.id, s.name,
        COUNT(a.id) FILTER (WHERE a.status = 'present') AS present_count,
        (
          SELECT COUNT(*) * (SELECT count(DISTINCT days_elem)
            FROM batches sb2, unnest(sb2.days) AS days_elem
            WHERE sb2.id IN (SELECT batch_id FROM student_batches WHERE student_id = s.id)
          ) / NULLIF((SELECT count(*) FROM student_batches WHERE student_id = s.id), 0)
          FROM generate_series($1::date, $2::date - interval '1 day', '1 day') AS d
          WHERE extract(isodow from d) BETWEEN 1 AND 7
        ) AS expected_days
      FROM students s
      JOIN attendance a ON a.student_id = s.id AND a.date >= $1 AND a.date < $2
      WHERE s.is_active = true
      GROUP BY s.id, s.name
      HAVING COUNT(a.id) FILTER (WHERE a.status = 'present') > 0
      ORDER BY s.name
    `, [thisMonthStart, nextMonthStart]),

    // New enrollments this month
    db.query(`
      SELECT id, name, contact_phone, created_at,
        COALESCE((SELECT name FROM levels WHERE id = students.level_id), '—') AS level
      FROM students WHERE created_at >= $1 ORDER BY created_at DESC
    `, [thisMonthStart]),

    // New enrollments last month
    db.query(`
      SELECT id, name, contact_phone, created_at,
        COALESCE((SELECT name FROM levels WHERE id = students.level_id), '—') AS level
      FROM students WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC
    `, [lastMonthStart, thisMonthStart]),

    // Upcoming competitions with student counts
    db.query(`
      SELECT c.*,
        (
          SELECT count(DISTINCT cs.student_id)
          FROM competition_age_groups cag
          JOIN competition_shortlist cs ON cs.age_group_id = cag.id
            AND cs.status != 'removed'
          WHERE cag.competition_id = c.id
        ) AS student_count
      FROM competitions c
      WHERE c.end_date >= CURRENT_DATE OR c.end_date IS NULL
      ORDER BY c.start_date
      LIMIT 10
    `),
  ])

  return res.json({
    unpaidStudents: unpaid.rows,
    lowAttendance: lowAttendance.rows,
    overAttending: overAttending.rows,
    thisMonthEnrollments: thisMonthEnroll.rows,
    lastMonthEnrollments: lastMonthEnroll.rows,
    upcomingCompetitions: competitions.rows,
  })
})

// ─── Coach dashboard ──────────────────────────────────────────────────────────
router.get('/dashboard/coach', async (req, res) => {
  const coachId = req.user!.id
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const thisMonthStart = startOfMonth(now).toISOString().split('T')[0]
  const nextMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]

  const [batches, todayAttendance, monthAttendance] = await Promise.all([
    db.query(`
      SELECT b.*,
        (SELECT count(*) FROM student_batches sb WHERE sb.batch_id = b.id) AS student_count
      FROM coach_batches cb JOIN batches b ON b.id = cb.batch_id
      WHERE cb.coach_id = $1 ORDER BY b.name
    `, [coachId]),
    db.query(`
      SELECT count(*) FILTER (WHERE a.status = 'present') AS present,
             count(*) AS total
      FROM attendance a
      JOIN coach_batches cb ON cb.batch_id = a.batch_id AND cb.coach_id = $1
      WHERE a.date = $2
    `, [coachId, today]),
    db.query(`
      SELECT count(*) FILTER (WHERE a.status = 'present') AS present,
             count(*) AS total
      FROM attendance a
      JOIN coach_batches cb ON cb.batch_id = a.batch_id AND cb.coach_id = $1
      WHERE a.date >= $2 AND a.date < $3
    `, [coachId, thisMonthStart, nextMonthStart]),
  ])

  return res.json({
    batches: batches.rows,
    todayStats: todayAttendance.rows[0],
    monthStats: monthAttendance.rows[0],
  })
})

// ─── Student: own profile ─────────────────────────────────────────────────────
router.get('/student/profile', async (req, res) => {
  const studentId = req.query.studentId as string || req.user!.id
  const { rows } = await db.query(`
    SELECT s.*,
      CASE WHEN l.id IS NOT NULL THEN json_build_object('id', l.id, 'name', l.name) ELSE NULL END AS levels,
      CASE WHEN fs.id IS NOT NULL THEN json_build_object('id', fs.id, 'name', fs.name, 'amount', fs.amount, 'days_per_week', fs.days_per_week) ELSE NULL END AS fee_structures
    FROM students s
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN fee_structures fs ON fs.id = s.fee_structure_id
    WHERE s.id = $1
  `, [studentId])
  return res.json(rows[0] || null)
})

// ─── Student: enrolled batches ────────────────────────────────────────────────
router.get('/student/batches', async (req, res) => {
  const studentId = req.query.studentId as string || req.user!.id
  const { rows } = await db.query(`
    SELECT b.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', u.id, 'user_name', u.user_name))
         FROM coach_batches cb JOIN users u ON u.id = cb.coach_id
         WHERE cb.batch_id = b.id), '[]'
      ) AS coaches
    FROM student_batches sb
    JOIN batches b ON b.id = sb.batch_id
    WHERE sb.student_id = $1
    ORDER BY b.name
  `, [studentId])
  return res.json(rows)
})

// ─── Related students for a phone-based auth account ─────────────────────────
router.get('/student/related', async (req, res) => {
  const { phone } = req.query as Record<string, string>
  if (!phone) return res.status(400).json({ error: 'phone required' })
  const normalised = phone.replace(/\D/g, '')
  const { rows } = await db.query(
    `SELECT * FROM students WHERE contact_phone ~ $1 AND is_active = true ORDER BY name`,
    [normalised]
  )
  return res.json(rows)
})

export default router
