const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/notification-preferences — get current user's notification preferences
router.get('/', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      // Return defaults if not yet set
      return res.json({
        preferences: {
          leave_updates: true,
          attendance_reminders: true,
          company_announcements: true,
          project_task_notifications: true,
        },
      });
    }
    const row = rows[0];
    res.json({
      preferences: {
        leave_updates: !!row.leave_updates,
        attendance_reminders: !!row.attendance_reminders,
        company_announcements: !!row.company_announcements,
        project_task_notifications: !!row.project_task_notifications,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/notification-preferences — update current user's notification preferences
router.put('/', auth, async (req, res, next) => {
  try {
    const { leave_updates, attendance_reminders, company_announcements, project_task_notifications } = req.body;

    // Upsert: INSERT ON DUPLICATE KEY UPDATE
    await pool.query(
      `INSERT INTO notification_preferences
         (user_id, leave_updates, attendance_reminders, company_announcements, project_task_notifications)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         leave_updates = VALUES(leave_updates),
         attendance_reminders = VALUES(attendance_reminders),
         company_announcements = VALUES(company_announcements),
         project_task_notifications = VALUES(project_task_notifications)`,
      [
        req.user.id,
        leave_updates !== undefined ? (leave_updates ? 1 : 0) : 1,
        attendance_reminders !== undefined ? (attendance_reminders ? 1 : 0) : 1,
        company_announcements !== undefined ? (company_announcements ? 1 : 0) : 1,
        project_task_notifications !== undefined ? (project_task_notifications ? 1 : 0) : 1,
      ]
    );

    res.json({ message: t(req.lang, 'errors.preferencesUpdated') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
