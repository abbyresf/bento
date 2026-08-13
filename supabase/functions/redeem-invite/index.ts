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
      console.error('Invite lookup failed:', inviteErr?.message)
      return json({ error: 'Invite link is invalid or has already been used.' }, 400)
    }

    // Try to create a new auth user with the invited email
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })

    let userId: string

    if (authErr) {
      // If an account with this email already exists (e.g. a student account),
      // find that user and update their password so they can log in as admin.
      const alreadyExists =
        authErr.message?.toLowerCase().includes('already') ||
        authErr.message?.toLowerCase().includes('exists') ||
        authErr.status === 422

      if (!alreadyExists) {
        console.error('createUser failed:', authErr.message)
        return json({ error: authErr.message }, 400)
      }

      // Look up the existing user by email
      const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (listErr) {
        console.error('listUsers failed:', listErr.message)
        return json({ error: 'Failed to locate existing account. Please contact support.' }, 500)
      }

      const existing = usersData.users.find(
        (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
      )

      if (!existing) {
        console.error('User not found after alreadyExists error for:', invite.email)
        return json({ error: 'Account lookup failed. Please contact support.' }, 500)
      }

      // Update their password to what they entered on the invite form
      const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
      })

      if (updateErr) {
        console.error('updateUserById failed:', updateErr.message)
        return json({ error: 'Failed to update account. Please contact support.' }, 500)
      }

      userId = existing.id
    } else {
      userId = authData.user.id
    }

    // Check if admin record already exists for this user + university
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .eq('university', invite.university)
      .single()

    if (!existingAdmin) {
      const { error: adminErr } = await supabase.from('admin_users').insert({
        user_id: userId,
        university: invite.university,
        is_active: true,
        is_super_admin: false,
      })

      if (adminErr) {
        console.error('admin_users insert failed:', adminErr.message)
        // Only roll back if we created a brand-new auth user
        if (!authErr) {
          await supabase.auth.admin.deleteUser(userId)
        }
        return json({ error: 'Failed to create admin record.' }, 500)
      }
    }

    // Mark invite used
    await supabase
      .from('pulse_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)

    return json({ success: true })
  } catch (err) {
    console.error('Unhandled error in redeem-invite:', err)
    return json({ error: 'Internal error.' }, 500)
  }
})
