// Auth routes: register and login. Returns a JWT on success.
const express = require('express');
const { hashPassword, checkPassword, signToken } = require('../auth');
const { isValidEmail } = require('../validate');

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

module.exports = function authRoutes(pool) {
  const router = express.Router();

  // POST /api/auth/register — { name, email, password } -> 201 { token, user }
  router.post('/register', async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};

      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Name is required' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);
      const { rows } = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name.trim(), email, passwordHash],
      );
      const user = rows[0];
      return res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/auth/login — { email, password } -> 200 { token, user }
  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};

      if (!isValidEmail(email) || typeof password !== 'string') {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = rows[0];
      // Same message for "no such user" and "wrong password" — do not reveal
      // which one failed.
      if (!user || !(await checkPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      return res.json({ token: signToken(user.id), user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  return router;
};
