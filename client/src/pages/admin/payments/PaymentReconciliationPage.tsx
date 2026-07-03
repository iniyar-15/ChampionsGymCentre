import { useState } from 'react'
import { format, subDays } from 'date-fns'
import Button from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/FormField'
import PageHeader from '@/components/ui/PageHeader'
import { Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type PendingPayment = {
  id: string
  paid_date: string
  paid_amount: number
  payment_mode: string
  reference_id: string | null
  students: { name: string; email: string | null; contact_phone: string } | null
}

type BankRow = {
  date: string
  amount: number
  reference: string
  narration: string
  raw: string[]
}

type MatchResult = {
  payment: PendingPayment
  match: BankRow | null
  score: number
  selected: boolean
}

function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  return lines.map(line => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes }
      else if ((char === ',' || char === ';') && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += char }
    }
    result.push(current.trim())
    return result
  })
}

function parseAmount(val: string): number {
  const cleaned = val.replace(/[^0-9.]/g, '')
  return parseFloat(cleaned) || 0
}

function parseDate(val: string): string {
  // Try common Indian bank date formats: dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd
  const v = val.trim()
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const ymd = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  return v
}

function matchScore(payment: PendingPayment, row: BankRow): number {
  let score = 0
  if (Math.abs(row.amount - payment.paid_amount) < 1) score += 3
  if (payment.paid_date && row.date) {
    const daysDiff = Math.abs(
      new Date(row.date).getTime() - new Date(payment.paid_date).getTime()
    ) / 86400000
    if (daysDiff <= 1) score += 2
    else if (daysDiff <= 3) score += 1
  }
  if (payment.reference_id && row.reference) {
    const ref = row.reference.toLowerCase()
    const pid = payment.reference_id.toLowerCase()
    if (ref.includes(pid) || pid.includes(ref)) score += 3
  }
  return score
}

