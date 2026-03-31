import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkInfrastructure() {
  console.log('🔍 Checking Supabase Table Data...')
  
  const tables = ['shops', 'buildings', 'events']
  
  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: false })
      .limit(1)

    if (error) {
      console.error(`❌ Table [${table}]: ERROR - ${error.code} - ${error.message}`)
    } else {
      console.log(`✅ Table [${table}]: FOUND (${count} total rows). Sample name: ${data[0]?.name || 'No data yet'}`)
    }
  }

  console.log('\n--- Status Check Complete ---')
}

checkInfrastructure()
