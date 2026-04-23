const { Pool } = require('pg');
require('dotenv').config();

console.log('Testing database connection...');
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(client => {
    console.log('✓ Connected successfully!');
    client.release();
    return pool.query('SELECT version()');
  })
  .then(result => {
    console.log('PostgreSQL version:', result.rows[0]);
    pool.end();
  })
  .catch(err => {
    console.error('✗ Connection failed:', err.message);
    pool.end();
  });