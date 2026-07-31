-- Kanban-style Task Board for the Project Dashboard.
-- Replaces the previous "Card Table" feature.
--
-- Tables:
--   task_columns    — user-defined columns within a project's board
--   tasks           — cards within a column (ordered via `position`)
--   task_assignees  — M:N between tasks and users (project members only)
--   task_comments   — discussion threads on a task
--   task_attachments— uploaded files (reuses the same shape as document uploads)
--   task_subtasks   — checkbox list inside a task
--   task_activity   — append-only log of actions (created/moved/commented/...)
--
-- Notes:
--   * Project-scoped — every table carries `project_id` (via tasks.task_columns JOIN)
--   * Drag-and-drop ordering is a float-based `position` column to avoid
--     O(N) reordering when inserting between two rows.
--   * Comments body — utf8mb4_unicode_ci (plain text, no emoji uniqueness issue).

-- ─── Columns ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tb_columns` (
  `id`         INT(11) NOT NULL AUTO_INCREMENT,
  `project_id` INT(11) NOT NULL,
  `name`       VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position`   DOUBLE NOT NULL DEFAULT 1000,             -- 1000-step increments
  `is_backlog` TINYINT(1) NOT NULL DEFAULT 0,             -- 1 means it's the default landing column
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_id` (`project_id`),
  KEY `idx_position` (`project_id`, `position`),
  CONSTRAINT `task_columns_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tasks ────────────────────────────────────────────────────────
-- `column_id` is the immediate parent. We denormalise `project_id` for
-- permission checks (project scoping) without a JOIN. Description is rich
-- text from Tiptap so MEDIUMTEXT.
CREATE TABLE IF NOT EXISTS `tb_tasks` (
  `id`               INT(11) NOT NULL AUTO_INCREMENT,
  `project_id`       INT(11) NOT NULL,
  `column_id`        INT(11) NOT NULL,
  `title`            VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description_html` MEDIUMTEXT COLLATE utf8mb4_unicode_ci NULL,
  `priority`         ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `due_date`         DATE NULL DEFAULT NULL,
  `position`         DOUBLE NOT NULL DEFAULT 1000,
  `created_by`       INT(11) NOT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_id`     (`project_id`),
  KEY `idx_column_id`      (`column_id`),
  KEY `idx_column_pos`     (`column_id`, `position`),
  KEY `idx_priority`       (`priority`),
  KEY `idx_due_date`       (`due_date`),
  KEY `idx_created_by`     (`created_by`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`project_id`)  REFERENCES `projects`     (`id`) ON DELETE CASCADE,
  CONSTRAINT `tasks_ibfk_2` FOREIGN KEY (`column_id`)   REFERENCES `tb_columns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tasks_ibfk_3` FOREIGN KEY (`created_by`)  REFERENCES `users`        (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Assignees (M:N) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tb_assignees` (
  `task_id`    INT(11) NOT NULL,
  `user_id`    INT(11) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`, `user_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `task_assignees_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_assignees_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Comments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tb_comments` (
  `id`         INT(11) NOT NULL AUTO_INCREMENT,
  `task_id`    INT(11) NOT NULL,
  `user_id`    INT(11) NOT NULL,
  `body`       TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `task_comments_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Attachments ──────────────────────────────────────────────────
-- file_url is the same /uploads/... path used by documents.
-- Only the metadata is stored — the file lives on disk.
CREATE TABLE IF NOT EXISTS `tb_attachments` (
  `id`          INT(11) NOT NULL AUTO_INCREMENT,
  `task_id`     INT(11) NOT NULL,
  `file_url`    VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type`   VARCHAR(100) COLLATE utf8mb4_unicode_ci NULL,
  `file_size`   INT(11) NULL,
  `uploaded_by` INT(11) NOT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_uploaded_by` (`uploaded_by`),
  CONSTRAINT `task_attachments_ibfk_1` FOREIGN KEY (`task_id`)     REFERENCES `tb_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_attachments_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Subtasks (checkbox list) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tb_subtasks` (
  `id`         INT(11) NOT NULL AUTO_INCREMENT,
  `task_id`    INT(11) NOT NULL,
  `title`      VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `done`       TINYINT(1) NOT NULL DEFAULT 0,
  `position`   DOUBLE NOT NULL DEFAULT 1000,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_id` (`task_id`),
  CONSTRAINT `task_subtasks_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Activity log (append-only) ───────────────────────────────────
-- `action` is a stable enum-like string: created, edited, moved, assigned,
-- unassigned, commented, attached, subtask_added, subtask_done, deleted, etc.
-- `details_json` carries action-specific payload (old_column → new_column, etc.).
CREATE TABLE IF NOT EXISTS `tb_activity` (
  `id`           INT(11) NOT NULL AUTO_INCREMENT,
  `task_id`      INT(11) NOT NULL,
  `user_id`      INT(11) NOT NULL,
  `action`       VARCHAR(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details_json` JSON NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  CONSTRAINT `task_activity_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_activity_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
