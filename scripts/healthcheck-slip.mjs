#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const gql = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

async function run() {
  // Trigger healthcheck function if exists (best-effort)
  try {
    await gql('/functions/v1/easyslip-healthcheck', { method: 'POST' });
    console.log('Healthcheck invoked.');
  } catch (err) {
    console.warn('Healthcheck invoke skipped:', err.message);
  }

  // Read latest slip_health_checks
  const { data, error } = await gql('/rest/v1/slip_health_checks?order=checked_at.desc&limit=5');
  if (error) throw error;
  console.log('Recent slip_health_checks:');
  console.table(data);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
