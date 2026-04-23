const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('Testing Supabase direct connection...');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Try to query a table that should exist if the schema was applied
supabase.from('users').select('count', { head: true })
  .then(({ data, error, count }) => {
    if (error) {
      console.log('Error querying users table:', error.message);
      console.log('Error code:', error.code);
      
      // Try to see what tables exist
      return supabase.rpc('exec_sql', { sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" });
    } else {
      console.log('Successfully queried users table. Count:', count);
    }
  })
  .then(({ data, error }) => {
    if (error) {
      console.log('RPC error (expected if function doesn\\'t exist):', error.message);
    } else {
      console.log('RPC result:', data);
    }
  })
  .catch(err => {
    console.log('Unexpected error:', err);
  });