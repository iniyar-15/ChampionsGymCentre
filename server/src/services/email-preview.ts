import { promises as fs } from 'fs'
import path from 'path'

const PREVIEW_DIR = path.join(process.cwd(), 'email-previews')

// Best-effort: writes the most recent outgoing email of a given type to disk
// so it can be viewed at /email-previews/{name}.html during local dev/demos.
export async function saveEmailPreview(name: string, subject: string, html: string) {
  try {
    await fs.mkdir(PREVIEW_DIR, { recursive: true })
    const wrapped = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <div style="background:#fff;border-radius:8px 8px 0 0;padding:14px 24px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px">
      Subject: <strong style="color:#1e293b">${subject}</strong>
    </div>
    <div style="background:#fff;border-radius:0 0 8px 8px;padding:8px 0 24px">${html}</div>
  </div>
</body></html>`
    await fs.writeFile(path.join(PREVIEW_DIR, `${name}.html`), wrapped, 'utf-8')
  } catch {
    // preview is a dev convenience only — never block email sending
  }
}
