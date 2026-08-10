import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function emailHtml(inviteLink: string, university: string) {
  const uni = university.charAt(0).toUpperCase() + university.slice(1)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f4;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:32px;text-align:center;">
          <img src="https://bentodining.com/bentopulse.png" alt="Bento Pulse" height="40" style="height:40px;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;padding:40px;border:1px solid #ede8e2;">

          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f47421;text-transform:uppercase;letter-spacing:0.06em;">
            You're invited
          </p>
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#263950;line-height:1.2;">
            Join Bento Pulse for ${uni}
          </h1>
          <p style="margin:0 0 32px;font-size:15px;color:#5a6a7a;line-height:1.6;">
            You've been added as an admin on Bento Pulse — the dining analytics dashboard for ${uni}.
            Click the button below to create your account.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr><td style="background:#f47421;border-radius:10px;">
              <a href="${inviteLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                Create account →
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#8a9aaa;line-height:1.5;">
            This link expires in 24 hours and can only be used once. If you weren't expecting this invite, you can ignore this email.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#aab0b8;">
            Bento Pulse · <a href="https://bentodining.com" style="color:#aab0b8;">bentodining.com</a>
          </p>
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
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Validate caller is an active super admin
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { data: admin } = await supabase
      .from('admin_users')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!admin?.is_super_admin) return json({ error: 'Unauthorized' }, 403)

    const { email, university } = await req.json()
    if (!email || !university) return json({ error: 'Missing email or university.' }, 400)

    // Create invite record
    const { data: invite, error: inviteErr } = await supabase
      .from('pulse_invites')
      .insert({ email: email.toLowerCase().trim(), university, created_by: user.id, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
      .select()
      .single()

    if (inviteErr || !invite) {
      return json({ error: inviteErr?.message ?? 'Failed to create invite.' }, 500)
    }

    const inviteLink = `https://bentodining.com/admin/join/${invite.id}`

    // Send email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    let emailSent = false

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bento Pulse <pulse@bentodining.com>',
          to: email.toLowerCase().trim(),
          subject: `You've been invited to Bento Pulse`,
          html: emailHtml(inviteLink, university),
        }),
      })
      emailSent = res.ok
    }

    return json({ id: invite.id, emailSent, link: inviteLink })
  } catch {
    return json({ error: 'Internal error.' }, 500)
  }
})
