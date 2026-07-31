-- Project Invitations
-- Supports external user invitation flow:
--   1. Owner invites external user by email
--   2. Pending invitation created with secure token
--   3. Invitation email sent with project name, inviter details, link
--   4. Invited user clicks link → registers or signs in
--   5. After auth, user sees invitation to Accept or Decline
--   6. On Accept → project_members row becomes active; user gains access
--   7. Pending members shown as "Pending" in project members list
--   8. Pending members are disabled in member selectors

CREATE TABLE IF NOT EXISTS project_invitations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  project_id    INT NOT NULL,
  email         VARCHAR(255) NOT NULL,
  token         VARCHAR(64) NOT NULL UNIQUE,
  invited_by    INT NOT NULL,
  role_in_project VARCHAR(100) NOT NULL DEFAULT 'member',
  status        ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  accepted_user_id  INT NULL,          -- set when user accepts
  expires_at    DATETIME NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_token        (token),
  INDEX idx_project_email (project_id, email),
  INDEX idx_status       (status),

  CONSTRAINT fk_invitation_project FOREIGN KEY (project_id)
    REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_invitation_inviter FOREIGN KEY (invited_by)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_invitation_accepted FOREIGN KEY (accepted_user_id)
    REFERENCES users(id) ON DELETE SET NULL
);

-- Token format: 32 random hex chars, generated server-side
-- Invitation lifetime: 7 days (enforced at accept/decline time)
-- Only one pending invitation per (project_id, email) pair at a time
