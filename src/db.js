// Database connection and schema setup.
//
// Uses a real PostgreSQL database when DATABASE_URL is set. Otherwise it falls
// back to an in-memory database (pg-mem) so the app runs with zero setup —
// handy for a quick demo or for the test suite. In-memory mode keeps nothing
// after the process stops, so use a real database for real data.
const { Pool } = require('pg');

let pool = null;

function createPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  } else {
    console.warn('[db] DATABASE_URL is not set — running with an in-memory database (demo mode, data is not saved).');
    const { newDb } = require('pg-mem');
    const memDb = newDb();
    const { Pool: MemPool } = memDb.adapters.createPg();
    pool = new MemPool();
  }
  return pool;
}

const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Rent',
  'Utilities',
  'Entertainment',
  'Health',
  'Shopping',
  'Other',
];

// Creates the tables if they do not exist and seeds the default categories.
// Safe to run on every start.
async function initDb(dbPool) {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories (id),
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      expense_date DATE NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  for (const name of DEFAULT_CATEGORIES) {
    await dbPool.query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name],
    );
  }
}

module.exports = { createPool, initDb, DEFAULT_CATEGORIES };
