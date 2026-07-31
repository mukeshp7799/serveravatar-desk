-- ──────────────────────────────────────────────────────────────────
-- Migration: Project Chat Board (real-time per-project chat)
-- Date: 2026-07-24
--
-- Adds three tables:
--   1. project_chat_messages       — chronological chat messages
--   2. project_chat_attachments    — file/image attachments per message
--   3. project_chat_reactions      — emoji reactions, one per user per message
--
-- Why a separate "project_chat_*" namespace:
--   • The existing `project_messages` table is for pinned announcements /
--     updates / discussions on the project dashboard — different lifecycle,
--     different UI, different access pattern.
--   • Mixing chat into that table would either break pinning logic or
--     pollute the dashboard with every chat blip.
--   • Clean separation lets us evolve each feature independently.
--
-- Reaction semantics (one active reaction per user per message):
--   • No existing reaction   → INSERT new emoji
--   • Same emoji as existing → DELETE (toggle off)
--   • Different emoji        → UPDATE in place (switch)
--   • UNIQUE(message_id, user_id) enforces "at most one row per user" at
--     the DB level, regardless of emoji.
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_chat_messages (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    project_id      INT          NOT NULL,
    author_id       INT          NOT NULL,
    body            TEXT         NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    edited_at       TIMESTAMP    NULL,
    deleted_at      TIMESTAMP    NULL,
    INDEX idx_pcm_project (project_id, created_at),
    INDEX idx_pcm_author  (author_id),
    CONSTRAINT fk_pcm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcm_author  FOREIGN KEY (author_id)  REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_chat_attachments (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    message_id      INT          NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(512) NOT NULL,
    mime_type       VARCHAR(128) NULL,
    file_size       INT          NOT NULL DEFAULT 0,
    uploaded_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pca_message (message_id),
    CONSTRAINT fk_pca_message FOREIGN KEY (message_id) REFERENCES project_chat_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_chat_reactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    message_id      INT         NOT NULL,
    user_id         INT         NOT NULL,
    emoji           VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pcr_user (message_id, user_id),
    INDEX idx_pcr_message (message_id),
    CONSTRAINT fk_pcr_message FOREIGN KEY (message_id) REFERENCES project_chat_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcr_user    FOREIGN KEY (user_id)    REFERENCES users(id)           ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
