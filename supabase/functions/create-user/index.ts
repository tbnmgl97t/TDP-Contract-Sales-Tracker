import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is an authenticated manager
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const callerClient = createClient(supabaseUrl, anonKey)
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token)
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Verify caller has manager role
    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('user_id', caller.id)
      .single()

    if (callerProfile?.role !== 'manager') {
      return new Response(JSON.stringify({ error: 'Only managers can create users' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name, role } = await req.json()
    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create auth user
    const { data, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = data.user.id

    // Insert user_profiles
    await adminClient.from('user_profiles').insert({
      user_id: userId,
      role,
      email,
      full_name,
    })

    // Upsert into people
    const peopleRole = role === 'manager' ? 'management' : role
    const { data: existing } = await adminClient
      .from('people')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      await adminClient.from('people').update({ name: full_name, role: peopleRole, active: true }).eq('id', existing.id)
    } else {
      await adminClient.from('people').insert({ name: full_name, email, role: peopleRole, active: true })
    }

    return new Response(JSON.stringify({ user_id: userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
