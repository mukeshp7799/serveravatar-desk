/**
 * activityService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized, reusable Activity / Audit Log service.
 *
 * All modules call logActivity() to record important user actions.
 * It is intentionally fire-and-forget (catches its own errors so it
 * never disrupts the calling code).
 *
 * Usage:
 *   const { logActivity } = require('../services/activityService');
 *   logActivity({ req, module: 'Employee', action: 'Created', description: '...' });
 *   logActivity({ req, module: 'Leave', action: 'Approved', description: '...', newValue: { ... } });
 * ─────────────────────────────────────────────────────────────────────────────
 */

const pool = require('../config/database');

/**
 * @param {Object} params
 * @param {Object}  params.req           - Express request object (provides user_id + ip)
 * @param {string}  params.module        - Logical module name, e.g. 'Employee', 'Leave', 'Calendar'
 * @param {string}  params.action        - Action verb, e.g. 'Created', 'Updated', 'Deleted', 'Approved'
 * @param {string}  params.description  - Human-readable summary (be concise)
 * @param {Object}  [params.previousValue] - Entity state before the change (plain object or null)
 * @param {Object}  [params.newValue]      - Entity state after the change (plain object or null)
 */
async function logActivity({ req, module, action, description, previousValue = null, newValue = null }) {
  try {
    const userId = req?.user?.id ? Number(req.user.id) : null;
    const ipAddress = extractIP(req);

    if (!userId) return; // Cannot log without knowing who performed the action

    const prevJSON = previousValue !== null ? JSON.stringify(previousValue) : null;
    const newJSON  = newValue     !== null ? JSON.stringify(newValue)     : null;

    await pool.query(
      `INSERT INTO activity_logs (user_id, module, action, description, ip_address, previous_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, module, action, description, ipAddress, prevJSON, newJSON]
    );
  } catch (err) {
    // Fire-and-forget: never throw from here
    console.error('[activityService] Failed to write activity log:', err.message);
  }
}

/**
 * Returns the best-effort client IP address from the request.
 * Handles direct connections and proxied requests (X-Forwarded-For, etc.)
 */
function extractIP(req) {
  const direct   = req?.headers?.['x-forwarded-for'];
  const realIP    = req?.headers?.['x-real-ip'];
  const remoteAddr = req?.socket?.remoteAddress || req?.connection?.remoteAddress || null;

  if (direct) {
    // X-Forwarded-For: first comma-separated IP (client IP)
    return String(direct).split(',')[0].trim();
  }
  if (realIP) return String(realIP).trim();
  if (remoteAddr) {
    // Strip IPv6 prefix (::ffff:) if present
    return remoteAddr.replace(/^::ffff:/, '');
  }
  return null;
}

module.exports = { logActivity };
