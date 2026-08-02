import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Accept any origin listed in ALLOWED_ORIGINS (comma-separated) or SITE_URL.
// Set the ALLOWED_ORIGINS secret in Supabase → Edge Functions → Secrets if you
// need to support multiple domains (e.g. bentodining.com and a staging URL).
const allowedOrigins = new Set(
  [
    Deno.env.get('ALLOWED_ORIGINS') ?? '',
    Deno.env.get('ALLOWED_ORIGIN')  ?? '',
    Deno.env.get('SITE_URL')        ?? '',
  ]
    .flatMap(s => s.split(','))
    .map(s => s.trim())
    .filter(Boolean)
)

function corsHeaders(origin: string) {
  const allow = allowedOrigins.has(origin) ? origin : (allowedOrigins.values().next().value ?? '')
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })

  try {
    const { token, password } = await req.json()

    if (!token || !password || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400, origin)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Validate invite
    const { data: invite, error: inviteErr } = await supabase
      .from('pulse_invites')
      .select('*')
      .eq('id', token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (inviteErr || !invite) {
      return json({ error: 'Invite link is invalid or has already been used.' }, 400, origin)
    }

    // Create auth user with email pre-confirmed
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })

    if (authErr) {
      return json({ error: authErr.message }, 400, origin)
    }

    // Create admin record
    const { error: adminErr } = await supabase.from('admin_users').insert({
      user_id: authData.user.id,
      university: invite.university,
      is_active: true,
      is_super_admin: false,
    })

    if (adminErr) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return json({ error: 'Failed to create admin record.' }, 500, origin)
    }

    // Mark invite used
    await supabase
      .from('pulse_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)

    return json({ success: true }, 200, origin)
  } catch {
    return json({ error: 'Internal error.' }, 500, origin)
  }
})
