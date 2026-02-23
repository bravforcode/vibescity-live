import dotenv from 'dotenv'
import path from 'path'

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const EMAIL = 'nxme176@gmail.com'

// Construct Admin API URL manually
const ADMIN_API_URL = `${supabaseUrl}/auth/v1/admin/users`

async function grantAdmin() {
  console.log(`Target: ${ADMIN_API_URL}`)

  // 1. List Users to find ID
  console.log(`Searching for ${EMAIL}...`)

  try {
    const listRes = await fetch(ADMIN_API_URL, {
        method: 'GET',
        headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!listRes.ok) {
        const text = await listRes.text();
        console.error(`Error listing users: ${listRes.status} ${listRes.statusText}`);
        console.error('Response Body:', text);
        return;
    }

    const { users } = await listRes.json();
    const user = users.find(u => u.email === EMAIL);

    if (!user) {
        console.error('User not found in list.');
        return;
    }

    console.log(`Found User ID: ${user.id}`);

    // 2. Update User
    const updateUrl = `${ADMIN_API_URL}/${user.id}`;

    // Payload Structure for `updateUserById`
    // https://supabase.github.io/gotrue-js/classes/GoTrueAdminApi.html#updateUserById
    // The payload is typically: { app_metadata: { ... }, user_metadata: { ... } }

    const updateRes = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            app_metadata: {
                ...user.app_metadata,
                role: 'admin'
            }
        })
    });

    if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error(`Error updating user: ${updateRes.status} ${updateRes.statusText}`);
        console.error(text);
        return;
    }

    const updatedUser = await updateRes.json(); // May return full user object or simplified
    console.log('✅ ANY SUCCESS! Admin role granted.');
    console.log('New Metadata:', updatedUser.app_metadata || (updatedUser.user && updatedUser.user.app_metadata));

  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

grantAdmin();
