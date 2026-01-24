import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function listTables() {
  console.log('🔍 Listing all accessible tables...')
  
  // Try to use the OpenAPI spec endpoint which lists tables
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })
    const data = await response.json()
    console.log('--- Accessible Tables ---')
    if (data.definitions) {
      Object.keys(data.definitions).forEach(table => console.log(`- ${table}`))
    } else {
      console.log('No table definitions found in API root.')
    }
  } catch (err) {
    console.error('Error fetching API root:', err)
  }
}

listTables()
