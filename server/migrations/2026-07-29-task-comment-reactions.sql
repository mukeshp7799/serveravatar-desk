-- Migration: 2026-07-29-task-comment-reactions
-- Adds reactions to task comments (tb_comments table)

CREATE TABLE IF NOT EXISTS task_comment_reactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  comment_id  INT NOT NULL,
  user_id     INT NOT NULL,
  emoji       VARCHAR(16) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_comment_user_emoji (comment_id, user_id, emoji),
  INDEX idx_comment_id (comment_id),
  INDEX idx_user_id    (user_id),

  FOREIGN KEY (comment_id) REFERENCES tb_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
