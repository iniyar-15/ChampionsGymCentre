import { useId } from 'react'

/**
 * Praxis brand mark — an upward "growth through practice" arrow on a
 * rounded gradient badge, with a gold accent marking the starting point.
 */
export function PraxisMark({ className = 'w-9 h-9' }: { className?: string }) {
  const gradId = useId()

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Praxis">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradId})`} />
      <path d="M15 43 L27 30 L37 39 L49 24" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M40 24 H49 V33" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="15" cy="43" r="4.5" fill="#fbbf24" />
    </svg>
  )
}

/** "Praxis" wordmark with a gold accent on the X. */
export function PraxisWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      Pra<span className="text-amber-400">x</span>is
    </span>
  )
}
