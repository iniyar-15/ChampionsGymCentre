import nodemailer from 'nodemailer'
import { supabaseAdmin } from '../index.js'
import { format, startOfMonth, subMonths, startOfQuarter, startOfYear } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendCompetitionShortlistEmail(params: {
  to: string
  studentName: string
  competitionName: string
  ageGroupName: string
  startDate: string | null
  startTime: string | null
  location: string | null
  entryFee: number | null
}) {
  const transport = createTransport()
  const { to, studentName, competitionName, ageGroupName, startDate, startTime, location, entryFee } = params

  const dateStr = startDate ? new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const timeStr = startTime ? startTime.slice(0, 5) : ''
  const feeStr = entryFee ? `₹${entryFee}` : 'No entry fee'

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `🏆 You've been selected for ${competitionName}!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
        <h2 style="color:#1d4ed8">Champions Gymnastics Centre (CGC)</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>Congratulations! You have been selected to participate in the following competition:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Competition</td><td style="padding:8px">${competitionName}</td></tr>
          <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Age Group</td><td style="padding:8px">${ageGroupName}</td></tr>
          ${dateStr ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Date</td><td style="padding:8px">${dateStr}${timeStr ? ' at ' + timeStr : ''}</td></tr>` : ''}
          ${location ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Venue</td><td style="padding:8px">${location}</td></tr>` : ''}
          <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Entry Fee</td><td style="padding:8px">${feeStr}</td></tr>
        </table>
        <p>Please log in to the CGC portal to view full competition details.</p>
        <p style="color:#64748b;font-size:12px">Champions Gymnastics Centre (CGC)</p>
      </div>
    `,
  })
}

export async function sendReportEmail() {
  const transport = createTransport()
  const managerEmail = process.env.MANAGER_EMAIL
  if (!managerEmail) {
    console.log('[EMAIL] MANAGER_EMAIL not configured, skipping')
    return
  }

  const prevMonth = subMonths(new Date(), 1)
  const prevMonthStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
  const prevMonthEnd = format(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0), 'yyyy-MM-dd')
  const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const quarterStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd')
  const yearStart = format(startOfYear(new Date()), 'yyyy-MM-dd')
  const today = format(new Date(), 'yyyy-MM-dd')

  // Fetch all report data
  const [attendance, newStudents, feesPaid, feeDefaulters, lowAttendance, quarterlyFees, yearlyFees] = await Promise.all([
    supabaseAdmin.from('attendance').select('student_id, status, students(name)').gte('date', prevMonthStart).lte('date', prevMonthEnd),
    supabaseAdmin.from('students').select('name, contact_phone, created_at, levels(name)').gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd + 'T23:59:59'),
    supabaseAdmin.from('fee_collections').select('*, students(name)').eq('month', thisMonthStart).lte('paid_date', `${today.slice(0, 8)}10`),
    supabaseAdmin.from('fee_collections').select('*, students(name, contact_phone)').eq('month', thisMonthStart),
    supabaseAdmin.from('students').select('id, name, contact_phone').eq('is_active', true),
    supabaseAdmin.from('fee_collections').select('month, paid_amount, amount').gte('month', quarterStart),
    supabaseAdmin.from('fee_collections').select('month, paid_amount, amount').gte('month', yearStart),
  ])

  const doc = new jsPDF()
  let y = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Champions Gymnastics Centre', 14, y); y += 8
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Monthly Report — ${format(prevMonth, 'MMMM yyyy')}`, 14, y); y += 6
  doc.setFontSize(9)
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, y); y += 12

  // 1. New Students
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('1. New Students Enrolled', 14, y); y += 4

  autoTable(doc, {
    startY: y,
    head: [['Name', 'Phone', 'Level', 'Enrolled On']],
    body: newStudents.data?.map((s: any) => [s.name, s.contact_phone, s.levels?.name || '—', format(new Date(s.created_at), 'dd MMM')]) || [['No new students', '', '', '']],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // 2. Fee defaulters
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('2. Fee Defaulters (Current Month)', 14, y); y += 4

  const defaulters = (feeDefaulters.data || []).filter((fc: any) => (fc.paid_amount || 0) < fc.amount)
  autoTable(doc, {
    startY: y,
    head: [['Student', 'Phone', 'Amount Due', 'Paid', 'Balance']],
    body: defaulters.map((fc: any) => [fc.students?.name, fc.students?.contact_phone, fc.amount, fc.paid_amount || 0, fc.amount - (fc.paid_amount || 0)]) || [['No defaulters', '', '', '', '']],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [239, 68, 68] },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // 3. Quarterly earnings
  const qByMonth: Record<string, { collected: number; due: number }> = {}
  quarterlyFees.data?.forEach((fc: any) => {
    const m = fc.month.slice(0, 7)
    if (!qByMonth[m]) qByMonth[m] = { collected: 0, due: 0 }
    qByMonth[m].collected += fc.paid_amount || 0
    qByMonth[m].due += fc.amount
  })

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('3. Quarterly Earnings', 14, y); y += 4

  autoTable(doc, {
    startY: y,
    head: [['Month', 'Billed', 'Collected', 'Rate']],
    body: Object.entries(qByMonth).map(([m, v]) => [format(new Date(m + '-01'), 'MMM yyyy'), `₹${v.due}`, `₹${v.collected}`, `${v.due ? Math.round((v.collected / v.due) * 100) : 0}%`]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129] },
  })

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: managerEmail,
    subject: `CGC Monthly Report — ${format(prevMonth, 'MMMM yyyy')}`,
    text: `Please find attached the monthly report for Champions Gymnastics Centre — ${format(prevMonth, 'MMMM yyyy')}.`,
    attachments: [{
      filename: `CGC_Report_${format(prevMonth, 'yyyy_MM')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  })

  console.log(`[EMAIL] Monthly report sent to ${managerEmail}`)
}