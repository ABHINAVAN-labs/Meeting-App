const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('Testing Supabase connection...');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test with a simple query
supabase.auth.getUser('test-token')
  .then(({ data, error }) => {
    if (error) {
      console.log('Auth test - Expected error (invalid token):', error.message);
      // This is expected since we're using a fake token
      // Now test if we can at least make a request
      return supabase.from('pg_tables').select('*').limit(1);
    }
    console.log('Auth test data:', data);
  })
  .then(({ data, error }) => {
    if (error) {
      console.log('Database query error:', error.message);
      console.log('Error code:', error.code);
      return;
    }
    console.log('Database query successful:', data);
  })
  .catch(err => {
    console.log('Unexpected error:', err);
  });