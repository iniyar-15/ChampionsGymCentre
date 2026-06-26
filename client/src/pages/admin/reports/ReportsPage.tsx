import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/FormField'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format, startOfMonth, subMonths } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ReportType = 'attendance' | 'fees-paid' | 'new-students'

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('attendance')
  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'))

  const monthStart = `${month}-01`
  const monthEnd = format(new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0), 'yyyy-MM-dd')

  const attendanceQuery = useQuery({
    queryKey: ['report-attendance', month],
    enabled: reportType === 'attendance',
    queryFn: async () => {
      const { data: students } = await supabase
        .from('students')
        .select('id, name, contact_phone')
        .eq('is_active', true)
        .order('name')

      const { data: attendance } = await supabase
        .from('attendance')
        .select('student_id, status, date')
        .gte('date', monthStart)
        .lte('date', monthEnd)

      return (students || []).map(s => {
        const records = (attendance || []).filter(a => a.student_id === s.id)
        const present = records.filter(a => a.status === 'present').length
        const total = records.length
        const pct = total ? Math.round((present / total) * 100) : 0
        return { ...s, present, total, pct }
      }).sort((a, b) => a.pct - b.pct)
    },
  })

  const feesQuery = useQuery({
    queryKey: ['report-fees', month],
    enabled: reportType === 'fees-paid',
    queryFn: async () => {
      const { data } = await supabase
        .from('fee_collections')
        .select('*, students(name, contact_phone), fee_structures(name)')
        .eq('month', monthStart)
        .order('paid_date', { ascending: false })
      return data || []
    },
  })

  const newStudentsQuery = useQuery({
    queryKey: ['report-new-students', month],
    enabled: reportType === 'new-students',
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('*, levels(name)')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd + 'T23:59:59')
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  function generatePDF() {
    const doc = new jsPDF()
    const title = reportType === 'attendance' ? 'Attendance Report'
      : reportType === 'fees-paid' ? 'Fees Paid Report'
        : 'New Students Report'

    doc.setFontSize(16)
    doc.text('Praxis', 14, 20)
    doc.setFontSize(12)
    doc.text(`${title} — ${format(new Date(monthStart), 'MMMM yyyy')}`, 14, 30)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 38)

    if (reportType === 'attendance' && attendanceQuery.data) {
      autoTable(doc, {
        startY: 45,
        head: [['Student', 'Phone', 'Days Present', 'Total Days', 'Attendance %']],
        body: attendanceQuery.data.map(r => [r.name, r.contact_phone, r.present, r.total, `${r.pct}%`]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      })
    } else if (reportType === 'fees-paid' && feesQuery.data) {
      autoTable(doc, {
        startY: 45,
        head: [['Student', 'Fee Structure', 'Due', 'Paid', 'Balance', 'Paid On', 'Mode']],
        body: feesQuery.data.map((r: any) => [
          r.students?.name, r.fee_structures?.name || '—',
          r.amount, r.paid_amount || 0,
          r.amount - (r.paid_amount || 0),
          r.paid_date ? format(new Date(r.paid_date), 'dd MMM yyyy') : '—',
          r.payment_mode || '—',
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      })
    } else if (reportType === 'new-students' && newStudentsQuery.data) {
      autoTable(doc, {
        startY: 45,
        head: [['Name', 'Parent', 'Phone', 'Level', 'Enrolled On']],
        body: newStudentsQuery.data.map((r: any) => [
          r.name, r.parent_name || '—', r.contact_phone,
          r.levels?.name || '—', format(new Date(r.created_at), 'dd MMM yyyy'),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      })
    }

    doc.save(`${title.replace(/\s/g, '_')}_${month}.pdf`)
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i + 1)
    return format(startOfMonth(d), 'yyyy-MM')
  })

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Generate and export reports as PDF</p>
        </div>
        <Button onClick={generatePDF}>
          <Download size={16} /> Export PDF
        </Button>
      </div>

      {/* Report controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <FormField label="Report Type">
            <Select value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
              <option value="attendance">Attendance Report</option>
              <option value="fees-paid">Fees Paid Report</option>
              <option value="new-students">New Students Report</option>
            </Select>
          </FormField>
          <FormField label="Month">
            <Select value={month} onChange={e => setMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</option>)}
            </Select>
          </FormField>
        </div>
      </div>

      {/* Report preview */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">
            {reportType === 'attendance' ? 'Attendance Report' : reportType === 'fees-paid' ? 'Fees Paid Report' : 'New Students Report'}
            {' — '}{format(new Date(monthStart), 'MMMM yyyy')}
          </h2>
        </div>

        {/* Attendance */}
        {reportType === 'attendance' && (
          <table className="data-table">
            <thead>
              <tr><th>Student</th><th>Phone</th><th>Days Present</th><th>Total Days</th><th>Attendance %</th><th>Status</th></tr>
            </thead>
            <tbody>
              {attendanceQuery.isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : attendanceQuery.data?.map(r => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.contact_phone}</td>
                  <td>{r.present}</td>
                  <td>{r.total}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.pct >= 75 ? 'bg-green-500' : r.pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="text-sm font-medium">{r.pct}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${r.pct >= 75 ? 'badge-green' : r.pct >= 50 ? 'badge-yellow' : 'badge-red'}`}>
                      {r.pct >= 75 ? 'Good' : r.pct >= 50 ? 'Low' : 'Critical'}
                    </span>
                  </td>
                </tr>
              ))}
              {!attendanceQuery.isLoading && !attendanceQuery.data?.length && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No data</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Fees paid */}
        {reportType === 'fees-paid' && (
          <table className="data-table">
            <thead>
              <tr><th>Student</th><th>Fee Structure</th><th>Due</th><th>Paid</th><th>Balance</th><th>Paid On</th><th>Mode</th></tr>
            </thead>
            <tbody>
              {feesQuery.isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : feesQuery.data?.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.students?.name}</td>
                  <td>{r.fee_structures?.name || '—'}</td>
                  <td>{formatCurrency(r.amount)}</td>
                  <td className="text-green-600 font-medium">{formatCurrency(r.paid_amount || 0)}</td>
                  <td className={r.amount - (r.paid_amount || 0) > 0 ? 'text-red-600' : 'text-gray-600'}>
                    {formatCurrency(r.amount - (r.paid_amount || 0))}
                  </td>
                  <td>{formatDate(r.paid_date)}</td>
                  <td>{r.payment_mode || '—'}</td>
                </tr>
              ))}
              {!feesQuery.isLoading && !feesQuery.data?.length && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No data</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* New students */}
        {reportType === 'new-students' && (
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Parent</th><th>Phone</th><th>Level</th><th>Gender</th><th>Enrolled On</th></tr>
            </thead>
            <tbody>
              {newStudentsQuery.isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : newStudentsQuery.data?.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.parent_name || '—'}</td>
                  <td>{r.contact_phone}</td>
                  <td>{r.levels?.name || '—'}</td>
                  <td>{r.gender || '—'}</td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {!newStudentsQuery.isLoading && !newStudentsQuery.data?.length && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No new students this month</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}