
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

console.log('Using Supabase URL:', supabaseUrl)
console.log('Using Service Key (starts with):', supabaseServiceKey.substring(0, 10) + '...')


const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const email = 'nxme176@gmail.com'

async function grantAdmin() {
  console.log(`Looking up user: ${email}...`)

  // 1. Find User ID
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    console.error('Error listing users:', listError)
    return
  }

  const user = users.find(u => u.email === email)

  if (!user) {
    console.error(`User ${email} not found! Please sign up first.`)
    return
  }

  console.log(`Found user ID: ${user.id}`)
  console.log(`Current Metadata:`, user.app_metadata)

  // 2. Update User Metadata
  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { app_metadata: { ...user.app_metadata, role: 'admin' } }
  )

  if (updateError) {
    console.error('Error updating user:', updateError)
    return
  }

  console.log('✅ Success! Admin role granted.')
  console.log('New Metadata:', updatedUser.user.app_metadata)
}

grantAdmin()
