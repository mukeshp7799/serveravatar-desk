const express = require('express');
const { getCompanySetting, nowInTimezone, todayInTimezone, formatDate, formatTime } = require('../utils/timezone');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

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
    await pool.query('DELETE FROM company_holidays WHERE id = ?', [id]);
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
    res.json({ event: rows[0], message: 'Event updated successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', auth, canManageEvents, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT id FROM company_events WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Event not found' });
    await pool.query('DELETE FROM company_events WHERE id = ?', [id]);
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
      `SELECT id, first_name, last_name, avatar_url, hire_date FROM users
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
    const y = today.getFullYear(), m = today.getMonth() + 1;
    const todayStr = todayInTimezone(tz);
    const thirtyDaysLater = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const [todaysHoliday] = await pool.query(
      'SELECT id, name, date, holiday_type FROM company_holidays WHERE date = ? LIMIT 1', [todayStr]
    );

    const [onLeaveToday] = await pool.query(
      `SELECT lr.id, u.first_name, u.last_name, u.avatar_url, lt.name as leave_type, lt.color as leave_color
       FROM leave_requests lr JOIN users u ON lr.user_id = u.id JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`, [todayStr, todayStr]
    );

    const [upcomingBirthdays] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, date_of_birth,
              IF(DAYOFMONTH(date_of_birth) < DAYOFMONTH(CURDATE()), MONTH(DATE_ADD(date_of_birth, INTERVAL 1 YEAR)), MONTH(date_of_birth)) as upcoming_month,
              IF(DAYOFMONTH(date_of_birth) < DAYOFMONTH(CURDATE()), DAYOFMONTH(DATE_ADD(date_of_birth, INTERVAL 1 YEAR)), DAYOFMONTH(date_of_birth)) as upcoming_day
       FROM users
       WHERE date_of_birth IS NOT NULL AND date_of_birth != '0000-00-00' AND status = 'active'
       AND (
         (MONTH(date_of_birth) = MONTH(CURDATE()) AND DAYOFMONTH(date_of_birth) >= DAYOFMONTH(CURDATE())) OR
         (MONTH(DATE_ADD(date_of_birth, INTERVAL 1 YEAR)) = MONTH(CURDATE()) AND DAYOFMONTH(DATE_ADD(date_of_birth, INTERVAL 1 YEAR)) <= DAYOFMONTH(CURDATE()) + 30)
       )
       ORDER BY upcoming_month, upcoming_day LIMIT 5`
    );

    const [upcomingAnniversaries] = await pool.query(
      `SELECT id, first_name, last_name, avatar_url, hire_date,
              TIMESTAMPDIFF(YEAR, hire_date, CURDATE()) + 1 as years
       FROM users
       WHERE hire_date IS NOT NULL AND hire_date != '0000-00-00' AND status = 'active'
       AND MONTH(hire_date) = MONTH(CURDATE()) AND DAYOFMONTH(hire_date) >= DAYOFMONTH(CURDATE())
       AND hire_date <= CURDATE()
       ORDER BY DAYOFMONTH(hire_date) LIMIT 5`
    );

    const [upcomingEvents] = await pool.query(
      `SELECT id, title, start_date, category, color FROM company_events
       WHERE start_date BETWEEN ? AND ? ORDER BY start_date LIMIT 5`, [todayStr, thirtyDaysLater]
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
