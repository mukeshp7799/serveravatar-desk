-- Migration: 2026-07-31-rbac-and-email-verification.sql
-- Phase 1: HR Management & Authentication Foundation
--
-- Goal:
--   • Collapse 5 existing roles → just 2 system roles (Administrator + User)
--   • Reuse the existing 45 permissions
--   • Add email-verification columns to users
--   • Wipe ALL user-generated data so the new schema starts clean
--
-- ⚠️  DESTRUCTIVE — wipes ALL users, employees, projects, tasks, messages, etc.
--     Backup with `mysqldump` BEFORE running this migration.
--     Keep the `permissions` table (45 rows) — it is reused as-is.

-- ───────────────────────────────────────────────────────────────────
-- 1. Disable FK checks so we can TRUNCATE in any order
-- ───────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

-- ───────────────────────────────────────────────────────────────────
-- 2. Truncate every data table (preserve `permissions` schema)
-- ───────────────────────────────────────────────────────────────────
TRUNCATE TABLE announcements;
TRUNCATE TABLE departments;
TRUNCATE TABLE designations;
TRUNCATE TABLE discussions;
TRUNCATE TABLE document_comment_reactions;
TRUNCATE TABLE document_comments;
TRUNCATE TABLE document_reactions;
TRUNCATE TABLE documents;
TRUNCATE TABLE email_logs;
TRUNCATE TABLE jwt_denylist;
TRUNCATE TABLE leave_balances;
TRUNCATE TABLE leave_requests;
TRUNCATE TABLE leave_types;
TRUNCATE TABLE message_reactions;
TRUNCATE TABLE messages;
TRUNCATE TABLE notifications;
TRUNCATE TABLE project_activities;
TRUNCATE TABLE project_chat_attachments;
TRUNCATE TABLE project_chat_messages;
TRUNCATE TABLE project_chat_reactions;
TRUNCATE TABLE project_invitations;
TRUNCATE TABLE project_members;
TRUNCATE TABLE project_message_reactions;
TRUNCATE TABLE project_messages;
TRUNCATE TABLE projects;
TRUNCATE TABLE role_permissions;
TRUNCATE TABLE roles;
TRUNCATE TABLE schedule_event_attendees;
TRUNCATE TABLE schedule_events;
TRUNCATE TABLE task_comment_reactions;
TRUNCATE TABLE tb_activity;
TRUNCATE TABLE tb_assignees;
TRUNCATE TABLE tb_attachments;
TRUNCATE TABLE tb_columns;
TRUNCATE TABLE tb_comments;
TRUNCATE TABLE tb_labels;
TRUNCATE TABLE tb_milestones;
TRUNCATE TABLE tb_subtasks;
TRUNCATE TABLE tb_task_history;
TRUNCATE TABLE tb_task_labels;
TRUNCATE TABLE tb_task_links;
TRUNCATE TABLE tb_tasks;
TRUNCATE TABLE tb_test_case_assignees;
TRUNCATE TABLE tb_test_case_attachments;
TRUNCATE TABLE tb_test_case_comment_reactions;
TRUNCATE TABLE tb_test_case_comments;
TRUNCATE TABLE tb_test_case_steps;
TRUNCATE TABLE tb_test_cases;
TRUNCATE TABLE tb_test_suites;
TRUNCATE TABLE time_logs;
TRUNCATE TABLE todo_items;
TRUNCATE TABLE todo_lists;
TRUNCATE TABLE users;

-- ───────────────────────────────────────────────────────────────────
-- 3. Re-enable FK checks
-- ───────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 1;

-- ───────────────────────────────────────────────────────────────────
-- 4. Add email-verification columns to users
--    Idempotent: skips columns that already exist (re-runs of this
--    migration are safe).
-- ───────────────────────────────────────────────────────────────────
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users
       ADD COLUMN email_verified_at             TIMESTAMP    NULL DEFAULT NULL AFTER status,
       ADD COLUMN email_verification_token      VARCHAR(128) NULL DEFAULT NULL AFTER email_verified_at,
       ADD COLUMN email_verification_expires_at TIMESTAMP    NULL DEFAULT NULL AFTER email_verification_token,
       ADD INDEX idx_email_verification_token (email_verification_token)',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'users'
    AND column_name  = 'email_verified_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- 4b. Add `designation` (free-text string) to users.
--     The legacy `designation_id` FK column is left in place for
--     backward compatibility but is no longer written to by the app.
-- ───────────────────────────────────────────────────────────────────
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN designation VARCHAR(100) NULL DEFAULT NULL AFTER designation_id',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'users'
    AND column_name  = 'designation'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ───────────────────────────────────────────────────────────────────
-- 5. Seed the 2 system roles (idempotent via INSERT IGNORE)
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO roles (id, name, description) VALUES
  (1, 'Administrator', 'Full system access — all permissions'),
  (2, 'User',          'Basic employee access');

-- ───────────────────────────────────────────────────────────────────
-- 6. Assign permissions
--    Administrator → all 45
--    User          → curated 14-permission subset
--    Idempotent: re-applying on a DB that already has these rows is safe.
-- ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 2, id FROM permissions
  WHERE name IN (
    'users.view_own',
    'users.edit_own',
    'auth.login',
    'auth.logout',
    'leave.view_own',
    'leave.apply',
    'projects.view',
    'documents.view_own',
    'documents.upload',
    'discussions.view',
    'discussions.create',
    'discussions.post',
    'notifications.view',
    'announcements.view'
  );
