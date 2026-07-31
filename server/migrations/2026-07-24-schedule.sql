-- 2026-07-24 — Project Schedule (Basecamp-style calendar events)
--
-- Hierarchy: Project → Event
--   event: title, description, start_at, end_at, all_day, location, color/category

USE seravavatar_hub;

CREATE TABLE schedule_events (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  project_id      INT NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  start_at        DATETIME NOT NULL,                      -- inclusive start (UTC)
  end_at          DATETIME NOT NULL,                      -- exclusive end (UTC)
  all_day         TINYINT(1) NOT NULL DEFAULT 0,
  location        VARCHAR(500) NULL,
  color           VARCHAR(20) NOT NULL DEFAULT 'sky',      -- sky|emerald|amber|rose|violet|indigo
  category        VARCHAR(40) NULL,                        -- meeting|milestone|reminder|release|event (free text)
  created_by      INT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_project (project_id),
  INDEX idx_events_start (start_at),
  INDEX idx_events_range (project_id, start_at, end_at),
  CONSTRAINT fk_events_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Attendees (many-to-many users)
CREATE TABLE schedule_event_attendees (
  event_id        INT NOT NULL,
  user_id         INT NOT NULL,
  response        ENUM('pending', 'accepted', 'declined', 'tentative') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_aea_event FOREIGN KEY (event_id) REFERENCES schedule_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_aea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;