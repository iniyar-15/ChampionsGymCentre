import { useState } from 'react'
import { PraxisMark, CustomerName, PoweredByPraxis } from '@/components/branding/PraxisLogo'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { isConfigured } from '@/lib/supabase'

export default function StudentLoginPage() {
  const { signInWithPhone } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signInWithPhone(phone, password)
    if (result.error) {
      setError('Invalid phone number or password')
    } else {
      navigate('/student')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <PraxisMark className="w-24 h-24 rounded-2xl mb-4 mx-auto bg-white p-1" />
          <h1 className="text-2xl font-bold text-white"><CustomerName /></h1>
          <p className="text-slate-400 mt-1 text-sm">Student Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!isConfigured && (
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-semibold mb-1">⚙️ Supabase not configured</p>
              <p>Edit <code className="bg-amber-100 px-1 rounded">client/.env.local</code> and set your <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.</p>
            </div>
          )}
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Student Sign in</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-gray-400 font-normal">(default: date of birth YYYYMMDD)</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isConfigured}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/login" className="text-sm text-blue-600 hover:underline">
              ← Staff login
            </a>
          </div>
        </div>

        <div className="mt-6 text-center flex items-center justify-center gap-1.5">
          <PraxisMark className="w-5 h-5 rounded opacity-60" />
          <PoweredByPraxis className="text-slate-500 text-xs" />
        </div>
      </div>
    </div>
  )
}