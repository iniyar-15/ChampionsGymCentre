import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInYears, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAge(dob: string): number {
  return differenceInYears(new Date(), parseISO(dob))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy')
}

export function formatDateInput(date: string | null | undefined): string {
  if (!date) return ''
  return format(parseISO(date), 'yyyy-MM-dd')
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return '—'
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${m} ${ampm}`
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
}

export function getMonthStart(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'yyyy-MM-dd')
}

export function dobToDefaultPassword(dob: string): string {
  return dob.replace(/-/g, '')
}

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

export const PAYMENT_MODES = ['cash', 'online', 'cheque', 'upi', 'bank_transfer'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const GENDER_OPTIONS = ['male', 'female', 'other'] as const