-- Migration: 2026-08-05-notification-preferences.sql
-- Phase 9: My Profile — notification preferences table

CREATE TABLE IF NOT EXISTS notification_preferences (
  id                              INT AUTO_INCREMENT PRIMARY KEY,
  user_id                         INT NOT NULL UNIQUE,
  leave_updates                   TINYINT(1) NOT NULL DEFAULT 1,
  attendance_reminders            TINYINT(1) NOT NULL DEFAULT 1,
  company_announcements            TINYINT(1) NOT NULL DEFAULT 1,
  project_task_notifications      TINYINT(1) NOT NULL DEFAULT 1,
  created_at                      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
