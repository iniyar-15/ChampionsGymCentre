import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE = 'http://localhost:5173'
const API = 'http://localhost:3001'
const OUT_DIR = 'demo-video'

const DEMO = {
  adminEmail: 'demo.admin@cgc.internal',
  adminPass: 'Demo@1234',
  coachEmail: 'demo.coach@cgc.internal',
  coachPass: 'Demo@1234',
  arjunPhone: '9000000001',
  arjunPass: '20170115',
  priyaPhone: '9000000002',
  priyaPass: '20160412',
}

const COMP_NAME = 'Chennai Open Gymnastics Championship 2026'

// ─── Timeline tracking (used later to sync voiceover) ─────────────────────────
const timeline = []
function mark(name) {
  const t = Date.now()
  console.log(`[SCENE] ${name} @ ${t}`)
  timeline.push({ scene: name, t })
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function modal(page) { return page.locator('.fixed.inset-0.z-50') }
function field(scope, label) { return scope.locator('div.space-y-1').filter({ hasText: label }) }
function pause(page, ms) { return page.waitForTimeout(ms) }

async function staffLogin(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await pause(page, 300)
  await page.locator('input[type="password"]').fill(password)
  await pause(page, 300)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await pause(page, 1000)
}

async function studentLogin(page, phone, password) {
  await page.goto(`${BASE}/login/student`)
  await page.locator('input[type="tel"]').fill(phone)
  await pause(page, 300)
  await page.locator('input[type="password"]').fill(password)
  await pause(page, 300)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await pause(page, 1000)
}

async function signOut(page) {
  await page.locator('aside').getByRole('button', { name: 'Sign Out' }).click()
  await page.waitForURL(u => u.pathname.includes('/login'), { timeout: 15000 })
  await pause(page, 500)
}

async function runScene(name, fn, page) {
  mark(name)
  try {
    await fn(page)
  } catch (e) {
    console.error(`[SCENE ERROR] ${name}:`, e.message)
    try {
      await page.screenshot({ path: path.join(OUT_DIR, `error-${name}.png`) })
    } catch {}
  }
}

// ─── Scenes ─────────────────────────────────────────────────────────────────

async function sceneIntro(page) {
  await page.goto(`${BASE}/login`)
  await pause(page, 2500)
}

async function sceneAdminLogin(page) {
  await page.locator('input[type="email"]').fill(DEMO.adminEmail)
  await pause(page, 400)
  await page.locator('input[type="password"]').fill(DEMO.adminPass)
  await pause(page, 400)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await pause(page, 1800)
}

async function sceneAdminDashboard(page) {
  await pause(page, 2000)
  await page.mouse.wheel(0, 350)
  await pause(page, 1500)
  await page.mouse.wheel(0, -350)
  await pause(page, 500)
}

async function sceneAdminUsersTour(page) {
  await page.goto(`${BASE}/admin/users`)
  await pause(page, 1500)
  await page.getByRole('button', { name: 'Add User' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 800)
  await field(m, 'Role').locator('select').selectOption({ label: 'Coach' })
  await pause(page, 1200)
  await m.getByRole('button', { name: 'Cancel' }).click()
  await pause(page, 500)
}

async function sceneAdminFeeStructuresTour(page) {
  await page.goto(`${BASE}/admin/fee-structures`)
  await pause(page, 2200)
}

async function sceneAdminBatchesTour(page) {
  await page.goto(`${BASE}/admin/batches`)
  await pause(page, 1500)
  await page.getByRole('button', { name: 'Add Batch' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 800)
  const dayButtons = field(m, 'Days').locator('button')
  await dayButtons.nth(0).click()
  await pause(page, 300)
  await dayButtons.nth(2).click()
  await pause(page, 800)
  await m.getByRole('button', { name: 'Cancel' }).click()
  await pause(page, 500)
}

async function sceneAdminApparatusTour(page) {
  await page.goto(`${BASE}/admin/apparatus`)
  await pause(page, 2200)
}

async function sceneAdminSkillsTour(page) {
  await page.goto(`${BASE}/admin/skills`)
  await pause(page, 2200)
}

async function sceneRegisterStudent(page) {
  await page.goto(`${BASE}/admin/students`)
  await pause(page, 1200)
  await page.getByRole('button', { name: 'Add Student' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 500)

  await field(m, 'Student Name').locator('input').fill('Priya Demo')
  await pause(page, 250)
  await field(m, 'Parent / Guardian Name').locator('input').fill('Demo Parent B')
  await pause(page, 250)
  await field(m, 'Contact Phone').locator('input').fill(DEMO.priyaPhone)
  await pause(page, 250)
  await field(m, 'Email Address').locator('input').fill('priya.demo@cgc.internal')
  await pause(page, 250)
  await field(m, 'Date of Birth').locator('input').fill('2016-04-12')
  await pause(page, 250)
  await field(m, 'Gender').locator('select').selectOption('female')
  await pause(page, 250)
  await field(m, 'Level').locator('select').selectOption({ label: 'Demo Level' })
  await pause(page, 400)
  await field(m, 'Enroll in Batches').locator('label').filter({ hasText: 'Demo Batch' }).locator('input[type="checkbox"]').check()
  await pause(page, 600)

  await m.getByRole('button', { name: 'Enroll Student' }).click()
  await m.waitFor({ state: 'hidden', timeout: 15000 })
  await pause(page, 1200)
}

async function sceneWelcomeEmail(page) {
  await page.goto(`${API}/email-previews/welcome.html`)
  await pause(page, 4000)
  await page.goBack()
  await page.waitForLoadState()
  await pause(page, 1000)
}

async function sceneSwitchToCoach(page) {
  await signOut(page)
  await pause(page, 500)
  await staffLogin(page, DEMO.coachEmail, DEMO.coachPass)
}

async function sceneCoachAttendance(page) {
  await page.goto(`${BASE}/coach/attendance`)
  await pause(page, 1000)
  await field(page, 'Batch').locator('select').selectOption({ index: 1 })
  await pause(page, 600)
  await field(page, 'Level').locator('select').selectOption({ index: 1 })
  await pause(page, 1200)
  await page.getByRole('button', { name: 'Mark All Present' }).click()
  await pause(page, 1200)
  await page.getByRole('button', { name: 'Save Attendance' }).click()
  await pause(page, 1800)
}

async function sceneCoachCurriculum(page) {
  await page.goto(`${BASE}/coach/curriculum`)
  await pause(page, 1000)
  await field(page, 'Batch').locator('select').selectOption({ index: 1 })
  await pause(page, 500)
  await field(page, 'Level').locator('select').selectOption({ index: 1 })
  await pause(page, 800)
  await field(page, 'Apparatus').locator('select').selectOption({ index: 1 })
  await pause(page, 1200)

  const skillChecks = page.locator('label').filter({ has: page.locator('input[type="checkbox"]') })
  const count = await skillChecks.count()
  if (count > 0) { await skillChecks.nth(0).locator('input[type="checkbox"]').check(); await pause(page, 300) }
  if (count > 1) { await skillChecks.nth(1).locator('input[type="checkbox"]').check(); await pause(page, 300) }

  await pause(page, 600)
  await field(page, 'Notes (optional)').locator('textarea').fill('Great progress on form and landings today!')
  await pause(page, 1000)
  await page.getByRole('button', { name: 'Save Curriculum' }).click()
  await pause(page, 1800)
}

async function sceneSwitchToAdmin2(page) {
  await signOut(page)
  await pause(page, 500)
  await staffLogin(page, DEMO.adminEmail, DEMO.adminPass)
}

async function sceneCreateCompetition(page) {
  await page.goto(`${BASE}/admin/competitions`)
  await pause(page, 1200)
  await page.getByRole('button', { name: 'Add Competition' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 500)

  await field(m, 'Competition Name').locator('input').fill(COMP_NAME)
  await pause(page, 300)
  await field(m, 'Organized By').locator('input').fill('Tamil Nadu Gymnastics Association')
  await pause(page, 300)
  await field(m, 'Location').locator('input').fill('Jawaharlal Nehru Stadium, Chennai')
  await pause(page, 300)
  await field(m, 'Start Date').locator('input').fill('2026-08-15')
  await pause(page, 300)
  await field(m, 'End Date').locator('input').fill('2026-08-16')
  await pause(page, 600)

  await m.getByRole('button', { name: 'Create' }).click()
  await m.waitFor({ state: 'hidden', timeout: 15000 })
  await pause(page, 1200)
}

async function sceneAddAgeGroup(page) {
  const card = page.locator('div.bg-white.rounded-xl.border.border-gray-100.shadow-sm.overflow-hidden')
    .filter({ hasText: COMP_NAME })
  await card.scrollIntoViewIfNeeded()
  await pause(page, 800)

  await card.locator('button').first().click()
  await pause(page, 800)

  await card.getByRole('button', { name: 'Age Group' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 500)

  await field(m, 'Age Group Name').locator('input').fill('Sub-Junior (Under 10)')
  await pause(page, 300)
  await field(m, 'Min Age').locator('input').fill('6')
  await pause(page, 250)
  await field(m, 'Max Age').locator('input').fill('9')
  await pause(page, 300)
  await field(m, 'Applicable Level').locator('select').selectOption({ label: 'Demo Level' })
  await pause(page, 300)
  await field(m, 'Entry Fee (₹)').locator('input').fill('500')
  await pause(page, 300)
  await field(m, 'Start Date').locator('input').fill('2026-08-15')
  await pause(page, 250)
  await field(m, 'End Date').locator('input').fill('2026-08-15')
  await pause(page, 300)
  await field(m, 'Start Time').locator('input').fill('09:00')
  await pause(page, 250)
  await field(m, 'End Time').locator('input').fill('12:00')
  await pause(page, 600)

  await m.getByRole('button', { name: 'Add Age Group' }).click()
  await m.waitFor({ state: 'hidden', timeout: 15000 })
  await pause(page, 1200)
}

async function sceneShortlist(page) {
  const card = page.locator('div.bg-white.rounded-xl.border.border-gray-100.shadow-sm.overflow-hidden')
    .filter({ hasText: COMP_NAME })
  await card.scrollIntoViewIfNeeded()
  await pause(page, 800)

  await card.getByRole('button', { name: 'Shortlist' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 800)

  // Auto-select students who match age range + level (Arjun Demo)
  await m.getByRole('button', { name: 'Auto-select qualified' }).click()
  await pause(page, 1200)

  // Manually add an extra pick who doesn't auto-qualify (Kiran Demo)
  await m.getByRole('button').filter({ hasText: 'Kiran Demo' }).click()
  await pause(page, 1200)

  await m.getByRole('button', { name: 'Save Shortlist' }).click()
  await m.waitFor({ state: 'hidden', timeout: 30000 })
  await pause(page, 1200)
}

async function sceneShortlistEmail(page) {
  await page.goto(`${API}/email-previews/shortlist.html`)
  await pause(page, 4000)
  await page.goBack()
  await page.waitForLoadState()
  await pause(page, 1000)
}

async function sceneSwitchToStudent(page) {
  await signOut(page)
  await pause(page, 500)
  await studentLogin(page, DEMO.arjunPhone, DEMO.arjunPass)
}

async function sceneConfirmParticipation(page) {
  await page.goto(`${BASE}/student/competitions`)
  await pause(page, 1500)
  // Show "Shortlisted" status badge (blue) before confirming
  await pause(page, 1500)

  await page.getByRole('button', { name: 'Confirm Participation' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 800)

  await page.locator('#fee-paid').check()
  await pause(page, 500)
  await field(m, 'Payment Mode').locator('select').selectOption('cash')
  await pause(page, 800)

  await m.getByRole('button', { name: 'Confirm Participation' }).click()
  await m.waitFor({ state: 'hidden', timeout: 15000 })
  await pause(page, 1200)
  // Show updated "Confirmed ✓" status badge (green)
  await pause(page, 2000)
}

async function scenePayFeesOnline(page) {
  await page.goto(`${BASE}/student/fees`)
  await pause(page, 1500)

  await page.getByRole('button', { name: 'Pay', exact: true }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 800)

  await field(m, 'Payment Mode').locator('select').selectOption('online')
  await pause(page, 2200) // shows fee + transaction-fee + GST breakdown

  await m.getByRole('button', { name: /Pay ₹/ }).click()
  await pause(page, 4000) // Razorpay checkout iframe opens

  // Dismiss checkout overlay and return to a clean state
  await page.goto(`${BASE}/student/fees`)
  await pause(page, 1000)
}

async function sceneSwitchToAdmin3(page) {
  await signOut(page)
  await pause(page, 500)
  await staffLogin(page, DEMO.adminEmail, DEMO.adminPass)
}

async function sceneCashFeeCollection(page) {
  await page.goto(`${BASE}/admin/fee-collection`)
  await pause(page, 1200)

  await page.getByRole('button', { name: 'Record Payment' }).click()
  const m = modal(page)
  await m.waitFor()
  await pause(page, 600)

  await field(m, 'Student').locator('select').selectOption({ label: 'Priya Demo (9000000002)' })
  await pause(page, 600)
  await field(m, 'Fee Amount (₹)').locator('input').fill('2000')
  await pause(page, 300)
  await field(m, 'Amount Paid (₹)').locator('input').fill('2000')
  await pause(page, 300)
  await field(m, 'Payment Date').locator('input').fill('2026-06-13')
  await pause(page, 300)
  await field(m, 'Payment Mode').locator('select').selectOption('cash')
  await pause(page, 800)
  await field(m, 'Cash Received By').locator('select').selectOption({ index: 1 })
  await pause(page, 600)

  await m.getByRole('button', { name: 'Save Record' }).click()
  await m.waitFor({ state: 'hidden', timeout: 15000 })
  await pause(page, 1200)

  // Manually email the receipt (cash payments don't auto-generate one)
  const row = page.locator('tr').filter({ hasText: 'Priya Demo' })
  await row.scrollIntoViewIfNeeded()
  await pause(page, 800)
  await row.getByRole('button', { name: 'Email receipt' }).click()
  await pause(page, 4000) // receipt generation + email send + alert

  await page.reload()
  await pause(page, 1500)

  const row2 = page.locator('tr').filter({ hasText: 'Priya Demo' })
  await row2.scrollIntoViewIfNeeded()
  await pause(page, 800)
  await row2.getByRole('button', { name: 'Download receipt' }).click()
  await pause(page, 3000) // PDF receipt loads in-browser

  await page.goBack()
  await page.waitForLoadState()
  await pause(page, 1000)
}

async function sceneReceiptEmail(page) {
  await page.goto(`${API}/email-previews/receipt.html`)
  await pause(page, 4000)
  await page.goBack()
  await page.waitForLoadState()
  await pause(page, 1000)
}

async function sceneClosing(page) {
  await page.goto(`${BASE}/admin`)
  await pause(page, 3000)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()

  page.on('dialog', async d => {
    console.log('[DIALOG]', d.message())
    await d.accept().catch(() => {})
  })
  page.on('console', m => { if (m.type() === 'error') console.log('[PAGE ERROR]', m.text()) })

  const recordingStart = Date.now()

  await runScene('intro', sceneIntro, page)
  await runScene('admin-login', sceneAdminLogin, page)
  await runScene('admin-dashboard', sceneAdminDashboard, page)
  await runScene('admin-config-users', sceneAdminUsersTour, page)
  await runScene('admin-config-fee-structures', sceneAdminFeeStructuresTour, page)
  await runScene('admin-config-batches', sceneAdminBatchesTour, page)
  await runScene('admin-config-apparatus', sceneAdminApparatusTour, page)
  await runScene('admin-config-skills', sceneAdminSkillsTour, page)
  await runScene('register-student', sceneRegisterStudent, page)
  await runScene('welcome-email-preview', sceneWelcomeEmail, page)
  await runScene('switch-to-coach', sceneSwitchToCoach, page)
  await runScene('coach-attendance', sceneCoachAttendance, page)
  await runScene('coach-curriculum', sceneCoachCurriculum, page)
  await runScene('switch-to-admin-2', sceneSwitchToAdmin2, page)
  await runScene('create-competition', sceneCreateCompetition, page)
  await runScene('add-age-group', sceneAddAgeGroup, page)
  await runScene('shortlist', sceneShortlist, page)
  await runScene('shortlist-email-preview', sceneShortlistEmail, page)
  await runScene('switch-to-student', sceneSwitchToStudent, page)
  await runScene('confirm-participation', sceneConfirmParticipation, page)
  await runScene('pay-fees-online', scenePayFeesOnline, page)
  await runScene('switch-to-admin-3', sceneSwitchToAdmin3, page)
  await runScene('cash-fee-collection', sceneCashFeeCollection, page)
  await runScene('receipt-email-preview', sceneReceiptEmail, page)
  await runScene('closing', sceneClosing, page)

  mark('end')

  const video = page.video()
  await context.close()
  const videoPath = await video.path()
  await browser.close()

  const relTimeline = timeline.map(t => ({ scene: t.scene, t: t.t - recordingStart }))
  fs.writeFileSync(path.join(OUT_DIR, 'timeline.json'), JSON.stringify(relTimeline, null, 2))

  console.log('\nVideo saved at:', videoPath)
  console.log('Timeline written to:', path.join(OUT_DIR, 'timeline.json'))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
