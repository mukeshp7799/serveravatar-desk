-- Migration: 2026-07-23-task-management.sql
-- Expands the Kanban task board into a full task management module.
--
-- Adds:
--   • Priority 'urgent' (was: low/medium/high)
--   • Start date + estimated hours on tb_tasks
--   • Soft-delete via archived_at
--   • Project membership check helper
--   • Labels / Tags (tb_labels, tb_task_labels) M:N
--   • History log (tb_task_history) — every field change recorded
--   • Linked tasks (tb_task_links) — graph of dependencies
--   • Milestones (tb_milestones) — optional grouping concept
--   • Extended activity log actions (added/removed label, archived, etc.)

-- ───────────────────────────────────────────────────────────────────
-- 1. Expand priority enum on tb_tasks
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE tb_tasks MODIFY COLUMN priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium';

-- ───────────────────────────────────────────────────────────────────
-- 2. Add fields to tb_tasks
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE tb_tasks
  ADD COLUMN start_date        DATE NULL AFTER due_date,
  ADD COLUMN estimated_hours   DECIMAL(6,2) NULL AFTER start_date,
  ADD COLUMN archived_at       DATETIME NULL AFTER updated_at,
  ADD COLUMN archived_by       INT NULL AFTER archived_at,
  ADD INDEX idx_archived (project_id, archived_at),
  ADD INDEX idx_start_date (project_id, start_date),
  ADD INDEX idx_priority_due (project_id, priority, due_date);

-- ───────────────────────────────────────────────────────────────────
-- 3. Labels (project-scoped)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_labels (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  name        VARCHAR(60) NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_label_per_project (project_id, name),
  CONSTRAINT fk_label_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tb_task_labels (
  task_id  INT NOT NULL,
  label_id INT NOT NULL,
  PRIMARY KEY (task_id, label_id),
  CONSTRAINT fk_tl_task  FOREIGN KEY (task_id)  REFERENCES tb_tasks(id)   ON DELETE CASCADE,
  CONSTRAINT fk_tl_label FOREIGN KEY (label_id) REFERENCES tb_labels(id)  ON DELETE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- 4. History log (every field-change is recorded)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_task_history (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id     INT NOT NULL,
  user_id     INT NOT NULL,
  field       VARCHAR(40) NOT NULL,    -- e.g. 'status', 'priority', 'due_date', 'assignees', 'title'
  old_value   TEXT NULL,
  new_value   TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_history_task (task_id, created_at),
  CONSTRAINT fk_history_task FOREIGN KEY (task_id) REFERENCES tb_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- 5. Linked tasks (graph: predecessor → successor)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_task_links (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  predecessor_id INT NOT NULL,
  successor_id   INT NOT NULL,
  link_type     ENUM('blocks','relates_to','duplicates') NOT NULL DEFAULT 'relates_to',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_link (predecessor_id, successor_id, link_type),
  CONSTRAINT fk_link_pred FOREIGN KEY (predecessor_id) REFERENCES tb_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_link_succ FOREIGN KEY (successor_id)   REFERENCES tb_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- 6. Milestones (optional grouping)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_milestones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  name        VARCHAR(120) NOT NULL,
  due_date    DATE NULL,
  status      ENUM('open','achieved','missed') NOT NULL DEFAULT 'open',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_milestone_project (project_id, due_date),
  CONSTRAINT fk_milestone_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE tb_tasks
  ADD COLUMN milestone_id INT NULL AFTER estimated_hours,
  ADD INDEX idx_task_milestone (milestone_id),
  ADD CONSTRAINT fk_task_milestone FOREIGN KEY (milestone_id) REFERENCES tb_milestones(id) ON DELETE SET NULL;
