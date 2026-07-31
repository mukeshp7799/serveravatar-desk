-- Migration: 2026-07-29-discussion-message-reactions
-- Adds reactions support to discussion messages (the `messages` table, used when is_direct=0)

CREATE TABLE IF NOT EXISTS message_reactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  message_id  INT NOT NULL,
  user_id     INT NOT NULL,
  emoji       VARCHAR(16) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_message_user_emoji (message_id, user_id, emoji),
  INDEX idx_message_id (message_id),
  INDEX idx_user_id    (user_id),

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
