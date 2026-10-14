const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const auth = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

router.use(auth);

// Helper to check column access
function checkColumnAccess(req, res, next) {
  try {
    const colId = req.params.id;
    if (!colId) return res.status(400).json({ error: 'Missing column ID' });

    const col = db.prepare('SELECT * FROM columns_table WHERE id = ?').get(colId);
    if (!col) return res.status(404).json({ error: 'Column not found' });

    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(col.project_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this project' });

    req.column = col;
    req.projectId = col.project_id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/columns/:id - rename column
router.put('/:id', checkColumnAccess, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    db.prepare('UPDATE columns_table SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    
    const column = db.prepare('SELECT * FROM columns_table WHERE id = ?').get(req.params.id);
    try {
      getIO().to(`project:${req.projectId}`).emit('column:updated', column);
    } catch (_) {}

    res.json(column);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/columns/:id/move - change position
router.put('/:id/move', checkColumnAccess, (req, res) => {
  try {
    const { position } = req.body;
    const col = req.column;
    const newPos = Number(position);
    const oldPos = col.position;

    if (oldPos === newPos) return res.json(col);

    db.transaction(() => {
      if (newPos < oldPos) {
        db.prepare('UPDATE columns_table SET position = position + 1 WHERE project_id = ? AND position >= ? AND position < ?').run(req.projectId, newPos, oldPos);
      } else {
        db.prepare('UPDATE columns_table SET position = position - 1 WHERE project_id = ? AND position > ? AND position <= ?').run(req.projectId, oldPos, newPos);
      }
      db.prepare('UPDATE columns_table SET position = ? WHERE id = ?').run(newPos, req.params.id);
    })();

    const updated = db.prepare('SELECT * FROM columns_table WHERE id = ?').get(req.params.id);
    try {
      getIO().to(`project:${req.projectId}`).emit('column:updated', updated);
    } catch (_) {}

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/columns/:id
router.delete('/:id', checkColumnAccess, (req, res) => {
  try {
    const col = req.column;
    db.transaction(() => {
      const fallbackCol = db.prepare('SELECT id FROM columns_table WHERE project_id = ? AND id != ? ORDER BY position ASC LIMIT 1').get(req.projectId, req.params.id);
      if (fallbackCol) {
        db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(fallbackCol.id, req.params.id);
      } else {
        db.prepare('DELETE FROM tasks WHERE column_id = ?').run(req.params.id);
      }
      db.prepare('UPDATE columns_table SET position = position - 1 WHERE project_id = ? AND position > ?').run(req.projectId, col.position);
      db.prepare('DELETE FROM columns_table WHERE id = ?').run(req.params.id);
    })();
    
    try {
      getIO().to(`project:${req.projectId}`).emit('column:deleted', { columnId: req.params.id, id: req.params.id });
    } catch (_) {}

    res.json({ message: 'Column deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
