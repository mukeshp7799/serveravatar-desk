const express = require('express');
const { getCompanySetting, nowInTimezone, todayInTimezone, formatDate, formatTime } = require('../utils/timezone');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');
const { logActivity } = require('../services/activityService');

// Helper to check permission
const canManageHolidays = (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (perms.includes('calendar.manage_holidays') || perms.includes('hr.manage_all')) return next();
  return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
};

const canManageEvents = (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (perms.includes('calendar.manage_events') || perms.includes('hr.manage_all')) return next();
  return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
};

// ===================== HOLIDAYS =====================

// GET /api/calendar/holidays - List holidays
router.get('/holidays', auth, async (req, res, next) => {
  try {
    const { year, type, search } = req.query;
    let query = 'SELECT * FROM company_holidays WHERE 1=1';
    const params = [];
    if (year) { query += ' AND YEAR(date) = ?'; params.push(year); }
    if (type) { query += ' AND holiday_type = ?'; params.push(type); }
    if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }
    query += ' ORDER BY date ASC';
    const [rows] = await pool.query(query, params);
    res.json({ holidays: rows });
  } catch (err) { next(err); }
});

// POST /api/calendar/holidays - Create holiday
router.post('/holidays', auth, canManageHolidays, async (req, res, next) => {
  try {
    const { name, date, holiday_type, description } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });
    const [result] = await pool.query(
      'INSERT INTO company_holidays (name, date, holiday_type, description) VALUES (?, ?, ?, ?)',
      [name, date, holiday_type || 'company', description || null]
    );
    const [rows] = await pool.query('SELECT * FROM company_holidays WHERE id = ?', [result.insertId]);
    // ── Activity log: Holiday Created ─────────────────────────────────────
    logActivity({ req, module: 'Calendar', action: 'Created',
      description: `Holiday (${name}) created` });
    res.status(201).json({ holiday: rows[0], message: 'Holiday created successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A holiday already exists on this date' });
    next(err);
  }
});

// PUT /api/calendar/holidays/:id - Update holiday
router.put('/holidays/:id', auth, canManageHolidays, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, date, holiday_type, description } = req.body;
    const [existing] = await pool.query('SELECT id FROM company_holidays WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Holiday not found' });
    const updates = [], params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (date) { updates.push('date = ?'); params.push(date); }
    if (holiday_type) { updates.push('holiday_type = ?'); params.push(holiday_type); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await pool.query(`UPDATE company_holidays SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM company_holidays WHERE id = ?', [id]);
    // ── Activity log: Holiday Updated ──────────────────────────────────────
    logActivity({ req, module: 'Calendar', action: 'Updated',
      description: `Holiday (${rows[0]?.name || id}) updated` });
    res.json({ holiday: rows[0], message: 'Holiday updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A holiday already exists on this date' });
    next(err);
  }
});

// DELETE /api/calendar/holidays/:id
router.delete('/holidays/:id', auth, canManageHolidays, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT id FROM company_holidays WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Holiday not found' });
    const [[holiday]] = await pool.query('SELECT name FROM company_holidays WHERE id = ?', [id]);
    await pool.query('DELETE FROM company_holidays WHERE id = ?', [id]);
    // ── Activity log: Holiday Deleted ─────────────────────────────────────
    logActivity({ req, module: 'Calendar', action: 'Deleted',
      description: `Holiday (${holiday?.name || id}) deleted` });
    res.json({ message: 'Holiday deleted successfully' });
  } catch (err) { next(err); }
});

// ===================== COMPANY EVENTS =====================

// GET /api/calendar/events - List events
router.get('/events', auth, async (req, res, next) => {
  try {
    const { year, category, search } = req.query;
    let query = 'SELECT * FROM company_events WHERE 1=1';
    const params = [];
    if (year) { query += ' AND YEAR(start_date) = ?'; params.push(year); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (search) { query += ' AND title LIKE ?'; params.push(`%${search}%`); }
    query += ' ORDER BY start_date ASC';
    const [rows] = await pool.query(query, params);
    res.json({ events: rows });
  } catch (err) { next(err); }
});

// POST /api/calendar/events - Create event
router.post('/events', auth, canManageEvents, async (req, res, next) => {
  try {
    const { title, description, start_date, end_date, all_day, start_time, end_time, category, color, location } = req.body;
    if (!title || !start_date) return res.status(400).json({ error: 'Title and start date are required' });
    const [result] = await pool.query(
      `INSERT INTO company_events (title, description, start_date, end_date, all_day, start_time, end_time, category, color, location, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || null, start_date, end_date || start_date, all_day ? 1 : 0,
       start_time || null, end_time || null, category || 'other', color || '#6366f1', location || null, req.user?.id || null]
    );
    const [rows] = await pool.query('SELECT * FROM company_events WHERE id = ?', [result.insertId]);
    // ── Activity log: Calendar Event Created ─────────────────────────────
    logActivity({ req, module: 'Calendar', action: 'Created',
      description: `Event (${title}) created` });
    res.status(201).json({ event: rows[0], message: 'Event created successfully' });
  } catch (err) { next(err); }
});

