import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/FormField'
import PageHeader from '@/components/ui/PageHeader'
import { Upload, Save } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Config = {
  upi_id: string; upi_name: string; upi_qr_url: string
  bank_name: string; account_number: string; ifsc_code: string
  account_holder: string; branch: string
}

const empty: Config = {
  upi_id: '', upi_name: '', upi_qr_url: '',
  bank_name: '', account_number: '', ifsc_code: '', account_holder: '', branch: '',
}

export default function PaymentConfigPage() {
  const [form, setForm] = useState<Config>({ ...empty })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/payment-config`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setForm({ ...empty, ...data })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleQRUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { data, error: uploadError } = await supabase.storage
        .from('payment-assets')
        .upload('upi-qr.png', file, { upsert: true, contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)
      const { data: { publicUrl } } = supabase.storage.from('payment-assets').getPublicUrl(data.path)
      setForm(f => ({ ...f, upi_qr_url: publicUrl }))
    } catch (err: any) {
      setError(`QR upload failed: ${err.message}. Make sure a public bucket named "payment-assets" exists in Supabase Storage.`)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch(`${API_URL}/api/payment-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-400 py-8 text-center">Loading…</div>

  return (
    <div>
      <PageHeader title="Payment Configuration" subtitle="Configure UPI and bank transfer details shown to students" />

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        {/* UPI Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">UPI Details</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="UPI ID" hint="e.g. gymname@okicici">
                <Input value={form.upi_id} onChange={e => setForm(f => ({ ...f, upi_id: e.target.value }))} placeholder="name@bank" />
              </FormField>
              <FormField label="UPI Name" hint="Name shown on UPI app">
                <Input value={form.upi_name} onChange={e => setForm(f => ({ ...f, upi_name: e.target.value }))} placeholder="Champions Gym Centre" />
              </FormField>
            </div>

            <FormField label="UPI QR Code Image">
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    <Upload size={15} />
                    {uploading ? 'Uploading…' : 'Upload QR Code Image'}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleQRUpload} disabled={uploading} />
                </label>
                <p className="text-xs text-gray-500">
                  Requires a public bucket named <code className="bg-gray-100 px-1 rounded">payment-assets</code> in Supabase Storage.
                </p>
                {form.upi_qr_url && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Current QR Code:</p>
                    <img src={form.upi_qr_url} alt="UPI QR" className="w-36 h-36 object-contain border rounded-lg p-2" />
                  </div>
                )}
                <FormField label="Or paste QR image URL directly">
                  <Input value={form.upi_qr_url} onChange={e => setForm(f => ({ ...f, upi_qr_url: e.target.value }))} placeholder="https://..." />
                </FormField>
              </div>
            </FormField>
          </div>
        </div>

        {/* Bank Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Bank Account Details</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Account Holder Name">
                <Input value={form.account_holder} onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))} placeholder="Champions Gym Centre" />
              </FormField>
              <FormField label="Bank Name">
                <Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="HDFC Bank" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Account Number">
                <Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="XXXXXXXXXXXX" />
              </FormField>
              <FormField label="IFSC Code">
                <Input value={form.ifsc_code} onChange={e => setForm(f => ({ ...f, ifsc_code: e.target.value }))} placeholder="HDFC0001234" />
              </FormField>
            </div>
            <FormField label="Branch">
              <Input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} placeholder="Anna Nagar, Chennai" />
            </FormField>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">Payment configuration saved successfully.</div>}

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            <Save size={15} /> Save Configuration
          </Button>
        </div>
      </div>
    </div>
  )
}
