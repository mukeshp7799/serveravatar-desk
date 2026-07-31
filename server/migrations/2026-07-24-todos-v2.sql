-- 2026-07-24 — To-do Lists v2 (full schema for Basecamp-style checklists)
-- Adds columns to todo_lists, creates todo_items + todo_item_assignees tables.
-- Drops the old stub todo_lists rows so we start clean.

USE seravavatar_hub;

-- Drop the empty stub
DROP TABLE IF EXISTS todo_lists;

CREATE TABLE todo_lists (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  project_id      INT NOT NULL,
  name            VARCHAR(200) NOT NULL,
  color           VARCHAR(20) NOT NULL DEFAULT 'indigo',   -- indigo|emerald|amber|sky|pink|violet
  position        INT NOT NULL DEFAULT 0,                   -- sort order within project
  created_by      INT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  archived_at     TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_lists_project (project_id),
  INDEX idx_lists_archived (archived_at),
  CONSTRAINT fk_lists_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_lists_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE todo_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  list_id         INT NOT NULL,
  project_id      INT NOT NULL,                              -- denormalized for fast project-scoped queries
  title           VARCHAR(500) NOT NULL,
  notes           TEXT NULL,
  completed       TINYINT(1) NOT NULL DEFAULT 0,
  completed_at    TIMESTAMP NULL DEFAULT NULL,
  completed_by    INT NULL,
  assignee_id     INT NULL,                                  -- optional single assignee
  due_date        DATE NULL,
  position        INT NOT NULL DEFAULT 0,                    -- sort order within list
  created_by      INT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_items_list (list_id),
  INDEX idx_items_project (project_id),
  INDEX idx_items_completed (completed),
  INDEX idx_items_due (due_date),
  CONSTRAINT fk_items_list FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_completed_by FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;