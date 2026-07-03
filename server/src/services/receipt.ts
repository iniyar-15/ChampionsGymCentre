import { jsPDF } from 'jspdf'
import autoTableModule from 'jspdf-autotable'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const autoTable: any = (autoTableModule as any).default ?? autoTableModule
import nodemailer from 'nodemailer'
import { format } from 'date-fns'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabaseAdmin } from '../index.js'
import { saveEmailPreview } from './email-preview.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const GYM_NAME    = process.env.GYM_NAME    || 'Champions Gymnastics Center'
const GYM_ADDRESS = process.env.GYM_ADDRESS || 'ECR, Chennai, Tamil Nadu'

function loadLogoBase64(): string | null {
  try {
    const logoPath = path.join(__dirname, '../../assets/logo.webp')
    if (fs.existsSync(logoPath)) return fs.readFileSync(logoPath).toString('base64')
  } catch { /* logo not available */ }
  return null
}
const LOGO_B64 = loadLogoBase64()

// ─── Amount to Indian words ───────────────────────────────────────────────────
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitWords(n: number): string {
  if (n < 20) return ones[n]
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim()
}

function amountToWords(amount: number): string {
  const rounded = Math.round(amount)
  if (rounded === 0) return 'Zero Rupees Only'

  const crore = Math.floor(rounded / 10_000_000)
  const lakh  = Math.floor((rounded % 10_000_000) / 100_000)
  const thou  = Math.floor((rounded % 100_000) / 1_000)
  const hund  = Math.floor((rounded % 1_000) / 100)
  const rem   = rounded % 100

  const parts: string[] = []
  if (crore) parts.push(twoDigitWords(crore) + ' Crore')
  if (lakh)  parts.push(twoDigitWords(lakh)  + ' Lakh')
  if (thou)  parts.push(twoDigitWords(thou)  + ' Thousand')
  if (hund)  parts.push(ones[hund] + ' Hundred')
  if (rem)   parts.push(twoDigitWords(rem))

  return 'Rupees ' + parts.join(' ') + ' Only'
}

// ─── Receipt number from collection ID ───────────────────────────────────────
function receiptNo(id: string, createdAt: string): string {
  const year = new Date(createdAt).getFullYear()
  const seq = id.replace(/-/g, '').slice(-6).toUpperCase()
  return `CGC-${year}-${seq}`
}