// PUT /api/calendar/events/:id - Update event
router.put('/events/:id', auth, canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['title','description','start_date','end_date','all_day','start_time','end_time','category','color','location'];
    const updates = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await pool.query(`UPDATE company_events SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM company_events WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });
    // ── Activity log: Calendar Event Updated ──────────────────────────────
    logActivity({ req, module: 'Calendar', action: 'Updated',
      description: `Event (${rows[0]?.title || id}) updated` });
    res.json({ event: rows[0], message: 'Event updated successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', auth, canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT id FROM company_events WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Event not found' });
    const [ev] = await pool.query('SELECT title FROM company_events WHERE id = ?', [id]);
    await pool.query('DELETE FROM company_events WHERE id = ?', [id]);
    logActivity({ req, module: 'Calendar', action: 'Deleted',
      description: `Event (${ev[0]?.title || id}) deleted` });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) { next(err); }
});

// ===================== CALENDAR VIEW =====================

// GET /api/calendar/view - Full calendar view (month view)
router.get('/view', auth, async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const { year, month } = req.query;
    const y = parseInt(year) || nowInTimezone(tz).getFullYear();
    const m = parseInt(month) || nowInTimezone(tz).getMonth() + 1;
    const startOfMonth = `${y}-${String(m).padStart(2,'0')}-01`;
    const endOfMonth = formatDate(new Date(y, m, 0), 'YYYY-MM-DD', tz);

    const [holidays] = await pool.query(
      'SELECT id, name, date, holiday_type, description FROM company_holidays WHERE date BETWEEN ? AND ? ORDER BY date',
      [startOfMonth, endOfMonth]
    );

    const [events] = await pool.query(
      'SELECT id, title, description, start_date, end_date, all_day, start_time, end_time, category, color, location FROM company_events WHERE start_date BETWEEN ? AND ? ORDER BY start_date',
      [startOfMonth, endOfMonth]
    );

    const [leaves] = await pool.query(
      `SELECT lr.id, lr.user_id, u.first_name, u.last_name, u.avatar_url,
              lr.start_date, lr.end_date, lt.name as leave_type, lt.color as leave_color
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?
       ORDER BY lr.start_date`,
      [endOfMonth, startOfMonth]
    );

    const [birthdays] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, date_of_birth FROM users
       WHERE date_of_birth IS NOT NULL AND date_of_birth != '0000-00-00'
       AND MONTH(date_of_birth) = ? AND status = 'active' ORDER BY DAYOFMONTH(date_of_birth)`,
      [m]
    );

    const [anniversaries] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, hire_date,
              TIMESTAMPDIFF(YEAR, hire_date, CURDATE()) as years,
              TIMESTAMPDIFF(MONTH, hire_date, CURDATE()) -
              TIMESTAMPDIFF(YEAR, hire_date, CURDATE()) * 12 as months
       FROM users
       WHERE hire_date IS NOT NULL AND hire_date != '0000-00-00'
       AND MONTH(hire_date) = ? AND status = 'active'
       ORDER BY DAYOFMONTH(hire_date)`,
      [m]
    );

    res.json({ holidays, events, leaves, birthdays, anniversaries });
  } catch (err) { next(err); }
});

// ===================== DASHBOARD WIDGETS =====================

// GET /api/calendar/dashboard - Dashboard widget data
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const today = nowInTimezone(tz);
    const todayStr = todayInTimezone(tz);
    // Dynamic date range: ?days=N (default 30 for full-month, ?days=7 for Next7Days widget)
    const days = parseInt(req.query.days) || 30;
    const targetDate = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
    const dayOffset = days;

    const [todaysHoliday] = await pool.query(
      'SELECT id, name, date, holiday_type FROM company_holidays WHERE date = ? LIMIT 1', [todayStr]
    );

    const [onLeaveToday] = await pool.query(
      `SELECT lr.id, u.first_name, u.last_name, u.avatar_url, lt.name as leave_type, lt.color as leave_color
       FROM leave_requests lr JOIN users u ON lr.user_id = u.id JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`, [todayStr, todayStr]
    );

    // Find birthdays within the dynamic window using day-of-year arithmetic.
    // Handles year-boundary crossing (e.g., Dec 28 + 10d = Jan 7).
    const [upcomingBirthdays] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, date_of_birth,
              MONTH(DATE_ADD(date_of_birth, INTERVAL IF(DAYOFYEAR(DATE_ADD(date_of_birth, INTERVAL YEAR(CURDATE()) - YEAR(date_of_birth) YEAR)) < DAYOFYEAR(CURDATE()), 1, 0) YEAR)) as upcoming_month,
              DAYOFMONTH(DATE_ADD(date_of_birth, INTERVAL IF(DAYOFYEAR(DATE_ADD(date_of_birth, INTERVAL YEAR(CURDATE()) - YEAR(date_of_birth) YEAR)) < DAYOFYEAR(CURDATE()), 1, 0) YEAR)) as upcoming_day
       FROM users u
       WHERE date_of_birth IS NOT NULL AND date_of_birth != '0000-00-00' AND status = 'active'
         AND (
           DAYOFYEAR(DATE_ADD(date_of_birth, INTERVAL YEAR(CURDATE()) - YEAR(date_of_birth) YEAR)) >= DAYOFYEAR(CURDATE())
           AND DAYOFYEAR(DATE_ADD(date_of_birth, INTERVAL YEAR(CURDATE()) - YEAR(date_of_birth) YEAR)) <= DAYOFYEAR(CURDATE()) + ?
           OR
           DAYOFYEAR(DATE_ADD(date_of_birth, INTERVAL YEAR(CURDATE()) - YEAR(date_of_birth) + 1 YEAR)) <= (DAYOFYEAR(CURDATE()) + ?) - 365
         )
       ORDER BY upcoming_month, upcoming_day LIMIT 5`,
      [dayOffset, dayOffset]
    );

    // Find work anniversaries within the dynamic window.
    const [upcomingAnniversaries] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, hire_date,
              TIMESTAMPDIFF(YEAR, hire_date, CURDATE()) as years,
              MONTH(DATE_ADD(hire_date, INTERVAL IF(DAYOFYEAR(DATE_ADD(hire_date, INTERVAL YEAR(CURDATE()) - YEAR(hire_date) YEAR)) < DAYOFYEAR(CURDATE()), 1, 0) YEAR)) as upcoming_month,
              DAYOFMONTH(DATE_ADD(hire_date, INTERVAL IF(DAYOFYEAR(DATE_ADD(hire_date, INTERVAL YEAR(CURDATE()) - YEAR(hire_date) YEAR)) < DAYOFYEAR(CURDATE()), 1, 0) YEAR)) as upcoming_day
       FROM users u
       WHERE hire_date IS NOT NULL AND hire_date != '0000-00-00' AND status = 'active'
         AND hire_date <= CURDATE()
         AND (
           DAYOFYEAR(DATE_ADD(hire_date, INTERVAL YEAR(CURDATE()) - YEAR(hire_date) YEAR)) >= DAYOFYEAR(CURDATE())
           AND DAYOFYEAR(DATE_ADD(hire_date, INTERVAL YEAR(CURDATE()) - YEAR(hire_date) YEAR)) <= DAYOFYEAR(CURDATE()) + ?
           OR
           DAYOFYEAR(DATE_ADD(hire_date, INTERVAL YEAR(CURDATE()) - YEAR(hire_date) + 1 YEAR)) <= (DAYOFYEAR(CURDATE()) + ?) - 365
         )
       ORDER BY upcoming_month, upcoming_day LIMIT 5`,
      [dayOffset, dayOffset]
    );

    const [upcomingEvents] = await pool.query(
      `SELECT id, title, start_date, category, color FROM company_events
       WHERE start_date BETWEEN ? AND ? ORDER BY start_date LIMIT 5`, [todayStr, targetDate]
    );

    // upcomingHolidays mapped seamlessly to EventItem shape for the widget
    const [upcomingHolidays] = await pool.query(
      `SELECT id, name as title, date as start_date, holiday_type as category FROM company_holidays
       WHERE date BETWEEN ? AND ? ORDER BY date LIMIT 5`, [todayStr, targetDate]
    );

    const [pendingLeaves] = await pool.query(
      `SELECT lr.id, u.first_name, u.last_name, u.avatar_url, lt.name as leave_type, lt.color as leave_color, lr.start_date, lr.end_date, lr.created_at
       FROM leave_requests lr JOIN users u ON lr.user_id = u.id JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'pending' ORDER BY lr.created_at DESC LIMIT 10`
    );

    res.json({
      todaysHoliday: todaysHoliday[0] || null,
      onLeaveToday,
      upcomingBirthdays,
      upcomingAnniversaries,
      upcomingEvents,
      upcomingHolidays,
      pendingLeaves,
    });
  } catch (err) { next(err); }
});

// GET /api/calendar/all - Admin: all holidays + events for a year
router.get('/all', auth, async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const { year } = req.query;
    const y = parseInt(year) || nowInTimezone(tz).getFullYear();
    const [holidays] = await pool.query('SELECT * FROM company_holidays WHERE YEAR(date) = ? ORDER BY date', [y]);
    const [events] = await pool.query('SELECT * FROM company_events WHERE YEAR(start_date) = ? ORDER BY start_date', [y]);
    res.json({ holidays, events });
  } catch (err) { next(err); }
});

module.exports = router;
