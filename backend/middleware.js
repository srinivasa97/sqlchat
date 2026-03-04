// middleware.js - Express auth middleware
const { verifyToken } = require('./auth');

// Require valid JWT
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

// Require admin role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Check user has access to requested DB
function requireDbAccess(req, res, next) {
  const dbId = req.body.dbId || req.query.dbId;
  if (!dbId) return res.status(400).json({ error: 'No database selected' });

  if (req.user.role === 'admin') return next(); // admin sees all

  if (!req.user.assignedDbs || !req.user.assignedDbs.includes(dbId)) {
    return res.status(403).json({ error: 'You do not have access to this database' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireDbAccess };
