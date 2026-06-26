/** Champions Gymnastics Center logo mark. */
export function PraxisMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <img
      src="/favicon.webp"
      alt="Champions Gymnastics Center"
      className={`object-contain ${className}`}
    />
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

/** Customer-facing gym name displayed across the app. */
export function CustomerName({ className = '' }: { className?: string }) {
  return <span className={className}>Champions Gymnastics Center</span>
}

/** Small attribution shown in sidebar footer and login pages. */
export function PoweredByPraxis({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      Powered by Pra<span className="text-amber-400">x</span>is
    </span>
  )
}
