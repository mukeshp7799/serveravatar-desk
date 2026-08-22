/**
 * Permissions Seeder
 * Run: node src/seeders/permissions.js
 *
 * Seeds the `permissions` table with the full permission schema.
 * Safe to re-run — always does TRUNCATE first to ensure clean state.
 */

const pool = require('../config/database');

const PERMISSIONS = [
  // ── Users ────────────────────────────────────────────────────────────────
  { name: 'users.view_all',  description: 'View all user profiles' },
  { name: 'users.create',    description: 'Create new users' },
  { name: 'users.edit_own',  description: 'Edit own user profile' },
  { name: 'users.edit_all',  description: 'Edit any user profile' },
  { name: 'users.delete',    description: 'Delete users' },

  // ── Leaves ───────────────────────────────────────────────────────────────
  { name: 'leaves.apply',       description: 'Apply for leave' },
  { name: 'leaves.view_own',    description: 'View own leave records' },
  { name: 'leaves.view_team',   description: 'View team leave records' },
  { name: 'leaves.view_all',    description: 'View all leave records' },
  { name: 'leaves.approve',     description: 'Approve or reject leave requests' },
  { name: 'leaves.manage',      description: 'Manage (edit/delete) any leave request' },
  { name: 'leaves.configure',   description: 'Configure leave types and settings' },

  // ── Attendance ───────────────────────────────────────────────────────────
  { name: 'attendance.clock',        description: 'Clock in / out' },
  { name: 'attendance.view_own',     description: 'View own attendance' },
  { name: 'attendance.view_team',    description: 'View team attendance' },
  { name: 'attendance.view_all',     description: 'View all attendance records' },
  { name: 'attendance.manage',       description: 'Manage attendance records' },
  { name: 'attendance.adjust_break', description: 'Request / approve break adjustments' },

  // ── Calendar ─────────────────────────────────────────────────────────────
  { name: 'calendar.view',            description: 'View calendar events and holidays' },
  { name: 'calendar.manage_events',   description: 'Create and manage calendar events' },
  { name: 'calendar.manage_holidays', description: 'Manage company holidays' },

  // ── Reports ──────────────────────────────────────────────────────────────
  { name: 'reports.view',   description: 'View reports and analytics' },
  { name: 'reports.export', description: 'Export reports' },

  // ── Announcements ────────────────────────────────────────────────────────
  { name: 'announcements.view',   description: 'View announcements' },
  { name: 'announcements.create', description: 'Create announcements' },
  { name: 'announcements.manage', description: 'Manage (edit/delete/pin) announcements' },

  // ── Projects ─────────────────────────────────────────────────────────────
  { name: 'projects.view',           description: 'View projects' },
  { name: 'projects.create',         description: 'Create projects' },
  { name: 'projects.edit',          description: 'Edit projects' },
  { name: 'projects.delete',        description: 'Delete projects' },
  { name: 'projects.manage_members', description: 'Add/remove project members' },

  // ── Discussions ──────────────────────────────────────────────────────────
  { name: 'discussions.view',   description: 'View discussions' },
  { name: 'discussions.create', description: 'Create discussions' },
  { name: 'discussions.post',   description: 'Post messages in discussions' },
  { name: 'discussions.delete', description: 'Delete discussions' },

  // ── Notifications ────────────────────────────────────────────────────────
  { name: 'notifications.view',      description: 'View notification settings' },
  { name: 'notifications.configure', description: 'Configure notification preferences' },

  // ── Activity Logs ────────────────────────────────────────────────────────
  { name: 'activity_logs.view_own',  description: 'View own activity logs' },
  { name: 'activity_logs.view_all',  description: 'View all activity logs' },

  // ── Admin ────────────────────────────────────────────────────────────────
  { name: 'admin.settings',    description: 'Manage company settings' },
  { name: 'admin.departments', description: 'Manage departments' },
  { name: 'admin.roles',       description: 'Manage roles and permissions' },
];

async function seed() {
  const conn = await pool.getConnection();

  try {
    console.log('🌱 Seeding permissions...');

    // Clear existing + reset auto_increment
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE permissions');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // Clear role_permissions pivot — permissions no longer exist
    await conn.query('DELETE FROM role_permissions');

    // Insert all permissions
    for (const perm of PERMISSIONS) {
      await conn.query(
        'INSERT INTO permissions (name, description) VALUES (?, ?)',
        [perm.name, perm.description]
      );
    }

    // Assign all permissions to Administrator role (role_id = 1)
    await conn.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_id)
      SELECT 1, id FROM permissions
    `);

    const [rows] = await conn.query('SELECT COUNT(*) as total FROM permissions');
    console.log(`✅ Seeded ${rows[0].total} permissions`);
    console.log('✅ Administrator role granted all permissions');

  } finally {
    conn.release();
  }

  await pool.end();
}

seed().catch(err => {
  console.error('❌ Seeder failed:', err.message);
  process.exit(1);
});