export default function PaymentReconciliationPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(today)
  const [pending, setPending] = useState<PendingPayment[]>([])
  const [loadingPending, setLoadingPending] = useState(false)

  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [colDate, setColDate] = useState('')
  const [colAmount, setColAmount] = useState('')
  const [colRef, setColRef] = useState('')
  const [colNarration, setColNarration] = useState('')

  const [matches, setMatches] = useState<MatchResult[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ succeeded: number; failed: number } | null>(null)

  async function loadPending() {
    setLoadingPending(true)
    setPending([])
    setMatches([])
    setVerifyResult(null)
    try {
      const res = await fetch(`${API_URL}/api/fee/pending-verification?from=${fromDate}&to=${toDate}`)
      const data = await res.json()
      setPending(Array.isArray(data) ? data : [])
    } finally {
      setLoadingPending(false)
    }
  }

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) return
      const hdrs = rows[0]
      setCsvRows(rows.slice(1).filter(r => r.some(c => c.trim())))
      setHeaders(hdrs)
      // Auto-detect common column names
      const find = (kw: string[]) => hdrs.findIndex(h => kw.some(k => h.toLowerCase().includes(k))).toString()
      setColDate(find(['date', 'dt', 'txn date', 'trans date', 'value date']))
      setColAmount(find(['credit', 'deposit', 'cr', 'received', 'amount']))
      setColRef(find(['ref', 'utr', 'chq', 'txn', 'transaction id', 'reference']))
      setColNarration(find(['narration', 'description', 'particulars', 'remarks']))
      setMatches([])
    }
    reader.readAsText(file)
  }

  function runMatching() {
    if (!csvRows.length || !pending.length) return
    const di = parseInt(colDate), ai = parseInt(colAmount), ri = parseInt(colRef), ni = parseInt(colNarration)

    const bankRows: BankRow[] = csvRows
      .map(r => ({
        date: di >= 0 ? parseDate(r[di] || '') : '',
        amount: ai >= 0 ? parseAmount(r[ai] || '') : 0,
        reference: ri >= 0 ? (r[ri] || '') : '',
        narration: ni >= 0 ? (r[ni] || '') : '',
        raw: r,
      }))
      .filter(r => r.amount > 0)

    const results: MatchResult[] = pending.map(payment => {
      const scored = bankRows.map(row => ({ row, score: matchScore(payment, row) }))
      const best = scored.sort((a, b) => b.score - a.score)[0]
      const match = best && best.score >= 3 ? best.row : null
      return { payment, match, score: best?.score ?? 0, selected: match !== null && best.score >= 5 }
    })
    setMatches(results)
  }

  function toggleSelect(id: string) {
    setMatches(m => m.map(r => r.payment.id === id ? { ...r, selected: !r.selected } : r))
  }

  async function verifySelected() {
    const ids = matches.filter(m => m.selected).map(m => m.payment.id)
    if (!ids.length) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await fetch(`${API_URL}/api/fee/batch-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      setVerifyResult(data)
      setMatches(m => m.map(r => ids.includes(r.payment.id) ? { ...r, selected: false } : r))
      setPending(p => p.filter(pay => !ids.includes(pay.id)))
    } finally {
      setVerifying(false)
    }
  }

  const selectedCount = matches.filter(m => m.selected).length
  const columnsReady = colDate !== '' && colAmount !== ''
  const bankParsed = csvRows.length > 0 && columnsReady

  return (
    <div>
      <PageHeader title="Payment Reconciliation" subtitle="Match bank statement entries with submitted payments and send receipts" />

      {/* Step 1: Date range + load */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="font-semibold text-gray-800 mb-4">Step 1 — Load Pending Payments</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <FormField label="From Date">
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </FormField>
          <FormField label="To Date">
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </FormField>
          <Button onClick={loadPending} loading={loadingPending}>Load Payments</Button>
        </div>
        {pending.length > 0 && (
          <p className="text-sm text-green-700 mt-3 font-medium">{pending.length} pending payment(s) found</p>
        )}
        {!loadingPending && pending.length === 0 && (
          <p className="text-sm text-gray-400 mt-3">No submitted UPI/Bank Transfer payments in this range</p>
        )}
      </div>

      {/* Step 2: Upload bank statement */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="font-semibold text-gray-800 mb-1">Step 2 — Upload Bank Statement</h2>
        <p className="text-xs text-gray-500 mb-4">Upload a CSV exported from your bank's net banking portal</p>
        <label className="flex items-center gap-2 cursor-pointer w-fit mb-4">
          <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <Upload size={15} /> Upload CSV
          </div>
          <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVUpload} />
        </label>

        {headers.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Map columns from your CSV:</p>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              {[
                { label: 'Date Column', val: colDate, set: setColDate },
                { label: 'Credit Amount Column', val: colAmount, set: setColAmount },
                { label: 'Reference / UTR Column', val: colRef, set: setColRef },
                { label: 'Narration Column (optional)', val: colNarration, set: setColNarration },
              ].map(({ label, val, set }) => (
                <FormField key={label} label={label}>
                  <select value={val} onChange={e => set(e.target.value)} className="input-base">
                    <option value="">— None —</option>
                    {headers.map((h, i) => <option key={i} value={i.toString()}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </FormField>
              ))}
            </div>
            <p className="text-xs text-gray-500">{csvRows.length} rows parsed from CSV</p>
          </div>
        )}
      </div>

      {/* Step 3: Match */}
      {pending.length > 0 && bankParsed && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">Step 3 — Match Payments</h2>
              <p className="text-xs text-gray-500 mt-0.5">Auto-matched by amount, date, and reference number</p>
            </div>
            <Button onClick={runMatching}>Run Auto-Match</Button>
          </div>

          {matches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Payment Date</th>
                    <th>Ref (entered by student)</th>
                    <th>Match in Bank Statement</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(({ payment, match, score, selected }) => {
                    const confidence = score >= 8 ? 'High' : score >= 5 ? 'Medium' : score >= 3 ? 'Low' : 'None'
                    const confCls = score >= 8 ? 'badge-green' : score >= 5 ? 'badge-yellow' : 'badge-red'
                    return (
                      <tr key={payment.id} className={selected ? 'bg-green-50' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelect(payment.id)}
                            disabled={!match}
                            className="rounded"
                          />
                        </td>
                        <td>
                          <p className="font-medium">{payment.students?.name}</p>
                          <p className="text-xs text-gray-500">{payment.students?.contact_phone}</p>
                        </td>
                        <td>{formatCurrency(payment.paid_amount)}</td>
                        <td>{formatDate(payment.paid_date)}</td>
                        <td className="text-xs font-mono">{payment.reference_id || '—'}</td>
                        <td>
                          {match ? (
                            <div className="flex items-center gap-1.5 text-green-700">
                              <CheckCircle size={14} />
                              <span className="text-xs">
                                {formatCurrency(match.amount)} on {formatDate(match.date)}
                                {match.reference && ` · ${match.reference.slice(0, 20)}`}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500">
                              <XCircle size={14} />
                              <span className="text-xs">No match found</span>
                            </div>
                          )}
                        </td>
                        <td>
                          {match ? <span className={`badge ${confCls}`}>{confidence}</span>
                            : <span className="badge badge-red">No match</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Verify */}
      {matches.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Step 4 — Verify & Send Receipts</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedCount} payment(s) selected · receipts will be emailed to students
              </p>
            </div>
            <Button
              onClick={verifySelected}
              loading={verifying}
              disabled={selectedCount === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle size={15} /> Verify & Send Receipts ({selectedCount})
            </Button>
          </div>

          {verifyResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${verifyResult.failed === 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              <AlertCircle size={16} />
              {verifyResult.succeeded} verified and receipt(s) sent.
              {verifyResult.failed > 0 && ` ${verifyResult.failed} failed (check student email addresses).`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
