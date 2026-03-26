const { Client } = require('pg');

async function checkOrders() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });

  try {
    await client.connect();

    // Check indexes
    const idxRes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'orders';
    `);
    console.log("INDEXES:", idxRes.rows);

    // Check constraints
    const conRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'orders';
    `);
    console.log("CONSTRAINTS:", conRes.rows);

    // Check views
    const viewRes = await client.query(`
      SELECT viewname, definition
      FROM pg_views
      WHERE definition ILIKE '%orders%';
    `);
    // filter for views that actually use orders.status
    const relevantViews = viewRes.rows.filter(v =>
      v.definition.includes('status') || v.definition.includes('orders')
    );
    console.log("VIEWS:", relevantViews.map(v => v.viewname));

    // Check policies
    const polRes = await client.query(`
      SELECT policyname, qual, with_check
      FROM pg_policies
      WHERE tablename = 'orders';
    `);
    console.log("POLICIES:", polRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkOrders();
