/**
 * Server-Sent Events (SSE) for real-time notifications.
 *
 * Architecture:
 *   clients: Map<userId, Set<{req, res}>> — one Set per user (supports multi-tab)
 *   broadcast(userId, payload)              — push to all connected tabs
 *   GET /api/sse-stream                  — long-lived SSE endpoint (auth required)
 *
 * nginx: location /api/sse-stream must have proxy_read_timeout 86400s
 *
 * Usage:
 *   const { broadcast, sendHeartbeat, SSEHandler } = require('./sse/notifications');
 *   app.get('/api/sse-stream', SSEHandler);
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || "Serveravatar_jwt_secret_key_2026";

/**
 * Map<userId, Set<{req, res}>> — active SSE connections per logged-in user.
 */
const clients = new Map();

function addClient(userId, req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  console.log(`[SSE] Client connected  userId=${userId}  totalTabs=${clients.get(userId).size}`);
}

function removeClient(userId, res) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  userClients.delete(res);
  if (userClients.size === 0) {
    clients.delete(userId);
    console.log(`[SSE] All tabs closed for userId=${userId}`);
  } else {
    console.log(`[SSE] Client disconnected  userId=${userId}  remainingTabs=${userClients.size}`);
  }
}

/** Broadcast a notification payload to all open SSE connections for a user. */
function broadcast(userId, payload) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of userClients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      console.warn(`[SSE] Broadcast error userId=${userId}:`, err.message);
      userClients.delete(res);
    }
  }
  if (clients.get(userId)?.size === 0) clients.delete(userId);
}

/** Send heartbeat to all connected clients. */
function sendHeartbeat() {
  const now = Date.now();
  for (const [userId, userClients] of clients.entries()) {
    for (const res of userClients) {
      try { res.write(`: heartbeat ${now}\n\n`); } catch { userClients.delete(res); }
    }
    if (userClients.size === 0) clients.delete(userId);
  }
}

/** Authenticate SSE request via ?token= query param (EventSource has no header support). */
async function authenticateSSE(req) {
  const token = req.query.token;
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.jti) {
      const [revoked] = await pool.query(
        'SELECT 1 FROM jwt_denylist WHERE jti = ? LIMIT 1', [decoded.jti]
      );
      if (revoked.length > 0) return null;
    }
    const [users] = await pool.query(
      'SELECT id, status FROM users WHERE id = ?', [decoded.userId]
    );
    if (users.length === 0 || users[0].status === 'inactive') return null;
    return users[0];
  } catch {
    return null;
  }
}

/** Express route handler for GET /api/sse-stream */
const SSEHandler = async (req, res) => {
  const user = await authenticateSSE(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  addClient(user.id, req, res);
  req.on('close', () => removeClient(user.id, res));
  req.on('error', () => removeClient(user.id, res));
};

module.exports = { broadcast, sendHeartbeat, SSEHandler };
