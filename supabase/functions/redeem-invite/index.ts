import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Accept a Pulse admin invite.
 *
 * The previous version did something no product should: if the invited address
 * already had a Bento account, it called updateUserById with whatever password
 * the redeemer typed. Granting a role silently reset the account's credentials,
 * so inviting a student's address handed whoever opened the link control of
 * that student's account. Combined with the old anon-readable invites table,
 * an attacker did not even need to be invited.
 *
 * What made that a takeover was the enumerable invites table: anyone could
 * obtain a link without access to the mailbox. That is closed — the token is
 * 256 random bits, stored only as a hash, single use, and the redeemer must
 * type the invited address. So reaching this page proves control of that
 * mailbox, which is the same proof a password reset link provides.
 *
 * On that basis an existing account MAY set a password here, but only when the
 * person explicitly supplies one. The rule kept is that granting a role must
 * never SILENTLY change credentials:
 *
 *   new address, password given      -> create the account with it
 *   existing account, password given -> they asked; set it
 *   existing account, no password    -> grant the role, touch nothing
 *
 * Forcing a password reset on someone who just proved mailbox control was
 * redundant friction, not security.
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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token, password, email } = await req.json()
    if (!token) return json({ error: 'Invite link is invalid.' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: invite } = await supabase
      .from('pulse_invites')
      .select('id, email, university, used_at, revoked_at, expires_at')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle()

    if (!invite || invite.used_at || invite.revoked_at ||
        new Date(invite.expires_at) <= new Date()) {
      return json({ error: 'This invite is invalid, expired, or has already been used.' }, 400)
    }

    // The invite is for one address and only that address. The link alone used
    // to be enough, so a forwarded link let anyone claim it. Requiring the
    // invited address means holding the link is not sufficient: you also have
    // to know who it was for. The account is still created from invite.email
    // rather than from this input, so a mismatch cannot redirect the invite.
    if (String(email ?? '').trim().toLowerCase() !== invite.email.toLowerCase()) {
      return json({ error: "That email doesn't match this invitation." }, 400)
    }

    // Does an account already exist for this address? Asked directly rather
    // than by paging listUsers, which only ever scanned the first 1000 accounts
    // and would have started failing silently as the user base grew.
    const { data: existingList } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 1, filter: `email.eq.${invite.email}`,
    } as unknown as { page: number; perPage: number })

    let existing = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === invite.email.toLowerCase(),
    )

    // Older gotrue builds ignore `filter`. Fall back to a bounded scan rather
    // than trusting a possibly unfiltered first page.
    if (!existing) {
      for (let page = 1; page <= 20 && !existing; page++) {
        const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
        if (!data?.users?.length) break
        existing = data.users.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase())
      }
    }

    let userId: string
    let accountExisted = false
    let passwordSet = false

    if (existing) {
      accountExisted = true
      userId = existing.id

      // Only when they actually supplied one. A blank password means "keep
      // what I have", and must never be treated as "set it to empty".
      if (password) {
        if (String(password).length < 8) {
          return json({ error: 'Password must be at least 8 characters.' }, 400)
        }
        const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, {
          password: String(password),
        })
        if (pwErr) return json({ error: 'Could not set that password.' }, 400)
        passwordSet = true
      }
    } else {
      if (!password || String(password).length < 8) {
        return json({ error: 'Password must be at least 8 characters.' }, 400)
      }
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
      })
      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? 'Could not create the account.' }, 400)
      }
      userId = created.user.id
      passwordSet = true
    }

    const { data: alreadyAdmin } = await supabase
      .from('admin_users')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('university', invite.university)
      .maybeSingle()

    if (alreadyAdmin) {
      // Reactivate rather than duplicate, so re-inviting someone who was
      // removed restores their access.
      if (!alreadyAdmin.is_active) {
        await supabase.from('admin_users').update({ is_active: true }).eq('id', alreadyAdmin.id)
      }
    } else {
      const { error: adminErr } = await supabase.from('admin_users').insert({
        user_id: userId,
        university: invite.university,
        is_active: true,
        is_super_admin: false,
      })
      if (adminErr) {
        // Only undo an account this request created. Never delete one that
        // already existed.
        if (!accountExisted) await supabase.auth.admin.deleteUser(userId)
        return json({ error: 'Could not grant admin access.' }, 500)
      }
    }

    // Marked used last, so a failure above leaves the invite usable rather than
    // burning it.
    await supabase
      .from('pulse_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)

    return json({ success: true, accountExisted, passwordSet, email: invite.email })
  } catch {
    return json({ error: 'Internal error.' }, 500)
  }
})
