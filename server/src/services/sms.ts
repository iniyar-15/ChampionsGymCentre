export async function sendSMS(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS] Not configured — would send to ${to}: ${message}`)
    return
  }

  // Normalise to E.164 for India (+91) if no country code present
  const digits = to.replace(/\D/g, '')
  const normalised = to.startsWith('+') ? to : `+91${digits.slice(-10)}`

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: normalised, From: fromNumber, Body: message }).toString(),
      }
    )
    const data: any = await resp.json()
    if (!resp.ok) {
      console.error(`[SMS] Failed to ${normalised}: ${data?.message}`)
    } else {
      console.log(`[SMS] Sent to ${normalised} (sid: ${data.sid})`)
    }
  } catch (err) {
    console.error(`[SMS] Error sending to ${normalised}:`, err)
  }
}
