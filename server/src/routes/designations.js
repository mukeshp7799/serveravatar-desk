const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/designations — List all designations
router.get('/', auth, async (req, res, next) => {
  try {
    const [designations] = await pool.query('SELECT id, name, created_at FROM designations ORDER BY name ASC');
    res.json({ designations });
  } catch (err) { next(err); }
});

module.exports = router;
