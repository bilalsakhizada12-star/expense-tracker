// Express app factory. Takes a database pool so tests can pass in an
// in-memory pool while the real server passes the real one.
const express = require('express');
const path = require('path');
const { requireAuth } = require('./auth');
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');

function createApp(pool) {
  const app = express();

  app.use(express.json());

  // Static frontend (public/index.html, app.js, styles.css).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(pool));
  app.use('/api/expenses', requireAuth, expenseRoutes(pool));
  app.get('/api/summary', requireAuth, expenseRoutes.summary(pool));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
