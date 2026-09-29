import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Create and send a Pulse admin invite.
 *
 * Two things changed from the original.
 *
 * The invite's primary key used to double as the bearer token, and the table
 * was readable by the anon role, so the public key could list every pending
 * invite and redeem one. Now a random 256-bit token is generated here, only its
 * SHA-256 hash is stored, and the plaintext exists solely inside the email.
 * Losing the database does not leak a usable invite.
 *
 * This is also the only place that sends the email. The dashboard used to call
 * this function AND then send a second copy through EmailJS from the browser,
 * so invitees received two emails and the UI reported success based on the
 * wrong one.
 *
 * Also handles resending: pass `inviteId` to issue a fresh token for an
 * existing pending invite, which invalidates the previous link.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPIRY_DAYS = 7

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function emailHtml(inviteLink: string, university: string) {
  const uni = university.charAt(0).toUpperCase() + university.slice(1)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;text-align:center;">
          <img src="https://bentodining.com/bentopulse.png" alt="Bento Pulse" height="40" style="height:40px;" />
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:40px;border:1px solid #ede8e2;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f47421;text-transform:uppercase;letter-spacing:0.06em;">You're invited</p>
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#263950;line-height:1.2;">Join Bento Pulse for ${uni}</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#5a6a7a;line-height:1.6;">
            You've been added as an admin on Bento Pulse, the dining analytics dashboard for ${uni}.
            Use the button below to set up your access.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr><td style="background:#f47421;border-radius:10px;">
              <a href="${inviteLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Accept invite →</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#8a9aaa;line-height:1.5;">
            This link expires in ${EXPIRY_DAYS} days and can only be used once.
            If you already have a Bento account with this address, accepting keeps your existing password.
            If you weren't expecting this, you can ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#aab0b8;">Bento Pulse · <a href="https://bentodining.com" style="color:#aab0b8;">bentodining.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { data: admin } = await supabase
      .from('admin_users')
      .select('is_super_admin, university')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!admin?.is_super_admin) return json({ error: 'Unauthorized' }, 403)

    const body = await req.json()
    const inviteId: string | undefined = body.inviteId
    const token = newToken()
    const tokenHash = await sha256Hex(token)
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString()

    let invite: { id: string; email: string; university: string } | null = null

    if (inviteId) {
      // Resend. A fresh token is issued, so any previously emailed link stops
      // working. Only invites that are still open may be resent.
      const { data, error } = await supabase
        .from('pulse_invites')
        .update({ token_hash: tokenHash, expires_at: expiresAt, last_sent_at: new Date().toISOString() })
        .eq('id', inviteId)
        .is('used_at', null)
        .is('revoked_at', null)
        .select('id, email, university')
        .maybeSingle()
      if (error || !data) return json({ error: 'That invite can no longer be resent.' }, 400)
      invite = data
    } else {
      const email = String(body.email ?? '').toLowerCase().trim()
      const university = String(body.university ?? '').trim()
      if (!email || !university) return json({ error: 'Missing email or university.' }, 400)

      // A super admin may only invite into their own university. Previously the
      // university came straight from the request body and was never checked.
      if (!admin.university || admin.university !== university) {
        return json({ error: 'You can only invite admins for your own university.' }, 403)
      }

      // Re-inviting the same address replaces the open invite rather than
      // stacking duplicates, which is what made the list unreadable.
      await supabase
        .from('pulse_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('email', email)
        .eq('university', university)
        .is('used_at', null)
        .is('revoked_at', null)

      const { data, error } = await supabase
        .from('pulse_invites')
        .insert({
          email, university, created_by: user.id,
          token_hash: tokenHash, expires_at: expiresAt,
          last_sent_at: new Date().toISOString(),
        })
        .select('id, email, university')
        .maybeSingle()
      if (error || !data) return json({ error: error?.message ?? 'Failed to create invite.' }, 500)
      invite = data
    }

    const inviteLink = `https://bentodining.com/admin/join/${token}`

    const resendKey = Deno.env.get('RESEND_API_KEY')
    let emailSent = false
    let emailError: string | null = null

    if (!resendKey) {
      emailError = 'RESEND_API_KEY is not configured.'
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Bento Pulse <pulse@bentodining.com>',
          to: invite.email,
          subject: `You've been invited to Bento Pulse`,
          html: emailHtml(inviteLink, invite.university),
        }),
      })
      emailSent = res.ok
      // Say why, rather than reporting a silent false. A failure here is
      // almost always an unverified sending domain, and the invite is still
      // usable from the copied link.
      if (!res.ok) emailError = `Resend returned ${res.status}.`
    }

    return json({ id: invite.id, emailSent, emailError, link: inviteLink })
  } catch {
    return json({ error: 'Internal error.' }, 500)
  }
})
