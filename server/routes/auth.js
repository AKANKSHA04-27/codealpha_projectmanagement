const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function generateColor() {
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'];
  return colors[Math.floor(Math.random() * colors.length)];
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    if (checkStmt.get(username, email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    const avatar_color = generateColor();
    const created_at = new Date().toISOString();

    const insertStmt = db.prepare('INSERT INTO users (id, username, email, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertStmt.run(id, username, email, password_hash, avatar_color, created_at);

    const user = { id, username, email, avatar_color };
    const token = jwt.sign(user, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email);
    if (!row) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = { id: row.id, username: row.username, email: row.email, avatar_color: row.avatar_color };
    const token = jwt.sign(user, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', auth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, username, email, avatar_color, created_at FROM users WHERE id = ?');
    const user = stmt.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
