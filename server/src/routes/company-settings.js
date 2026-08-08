const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const { t } = require('../i18n');
const { logActivity } = require('../services/activityService');

const router = express.Router();

router.use(auth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get all company settings as a flat { key: value } object, grouped.
 * Returns: { general: {...}, working_schedule: {...}, attendance: {...}, leave: {...} }
 */
async function getAllSettings() {
  const [rows] = await pool.query('SELECT setting_group, setting_key, setting_value FROM company_settings');
  const groups = {};
  for (const row of rows) {
    if (!groups[row.setting_group]) groups[row.setting_group] = {};
    let val = row.setting_value;
    // Auto-parse JSON arrays/objects
    if (val !== null) {
      try { val = JSON.parse(val); } catch { /* keep as string */ }
    }
    groups[row.setting_group][row.setting_key] = val;
  }
  return groups;
}

/**
 * Upsert a single setting.
 */
async function upsertSetting(group, key, value) {
  const [existing] = await pool.query(
    'SELECT id FROM company_settings WHERE setting_group = ? AND setting_key = ?',
    [group, key]
  );
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (existing.length > 0) {
    await pool.query(
      'UPDATE company_settings SET setting_value = ? WHERE setting_group = ? AND setting_key = ?',
      [valStr, group, key]
    );
  } else {
    await pool.query(
      'INSERT INTO company_settings (setting_group, setting_key, setting_value) VALUES (?, ?, ?)',
      [group, key, valStr]
    );
  }
}

// ─── GET /api/company-settings ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    // Admin only
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('admin.all') || perms.includes('settings.manage');
    if (!isAdmin) {
      // Allow read-only access to non-admins (for attendance/leave pages to pull settings)
      const all = await getAllSettings();
      return res.json({ settings: all });
    }
    const all = await getAllSettings();
    res.json({ settings: all });
  } catch (err) { next(err); }
});

// ─── PUT /api/company-settings ───────────────────────────────────────────────
router.put('/', requirePermission('admin.settings'), async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    const groups = Object.keys(settings);
    for (const group of groups) {
      const groupSettings = settings[group];
      if (typeof groupSettings !== 'object' || Array.isArray(groupSettings)) continue;
      const keys = Object.keys(groupSettings);
      for (const key of keys) {
        await upsertSetting(group, key, groupSettings[key]);
      }
    }

    const updated = await getAllSettings();
    // ── Activity log: Company Settings Updated ────────────────────────────
    const changedGroups = groups.join(', ');
    logActivity({ req, module: 'CompanySettings', action: 'Updated',
      description: `Company settings updated: ${changedGroups}` });
    res.json({ message: t(req.lang, 'settings.companySettingsUpdated'), settings: updated });
  } catch (err) { next(err); }
});

// ─── GET /api/company-settings/group/:group ──────────────────────────────────
router.get('/group/:group', async (req, res, next) => {
  try {
    const { group } = req.params;
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM company_settings WHERE setting_group = ?',
      [group]
    );
    const result = {};
    for (const row of rows) {
      let val = row.setting_value;
      try { val = JSON.parse(val); } catch { /* keep string */ }
      result[row.setting_key] = val;
    }
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
