-- Migration: 2026-08-10-break-adjustment-requests.sql
-- Break Time Adjustment Request feature
--
-- Employees can request to count part/all of their break time as working time.
-- Admins/HR can approve or reject these requests.
-- On approval, the effective_break_minutes on attendance is reduced and working_hours are recomputed.

-- ───────────────────────────────────────────────────────────────────
-- 1. break_adjustment_requests table
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_adjustment_requests (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_id        INT UNSIGNED NOT NULL,
  break_id             INT UNSIGNED NOT NULL COMMENT 'Original break record being adjusted',
  user_id              INT UNSIGNED NOT NULL COMMENT 'Employee requesting the adjustment',
  requested_minutes    INT UNSIGNED NOT NULL COMMENT 'Break minutes requested to count as work (≤ original break duration)',
  reason               TEXT         NOT NULL COMMENT 'Employee justification',
  status               ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  
  -- Admin/HR review
  reviewed_by          INT UNSIGNED  NULL COMMENT 'Admin who reviewed',
  reviewed_at          DATETIME      NULL,
  admin_remarks        TEXT          NULL COMMENT 'Remarks on approval/rejection',
  
  -- Tracking
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Relations
  FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE RESTRICT,
  FOREIGN KEY (break_id)     REFERENCES attendance_breaks(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Indexes for common queries
  INDEX idx_bar_user_id    (user_id),
  INDEX idx_bar_status     (status),
  INDEX idx_bar_attendance (attendance_id),
  INDEX idx_bar_created    (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- 2. Effective break minutes column on attendance
--    This stores the minutes already approved-as-work through adjustments.
--    effective_break_minutes = total_break_minutes - approved_adjustment_minutes
-- ───────────────────────────────────────────────────────────────────
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE attendance ADD COLUMN effective_break_minutes INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_break_minutes',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'attendance'
    AND column_name  = 'effective_break_minutes'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- 3. Seed new permissions
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO permissions (name, description, created_at) VALUES
  ('attendance.break_adjustment.request', 'Request break time adjustments', NOW()),
  ('attendance.break_adjustment.manage',  'Approve or reject break adjustment requests', NOW());

-- ───────────────────────────────────────────────────────────────────
-- 4. Grant new permissions to Administrator role (id=1)
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions
  WHERE name IN ('attendance.break_adjustment.request', 'attendance.break_adjustment.manage');
