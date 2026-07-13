import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lock CORS to the production app origin. SITE_URL is set automatically by
// Supabase from Auth → URL Configuration; override with ALLOWED_ORIGIN secret
// if you need a different value (e.g. staging).
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? Deno.env.get('SITE_URL') ?? ''

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token, password } = await req.json()

    if (!token || !password || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400)
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
      return json({ error: 'Invite link is invalid or has already been used.' }, 400)
    }

    // Create auth user with email pre-confirmed
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })

    if (authErr) {
      return json({ error: authErr.message }, 400)
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
      return json({ error: 'Failed to create admin record.' }, 500)
    }

    // Mark invite used
    await supabase
      .from('pulse_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)

    return json({ success: true })
  } catch {
    return json({ error: 'Internal error.' }, 500)
  }
})
