-- Migration: 2026-08-05-company-settings.sql
-- Centralized Company Settings for Attendance, Leave, Working Schedule

CREATE TABLE IF NOT EXISTS company_settings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_group   VARCHAR(50)  NOT NULL,        -- 'general' | 'working_schedule' | 'attendance' | 'leave'
  setting_key     VARCHAR(100) NOT NULL,
  setting_value   TEXT,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_group_key (setting_group, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Default values ─────────────────────────────────────────────────────────

-- General
INSERT INTO company_settings (setting_group, setting_key, setting_value) VALUES
  ('general', 'company_name', 'ServerAvatar Hub'),
  ('general', 'company_logo', NULL),
  ('general', 'timezone', 'Asia/Kolkata'),
  ('general', 'date_format', 'DD/MM/YYYY'),
  ('general', 'time_format', '12h');

-- Working Schedule
INSERT INTO company_settings (setting_group, setting_key, setting_value) VALUES
  ('working_schedule', 'working_days', '["mon","tue","wed","thu","fri"]'),
  ('working_schedule', 'office_start_time', '09:30'),
  ('working_schedule', 'office_end_time', '18:30'),
  ('working_schedule', 'required_working_hours', '8'),
  ('working_schedule', 'late_checkin_grace_minutes', '30'),
  ('working_schedule', 'default_break_duration_minutes', '60'),
  ('working_schedule', 'allow_multiple_breaks', '0');

-- Attendance
INSERT INTO company_settings (setting_group, setting_key, setting_value) VALUES
  ('attendance', 'allow_early_clock_in', '1'),
  ('attendance', 'allow_late_clock_out', '1'),
  ('attendance', 'require_clock_out', '1'),
  ('attendance', 'auto_close_attendance', '0'),
  ('attendance', 'auto_mark_absent', '1');

-- Leave
INSERT INTO company_settings (setting_group, setting_key, setting_value) VALUES
  ('leave', 'allow_half_day_leave', '1'),
  ('leave', 'half_day_session', 'first_half'),
  ('leave', 'minimum_leave_notice_days', '1'),
  ('leave', 'allow_backdated_leave', '0'),
  ('leave', 'max_consecutive_leave_days', '10'),
  ('leave', 'allow_leave_on_weekends', '0'),
  ('leave', 'allow_leave_on_company_holidays', '0'),
  ('leave', 'require_leave_approval', '1');
