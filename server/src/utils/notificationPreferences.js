/**
 * Notification Preferences helper.
 * Checks whether a given notification type is enabled for a user
 * before that notification is inserted.
 *
 * Maps notification types → preference keys:
 *   leave_request / leave_approved / leave_rejected / leave_cancelled
 *     → leave_updates
 *   announcement_published
 *     → company_announcements
 *   new_message (project discussions)
 *     → project_task_notifications
 *   (mention type is always sent — direct @mention is opt-in by nature)
 */

const pool = require('../config/database');

/**
 * Returns true if the notification type is allowed for this user.
 * Defaults to true (notify) if no preference record exists.
 *
 * @param {number} userId
 * @param {string} notificationType  — e.g. 'leave_request', 'announcement_published'
 * @returns {Promise<boolean>}
 */
async function isNotificationAllowed(userId, notificationType) {
  // Map notification types to preference keys
  const typeToPreference = {
    leave_request:       'leave_updates',
    leave_approved:      'leave_updates',
    leave_rejected:      'leave_updates',
    leave_cancelled:     'leave_updates',
    announcement_published: 'company_announcements',
    new_message:          'project_task_notifications',
    attendance_reminder:  'attendance_reminders',
  };

  const preferenceKey = typeToPreference[notificationType];
  if (!preferenceKey) {
    // Unknown type — allow by default
    return true;
  }

  try {
    const [rows] = await pool.query(
      'SELECT ?? AS val FROM notification_preferences WHERE user_id = ?',
      [preferenceKey, userId]
    );
    if (rows.length === 0) {
      // No preferences record — default to allowed
      return true;
    }
    return !!rows[0].val;
  } catch (err) {
    console.error('[notificationPreferences] Error checking preference:', err.message);
    // On error, allow notification (fail open)
    return true;
  }
}

/**
 * Conditionally insert a notification row only if the user has that preference enabled.
 * Accepts the same arguments as pool.query for an INSERT statement.
 *
 * @param {number}   userId
 * @param {string}   notificationType
 * @param {string}   insertSql   — INSERT SQL (values replaced with ? placeholders)
 * @param {any[]}    insertParams — parameters for the INSERT
 */
async function insertNotificationIfAllowed(userId, notificationType, insertSql, insertParams) {
  if (!(await isNotificationAllowed(userId, notificationType))) {
    return false; // user disabled this type
  }
  try {
    await pool.query(insertSql, insertParams);
    return true;
  } catch (err) {
    console.error('[notificationPreferences] Failed to insert notification:', err.message);
    return false;
  }
}

module.exports = { isNotificationAllowed, insertNotificationIfAllowed };
