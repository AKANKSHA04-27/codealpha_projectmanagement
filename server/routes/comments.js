const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const auth = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

router.use(auth);

router.get('/:taskId/comments', (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.*, u.username, u.avatar_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.taskId);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:taskId/comments', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const task = db.prepare('SELECT project_id, title, assignee_id, creator_id FROM tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO comments (id, task_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.params.taskId, req.user.id, content, now);

    const comment = db.prepare(`
      SELECT c.*, u.username, u.avatar_color
      FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
    `).get(id);

    getIO().to(`project:${task.project_id}`).emit('comment:created', comment);

    // Notify assignee and creator if different from commenter
    const notifyUsers = new Set();
    if (task.assignee_id && task.assignee_id !== req.user.id) notifyUsers.add(task.assignee_id);
    if (task.creator_id && task.creator_id !== req.user.id) notifyUsers.add(task.creator_id);

    notifyUsers.forEach(userId => {
        const notifId = uuidv4();
        db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(notifId, userId, 'comment_added', `${req.user.username} commented on task: ${task.title}`, task.project_id, req.params.taskId, now);
        getIO().to(`user:${userId}`).emit('notification:new', { 
            id: notifId, type: 'comment_added', message: `${req.user.username} commented on task: ${task.title}`, task_id: req.params.taskId 
        });
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const comment = db.prepare('SELECT user_id, task_id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Can only delete your own comments' });

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
