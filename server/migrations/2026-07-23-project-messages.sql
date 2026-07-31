-- ──────────────────────────────────────────────────────────────────
-- Migration: Project Message Board (real API)
-- Date: 2026-07-23
--
-- Adds:
--   1. `project_messages`        — pinned/edited/rich-text project messages
--   2. `project_message_reactions` — emoji reactions w/ UNIQUE dup-prevention
--
-- Why a new namespace ("project_messages") instead of reusing the existing
-- `messages` table: the existing `messages` table is owned by the
-- discussions/private-message feature (1-on-1 chat) — different schema,
-- different access pattern. Keeping these separate avoids a breaking
-- change to that feature.
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_messages (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    project_id      INT          NOT NULL,
    author_id       INT          NOT NULL,
    title           VARCHAR(255) NULL,
    body_html       MEDIUMTEXT   NOT NULL,
    category        ENUM('update','discussion','question','announcement') NOT NULL DEFAULT 'update',
    is_pinned       TINYINT(1)   NOT NULL DEFAULT 0,
    pin_order       INT          NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    edited_at       TIMESTAMP    NULL,
    INDEX idx_pm_project (project_id, created_at),
    INDEX idx_pm_pinned  (project_id, is_pinned, pin_order),
    INDEX idx_pm_author  (author_id),
    CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_author  FOREIGN KEY (author_id)  REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_message_reactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    message_id      INT         NOT NULL,
    user_id         INT         NOT NULL,
    emoji           VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_reaction (message_id, user_id, emoji),
    INDEX idx_reaction_msg (message_id),
    CONSTRAINT fk_reaction_msg  FOREIGN KEY (message_id) REFERENCES project_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_reaction_user FOREIGN KEY (user_id)    REFERENCES users(id)           ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;