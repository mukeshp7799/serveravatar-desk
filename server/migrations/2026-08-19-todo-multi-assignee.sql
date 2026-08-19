-- Migration: 2026-08-19-todo-multi-assignee.sql
-- Add multi-assignee support to todo items via a junction table.

-- Junction table: one row per (todo_item, user) assignment.
-- The old assignee_id column is kept for backwards compat and migration purposes.
CREATE TABLE IF NOT EXISTS todo_item_assignees (
  todo_item_id INT NOT NULL,
  user_id      INT NOT NULL,
  PRIMARY KEY (todo_item_id, user_id),
  FOREIGN KEY (todo_item_id) REFERENCES todo_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
);

-- Backfill: populate the junction table from existing assignee_id values.
INSERT IGNORE INTO todo_item_assignees (todo_item_id, user_id)
  SELECT id, assignee_id
  FROM todo_items
  WHERE assignee_id IS NOT NULL;
