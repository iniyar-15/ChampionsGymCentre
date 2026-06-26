import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/FormField'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format, startOfMonth, subMonths, startOfQuarter, startOfYear } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ManagerReportType = 'new-students' | 'low-attendance' | 'fees-collected' | 'fees-defaulters' | 'upcoming-competitions' | 'quarterly-earnings' | 'yearly-earnings'

export default function ManagerReportsPage() {
  const [reportType, setReportType] = useState<ManagerReportType>('fees-collected')
  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'))

  const monthStart = `${month}-01`
  const monthEnd = format(new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0), 'yyyy-MM-dd')
  const quarterStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd')
  const yearStart = format(startOfYear(new Date()), 'yyyy-MM-dd')
  const today = format(new Date(), 'yyyy-MM-dd')

  const newStudentsQuery = useQuery({
    queryKey: ['mgr-new-students', month],
    enabled: reportType === 'new-students',
    queryFn: async () => {
      const { data } = await supabase.from('students').select('*, levels(name)')
        .gte('created_at', monthStart).lte('created_at', monthEnd + 'T23:59:59').order('created_at', { ascending: false })
      return data || []
    },
  })

  const lowAttendanceQuery = useQuery({
    queryKey: ['mgr-low-attendance', month],
    enabled: reportType === 'low-attendance',
    queryFn: async () => {
      const { data: students } = await supabase.from('students').select('id, name, contact_phone').eq('is_active', true)
      const { data: attendance } = await supabase.from('attendance').select('student_id, status')
        .gte('date', monthStart).lte('date', monthEnd)
      return (students || []).map(s => {
        const records = (attendance || []).filter(a => a.student_id === s.id)
        const present = records.filter(a => a.status === 'present').length
        const total = records.length
        const pct = total ? Math.round((present / total) * 100) : 0
        return { ...s, present, total, pct }
      }).filter(s => s.pct < 50 && s.total > 0).sort((a, b) => a.pct - b.pct)
    },
  })

  const feesCollectedQuery = useQuery({
    queryKey: ['mgr-fees-collected', month],
    enabled: reportType === 'fees-collected',
    queryFn: async () => {
      const { data } = await supabase.from('fee_collections')
        .select('*, students(name, contact_phone), fee_structures(name)')
        .eq('month', monthStart).order('paid_date', { ascending: false })
      return data || []
    },
  })

  const feesDefaultersQuery = useQuery({
    queryKey: ['mgr-fees-defaulters', month],
    enabled: reportType === 'fees-defaulters',
    queryFn: async () => {
      const { data } = await supabase.from('fee_collections')
        .select('*, students(name, contact_phone)')
        .eq('month', monthStart)
        .lt('paid_amount', supabase.rpc as any)
      // Simpler: fetch all and filter
      const { data: all } = await supabase.from('fee_collections')
        .select('*, students(name, contact_phone), fee_structures(name)')
        .eq('month', monthStart)
      return (all || []).filter((fc: any) => (fc.paid_amount || 0) < fc.amount)
    },
  })

  const competitionsQuery = useQuery({
    queryKey: ['mgr-competitions'],
    enabled: reportType === 'upcoming-competitions',
    queryFn: async () => {
      const { data } = await supabase.from('competitions').select('*')
        .gte('start_date', today).order('start_date')
      return data || []
    },
  })

  const quarterlyQuery = useQuery({
    queryKey: ['mgr-quarterly'],
    enabled: reportType === 'quarterly-earnings',
    queryFn: async () => {
      const { data } = await supabase.from('fee_collections').select('month, paid_amount, amount')
        .gte('month', quarterStart)
      const byMonth: Record<string, { collected: number; due: number }> = {}
      data?.forEach((fc: any) => {
        const m = fc.month.slice(0, 7)
        if (!byMonth[m]) byMonth[m] = { collected: 0, due: 0 }
        byMonth[m].collected += fc.paid_amount || 0
        byMonth[m].due += fc.amount
      })
      return Object.entries(byMonth).map(([m, v]) => ({ month: m, ...v })).sort((a, b) => a.month.localeCompare(b.month))
    },
  })

  const yearlyQuery = useQuery({
    queryKey: ['mgr-yearly'],
    enabled: reportType === 'yearly-earnings',
    queryFn: async () => {
      const { data } = await supabase.from('fee_collections').select('month, paid_amount, amount').gte('month', yearStart)
      const byMonth: Record<string, { collected: number; due: number }> = {}
      data?.forEach((fc: any) => {
        const m = fc.month.slice(0, 7)
        if (!byMonth[m]) byMonth[m] = { collected: 0, due: 0 }
        byMonth[m].collected += fc.paid_amount || 0
        byMonth[m].due += fc.amount
      })
      return Object.entries(byMonth).map(([m, v]) => ({ month: m, ...v })).sort((a, b) => a.month.localeCompare(b.month))
    },
  })

  function generatePDF() {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Champions Gymnastics Center', 14, 20)
    doc.setFontSize(12)
    const labels: Record<ManagerReportType, string> = {
      'new-students': 'New Students Report',
      'low-attendance': 'Low Attendance Report (< 50%)',
      'fees-collected': 'Fees Collected Report',
      'fees-defaulters': 'Fee Defaulters Report',
      'upcoming-competitions': 'Upcoming Competitions',
      'quarterly-earnings': 'Quarterly Earnings',
      'yearly-earnings': 'Yearly Earnings',
    }
    doc.text(labels[reportType], 14, 30)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 38)

    // Add tables based on report type (simplified)
    doc.save(`${labels[reportType].replace(/\s/g, '_')}.pdf`)
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i + 1)
    return format(startOfMonth(d), 'yyyy-MM')
  })

  const reportNeedsMonth = ['new-students', 'low-attendance', 'fees-collected', 'fees-defaulters'].includes(reportType)

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Operational insights and export</p>
        </div>
        <Button onClick={generatePDF}><Download size={16} /> Export PDF</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <FormField label="Report">
            <Select value={reportType} onChange={e => setReportType(e.target.value as ManagerReportType)}>
              <option value="new-students">New Students Enrolled</option>
              <option value="low-attendance">Students with &lt; 50% Attendance</option>
              <option value="fees-collected">Fees Collected (Month)</option>
              <option value="fees-defaulters">Fee Defaulters</option>
              <option value="upcoming-competitions">Upcoming Competitions</option>
              <option value="quarterly-earnings">Quarterly Earnings</option>
              <option value="yearly-earnings">Yearly Earnings</option>
            </Select>
          </FormField>
          {reportNeedsMonth && (
            <FormField label="Month">
              <Select value={month} onChange={e => setMonth(e.target.value)}>
                {monthOptions.map(m => <option key={m} value={m}>{format(new Date(m + '-01'), 'MMMM yyyy')}</option>)}
              </Select>
            </FormField>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">{reportType === 'fees-collected' ? `Fees — ${format(new Date(monthStart), 'MMMM yyyy')}` : ''}</h2>
        </div>

        {/* New Students */}
        {reportType === 'new-students' && (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Parent</th><th>Phone</th><th>Level</th><th>Enrolled On</th></tr></thead>
            <tbody>
              {newStudentsQuery.data?.map((s: any) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td><td>{s.parent_name || '—'}</td>
                  <td>{s.contact_phone}</td><td>{s.levels?.name || '—'}</td>
                  <td>{formatDate(s.created_at)}</td>
                </tr>
              ))}
              {!newStudentsQuery.data?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No new students</td></tr>}
            </tbody>
          </table>
        )}

        {/* Low Attendance */}
        {reportType === 'low-attendance' && (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Phone</th><th>Days Present</th><th>Total</th><th>Attendance %</th></tr></thead>
            <tbody>
              {lowAttendanceQuery.data?.map((s: any) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td><td>{s.contact_phone}</td>
                  <td>{s.present}</td><td>{s.total}</td>
                  <td><span className="badge badge-red">{s.pct}%</span></td>
                </tr>
              ))}
              {!lowAttendanceQuery.data?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No students with low attendance</td></tr>}
            </tbody>
          </table>
        )}

        {/* Fees Collected */}
        {reportType === 'fees-collected' && (
          <>
            <div className="grid grid-cols-3 gap-4 p-4 border-b">
              <div className="text-center"><p className="text-xs text-gray-500">Total Billed</p><p className="text-xl font-bold">{formatCurrency(feesCollectedQuery.data?.reduce((s: number, fc: any) => s + fc.amount, 0) || 0)}</p></div>
              <div className="text-center"><p className="text-xs text-gray-500">Collected</p><p className="text-xl font-bold text-green-600">{formatCurrency(feesCollectedQuery.data?.reduce((s: number, fc: any) => s + (fc.paid_amount || 0), 0) || 0)}</p></div>
              <div className="text-center"><p className="text-xs text-gray-500">Outstanding</p><p className="text-xl font-bold text-red-600">{formatCurrency(feesCollectedQuery.data?.reduce((s: number, fc: any) => s + (fc.amount - (fc.paid_amount || 0)), 0) || 0)}</p></div>
            </div>
            <table className="data-table">
              <thead><tr><th>Student</th><th>Due</th><th>Paid</th><th>Balance</th><th>Paid On</th></tr></thead>
              <tbody>
                {feesCollectedQuery.data?.map((fc: any) => (
                  <tr key={fc.id}>
                    <td className="font-medium">{fc.students?.name}</td>
                    <td>{formatCurrency(fc.amount)}</td>
                    <td className="text-green-600">{formatCurrency(fc.paid_amount || 0)}</td>
                    <td className={fc.amount - (fc.paid_amount || 0) > 0 ? 'text-red-600' : ''}>{formatCurrency(fc.amount - (fc.paid_amount || 0))}</td>
                    <td>{formatDate(fc.paid_date)}</td>
                  </tr>
                ))}
                {!feesCollectedQuery.data?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No fee records</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {/* Defaulters */}
        {reportType === 'fees-defaulters' && (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Phone</th><th>Amount Due</th><th>Amount Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {feesDefaultersQuery.data?.map((fc: any) => (
                <tr key={fc.id}>
                  <td className="font-medium">{fc.students?.name}</td>
                  <td>{fc.students?.contact_phone}</td>
                  <td>{formatCurrency(fc.amount)}</td>
                  <td>{formatCurrency(fc.paid_amount || 0)}</td>
                  <td className="text-red-600 font-medium">{formatCurrency(fc.amount - (fc.paid_amount || 0))}</td>
                </tr>
              ))}
              {!feesDefaultersQuery.data?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No defaulters</td></tr>}
            </tbody>
          </table>
        )}

        {/* Upcoming Competitions */}
        {reportType === 'upcoming-competitions' && (
          <table className="data-table">
            <thead><tr><th>Competition</th><th>Organized By</th><th>Location</th><th>Start Date</th><th>End Date</th></tr></thead>
            <tbody>
              {competitionsQuery.data?.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.organized_by || '—'}</td>
                  <td>{c.location || '—'}</td>
                  <td>{formatDate(c.start_date)}</td>
                  <td>{formatDate(c.end_date)}</td>
                </tr>
              ))}
              {!competitionsQuery.data?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No upcoming competitions</td></tr>}
            </tbody>
          </table>
        )}

        {/* Quarterly / Yearly Earnings */}
        {(reportType === 'quarterly-earnings' || reportType === 'yearly-earnings') && (
          <table className="data-table">
            <thead><tr><th>Month</th><th>Amount Billed</th><th>Amount Collected</th><th>Collection Rate</th></tr></thead>
            <tbody>
              {(reportType === 'quarterly-earnings' ? quarterlyQuery.data : yearlyQuery.data)?.map((r: any) => {
                const rate = r.due ? Math.round((r.collected / r.due) * 100) : 0
                return (
                  <tr key={r.month}>
                    <td className="font-medium">{format(new Date(r.month + '-01'), 'MMMM yyyy')}</td>
                    <td>{formatCurrency(r.due)}</td>
                    <td className="text-green-600">{formatCurrency(r.collected)}</td>
                    <td><span className={`badge ${rate >= 80 ? 'badge-green' : rate >= 60 ? 'badge-yellow' : 'badge-red'}`}>{rate}%</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}