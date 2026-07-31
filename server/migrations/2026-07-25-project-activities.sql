-- ──────────────────────────────────────────────────────────────────
-- Migration: Project Activities
-- Date: 2026-07-25
--
-- Adds:
--   1. `project_activities` — append-only audit log of meaningful
--      project events (project created/updated, member added/removed,
--      task created/updated/moved/completed/archived/deleted, message
--      posted/updated/deleted, document created/updated/deleted, file
--      uploaded/removed, comment added, chat message posted/deleted,
--      schedule event created/deleted, …).
--
-- This table powers the "Activity Timeline" card on the project
-- dashboard AND the full /projects/:id/activity page.
--
-- Design notes:
--   * Append-only — no UPDATE/DELETE on this table from app code.
--   * `feature` is the slug of the surface that produced the event
--     ('project', 'team', 'task-board', 'todos', 'message-board',
--     'files', 'chat', 'schedule', 'notes', 'reports'). Keep this
--     list in sync with FEATURE_META in server/src/utils/activity.js.
--   * `action` is the verb ('created', 'updated', 'deleted', 'moved',
--     'completed', 'archived', 'restored', 'added', 'removed',
--     'commented', 'posted', 'uploaded').
--   * `target_label` is a human-readable label rendered in the UI
--     (e.g. task title, message title, member name) so the UI doesn't
--     have to chase cross-table lookups for every row.
--   * `meta` is a JSON column for action-specific context (e.g.
--     {"from_column": "Todo", "to_column": "Done"} on a task move).
--   * `id` is BIGINT because activity rows can accumulate quickly on
--     busy projects (multiple events per minute).
--   * `target_id` is VARCHAR because not every target is an INT
--     (some feature tables use string ids, and we want one schema
--     that covers them all).
-- ──────────────────────────────────────────────────────────────────

USE seravavatar_hub;

CREATE TABLE IF NOT EXISTS project_activities (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id      INT          NOT NULL,
    actor_id        INT          NOT NULL,
    feature         VARCHAR(40)  NOT NULL,                  -- e.g. 'task-board', 'message-board'
    action          VARCHAR(60)  NOT NULL,                  -- e.g. 'created', 'moved', 'commented'
    target_type     VARCHAR(40)  NOT NULL,                  -- e.g. 'task', 'message', 'document', 'member'
    target_id       VARCHAR(60)  NULL,                      -- row id in the source table (best-effort)
    target_label    VARCHAR(255) NULL,                      -- human-readable label for the UI
    meta            JSON         NULL,                      -- action-specific extra context
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pa_project_created (project_id, created_at DESC),
    INDEX idx_pa_project_feature (project_id, feature, created_at DESC),
    INDEX idx_pa_actor           (actor_id, created_at DESC),
    CONSTRAINT fk_pa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pa_actor   FOREIGN KEY (actor_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
