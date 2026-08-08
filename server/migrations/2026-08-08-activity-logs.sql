-- Migration: 2026-08-08-activity-logs.sql
-- Phase 11: Activity Logs & Audit Trail
--
-- Creates the centralized activity_logs table and seeds the two new
-- RBAC permissions. Safe to re-run (idempotent).

-- ───────────────────────────────────────────────────────────────────
-- 1. Create activity_logs table
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  module          VARCHAR(80) NOT NULL COMMENT 'Login|Employee|Attendance|Leave|Calendar|Announcement|CompanySettings|Role|Permission|Project|...',
  action          VARCHAR(80) NOT NULL COMMENT 'Created|Updated|Deleted|Approved|Rejected|Archived|Restored|ClockIn|ClockOut|...',
  description     VARCHAR(500) NOT NULL,
  ip_address      VARCHAR(45) NULL,
  previous_value  JSON NULL,
  new_value       JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id    (user_id),
  INDEX idx_module      (module),
  INDEX idx_action      (action),
  INDEX idx_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- 2. Seed the two new RBAC permissions (idempotent)
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO permissions (name, description) VALUES
  ('activity_logs.view_own',  'View own activity logs'),
  ('activity_logs.view_all', 'View all users'' activity logs');

-- ───────────────────────────────────────────────────────────────────
-- 3. Grant to Administrator (role_id = 1) — both permissions
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions WHERE name = 'activity_logs.view_own';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions WHERE name = 'activity_logs.view_all';
