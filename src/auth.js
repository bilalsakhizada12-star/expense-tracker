// Password hashing and JWT handling.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function checkPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Express middleware: rejects requests without a valid Bearer token and
// attaches the authenticated user's id as req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { hashPassword, checkPassword, signToken, requireAuth };
