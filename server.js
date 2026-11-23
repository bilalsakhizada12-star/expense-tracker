// Entry point: loads config, connects to the database, starts the server.
require('dotenv').config();

const { createPool, initDb } = require('./src/db');
const { createApp } = require('./src/app');

async function main() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and set a secret.');
    process.exit(1);
  }

  const pool = createPool();
  await initDb(pool);

  const app = createApp(pool);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Expense Tracker running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
