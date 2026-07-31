-- Document comments & reactions for the Files & Documents feature.
-- Builds on top of the existing `documents` table (rich-text docs + uploaded
-- files share the same row — disambiguated by whether `content_html`/`file_url` is set).

-- ─── Comments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `document_comments` (
  `id`           INT(11) NOT NULL AUTO_INCREMENT,
  `document_id`  INT(11) NOT NULL,
  `user_id`      INT(11) NOT NULL,
  `body`         TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_document_id` (`document_id`),
  KEY `idx_user_id`     (`user_id`),
  CONSTRAINT `document_comments_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `document_comments_ibfk_2` FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Reactions ────────────────────────────────────────────────────
-- One emoji per user per document (GitHub / Linear / Slack style).
-- utf8mb4_bin on the emoji column — unicode_ci treats distinct emojis as equal,
-- which breaks the UNIQUE index. (See project_message_reactions for the same fix.)
CREATE TABLE IF NOT EXISTS `document_reactions` (
  `id`           INT(11) NOT NULL AUTO_INCREMENT,
  `document_id`  INT(11) NOT NULL,
  `user_id`      INT(11) NOT NULL,
  `emoji`        VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_document_user` (`document_id`, `user_id`),
  KEY `idx_document_id` (`document_id`),
  KEY `idx_user_id`     (`user_id`),
  CONSTRAINT `document_reactions_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `document_reactions_ibfk_2` FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
