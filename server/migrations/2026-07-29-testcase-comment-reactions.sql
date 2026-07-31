-- Reactions for test-case step comments
-- One reaction per user per comment (user can change emoji — replace semantics)
CREATE TABLE IF NOT EXISTS seravavatar_hub.tb_test_case_comment_reactions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id  INT NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  emoji       VARCHAR(16) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uc_comment_user (comment_id, user_id),
  KEY ix_emoji (emoji),
  FOREIGN KEY (comment_id) REFERENCES tb_test_case_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
