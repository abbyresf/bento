import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Tells the join page what an invite is for, without letting any client touch
 * pulse_invites.
 *
 * The table used to be readable by the anon role, which meant the public key
 * could list every pending invite with its email address, and anyone could
 * redeem one they were never sent. This function is what replaces that read.
 *
 * It returns the university and a masked email only. Never the full address:
 * the person opening the link already knows their own email, and anybody else
 * holding the link should not learn whose it is.
 */

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

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** j.doe@brandeis.edu -> j***e@brandeis.edu */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string') {
      return json({ error: 'Missing token.' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: invite } = await supabase
      .from('pulse_invites')
      .select('email, university, used_at, revoked_at, expires_at')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle()

    // One message for every failure mode. Distinguishing "expired" from "never
    // existed" tells someone probing tokens which guesses were close.
    if (!invite || invite.used_at || invite.revoked_at ||
        new Date(invite.expires_at) <= new Date()) {
      return json({ valid: false }, 200)
    }

    return json({
      valid: true,
      university: invite.university,
      emailMasked: maskEmail(invite.email),
      expiresAt: invite.expires_at,
    })
  } catch {
    return json({ error: 'Internal error.' }, 500)
  }
})