// ─── Generate and email receipt ───────────────────────────────────────────────
export async function generateAndEmailFeeReceipt(feeCollectionId: string): Promise<void> {
  // Fetch all necessary data
  const { data: fc, error } = await supabaseAdmin
    .from('fee_collections')
    .select(`
      id, month, amount, paid_amount, paid_date, payment_mode, reference_id, created_at,
      students(name, parent_name, contact_phone, email),
      fee_structures(name)
    `)
    .eq('id', feeCollectionId)
    .single()

  if (error || !fc) {
    console.error('[RECEIPT] Could not fetch fee collection:', error?.message)
    return
  }

  const student = (fc as any).students
  if (!student?.email) {
    console.log('[RECEIPT] No email for student, skipping receipt email')
    return
  }

  const paidAmount  = fc.paid_amount || 0
  if (paidAmount <= 0) return

  // Tax calculation (18% GST included in paid amount)
  const taxable = paidAmount / 1.18
  const cgst    = taxable * 0.09
  const sgst    = taxable * 0.09

  const gstin      = process.env.GSTIN || 'Not Registered'
  const rNo        = receiptNo(fc.id, fc.created_at)
  const dateStr    = fc.paid_date
    ? format(new Date(fc.paid_date), 'dd/MM/yyyy')
    : format(new Date(fc.created_at), 'dd/MM/yyyy')
  const monthStr   = format(new Date(fc.month), 'MMMM yyyy')
  const payMode    = fc.payment_mode
    ? fc.payment_mode.charAt(0).toUpperCase() + fc.payment_mode.slice(1)
    : '—'
  const txnRef     = fc.reference_id || '—'

  // ─── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const margin = 14
  let y = 14

  // Gold top border
  doc.setDrawColor(184, 149, 64)
  doc.setLineWidth(1.2)
  doc.line(margin, y, W - margin, y)
  y += 7

  // Header - logo + gym name
  const hdrY  = y
  const LOGO_H = 18

  if (LOGO_B64) {
    try {
      doc.addImage(`data:image/webp;base64,${LOGO_B64}`, 'WEBP', margin, hdrY, LOGO_H, LOGO_H)
    } catch { /* skip if image fails */ }
  }

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 41, 81)
  doc.text(GYM_NAME.toUpperCase(), W / 2, hdrY + 7, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(GYM_ADDRESS, W / 2, hdrY + 12, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(`GSTIN: ${gstin}   |   SAC Code: 999294`, W / 2, hdrY + 17, { align: 'center' })
  y = hdrY + (LOGO_B64 ? LOGO_H + 2 : 16)

  // Gold divider
  doc.setDrawColor(184, 149, 64)
  doc.setLineWidth(0.7)
  doc.line(margin, y, W - margin, y)
  y += 7

  // Title
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 41, 81)
  doc.text('FEE RECEIPT / TAX INVOICE', W / 2, y, { align: 'center' })
  y += 7

  // Receipt meta table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      [{ content: 'Receipt No.', styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, rNo,
       { content: 'Date', styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, dateStr],
      [{ content: 'Place of Supply', styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, 'Tamil Nadu',
       { content: 'State Code', styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, '33'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 52 }, 2: { cellWidth: 38 }, 3: { cellWidth: 52 } },
    theme: 'grid',
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // Recipient details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 41, 81)
  doc.text('Recipient Details', margin, y)
  y += 3

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      [{ content: 'Student Name',     styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, student.name || '—'],
      [{ content: 'Parent/Guardian',  styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, student.parent_name || '—'],
      [{ content: 'Contact No.',      styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, student.contact_phone || '—'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 50 }, 1: {} },
    theme: 'grid',
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // Service & fee details
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 41, 81)
  doc.text('Service & Fee Details', margin, y)
  y += 3

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      [{ content: 'Description of Service', styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, 'Gymnastics Training Fee'],
      [{ content: 'Paid for the Month',     styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, monthStr],
      [{ content: 'Mode of Payment',        styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, payMode],
      [{ content: 'Transaction/Ref. No.',   styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, txnRef],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 50 }, 1: {} },
    theme: 'grid',
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // Tax breakup
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 41, 81)
  doc.text('Tax Breakup', margin, y)
  y += 3

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      [{ content: 'Taxable Amount',           styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, `₹${taxable.toFixed(2)}`],
      [{ content: 'CGST (9%)',                styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, `₹${cgst.toFixed(2)}`],
      [{ content: 'SGST (9%)',                styles: { fontStyle: 'bold', fillColor: [230, 236, 245] } }, `₹${sgst.toFixed(2)}`],
      [{ content: 'Total Amount (Incl. Tax)', styles: { fontStyle: 'bold', fillColor: [15, 41, 81], textColor: [255, 255, 255] } },
       { content: `₹${paidAmount.toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: [15, 41, 81], textColor: [255, 255, 255] } }],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 80 }, 1: {} },
    theme: 'grid',
  })
  y = (doc as any).lastAutoTable.finalY + 5

  // Amount in words
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('Amount in Words: ', margin, y)
  doc.setFont('helvetica', 'italic')
  doc.text(amountToWords(paidAmount), margin + 38, y)
  y += 14

  // Thank you
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(184, 149, 64)
  doc.text('Thank you for your payment!', W / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('This is a computer-generated receipt and does not require a signature.', W / 2, y, { align: 'center' })
  y += 8

  // Bottom gold border
  doc.setDrawColor(184, 149, 64)
  doc.setLineWidth(1.2)
  doc.line(margin, y, W - margin, y)

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  const storagePath = `fee-receipts/${feeCollectionId}.pdf`

  // ─── Upload to Supabase Storage ──────────────────────────────────────────────
  // Ensure bucket exists (no-op if already created)
  await supabaseAdmin.storage.createBucket('receipts', { public: false }).catch(() => {})

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('receipts')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('[RECEIPT] Storage upload failed:', uploadErr.message)
  } else {
    await supabaseAdmin
      .from('fee_collections')
      .update({ receipt_url: storagePath })
      .eq('id', feeCollectionId)
    console.log(`[RECEIPT] Stored at ${storagePath}`)
  }

  // ─── Email ──────────────────────────────────────────────────────────────────
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const subject  = `Fee Receipt — ${monthStr} | ${GYM_NAME}`
  const logoHtml = LOGO_B64
    ? `<img src="cid:gymlogo" width="60" height="60" style="display:block;margin:0 auto 8px" alt="${GYM_NAME}" />`
    : ''
  const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
        <div style="text-align:center;padding-bottom:12px;border-bottom:2px solid #b89540;margin-bottom:16px">
          ${logoHtml}
          <h2 style="color:#0f2951;margin:0">${GYM_NAME}</h2>
          <p style="color:#64748b;font-size:12px;margin:4px 0 0">${GYM_ADDRESS}</p>
        </div>
        <p>Dear <strong>${student.name}</strong>,</p>
        <p>Please find attached your fee receipt for <strong>${monthStr}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
          <tr><td style="padding:6px;background:#e6ecf5;font-weight:bold;width:50%">Receipt No.</td><td style="padding:6px">${rNo}</td></tr>
          <tr><td style="padding:6px;background:#e6ecf5;font-weight:bold">Amount Paid</td><td style="padding:6px;font-weight:bold">₹${paidAmount.toFixed(2)}</td></tr>
          <tr><td style="padding:6px;background:#e6ecf5;font-weight:bold">Payment Mode</td><td style="padding:6px">${payMode}</td></tr>
          <tr><td style="padding:6px;background:#e6ecf5;font-weight:bold">Date</td><td style="padding:6px">${dateStr}</td></tr>
        </table>
        <p style="color:#64748b;font-size:12px">${GYM_NAME}, ${GYM_ADDRESS}</p>
      </div>
    `

  const mailAttachments: nodemailer.SendMailOptions['attachments'] = [{
    filename: `Fee_Receipt_${rNo}.pdf`,
    content: pdfBuffer,
    contentType: 'application/pdf',
  }]
  if (LOGO_B64) {
    mailAttachments.push({
      filename: 'logo.webp',
      content: Buffer.from(LOGO_B64, 'base64'),
      cid: 'gymlogo',
    })
  }

  await saveEmailPreview('receipt', subject, html)
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: student.email,
    subject,
    html,
    attachments: mailAttachments,
  })

  console.log(`[RECEIPT] Sent to ${student.email} (${rNo})`)
}
