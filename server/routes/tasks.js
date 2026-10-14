const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const auth = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

router.use(auth);

// Helper to check user membership in the project that owns the task
function checkTaskAccess(req, res, next) {
  try {
    const taskId = req.params.id || req.params.taskId;
    if (!taskId) return res.status(400).json({ error: 'Missing task ID' });

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this project' });

    req.task = task;
    req.projectId = task.project_id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/tasks - create task directly
router.post('/', (req, res) => {
  try {
    const { title, description, column_id, project_id, priority, assignee_id, due_date, position } = req.body;
    if (!title || !column_id || !project_id) {
      return res.status(400).json({ error: 'Title, column_id, and project_id are required' });
    }

    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(project_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this project' });

    const maxPosRow = db.prepare('SELECT MAX(position) as maxPos FROM tasks WHERE column_id = ?').get(column_id);
    const taskPos = position !== undefined ? position : ((maxPosRow?.maxPos ?? -1) + 1);
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, column_id, project_id, title, description, priority, assignee_id, creator_id, position, due_date, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, column_id, project_id, title.trim(), description || '',
      priority || 'medium', assignee_id || null, req.user.id, taskPos, due_date || null, now, now
    );

    if (assignee_id && assignee_id !== req.user.id) {
      const notifId = uuidv4();
      db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(notifId, assignee_id, 'task_assigned', `You were assigned to task: ${title.trim()}`, project_id, id, now);
      try {
        getIO().to(`user:${assignee_id}`).emit('notification:new', {
          id: notifId, type: 'task_assigned', message: `You were assigned to task: ${title.trim()}`, task_id: id, created_at: now
        });
      } catch (_) {}
    }

    const task = db.prepare(`
      SELECT t.*, 
             a.username as assignee_username, a.avatar_color as assignee_avatar, 
             c.username as creator_username, c.avatar_color as creator_avatar,
             0 as comment_count
      FROM tasks t 
      LEFT JOIN users a ON t.assignee_id = a.id 
      LEFT JOIN users c ON t.creator_id = c.id 
      WHERE t.id = ?
    `).get(id);

    try {
      getIO().to(`project:${project_id}`).emit('task:created', task);
    } catch (_) {}

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/:id', checkTaskAccess, (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*, 
             a.username as assignee_username, a.avatar_color as assignee_avatar, 
             c.username as creator_username, c.avatar_color as creator_avatar,
             (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) as comment_count
      FROM tasks t 
      LEFT JOIN users a ON t.assignee_id = a.id 
      LEFT JOIN users c ON t.creator_id = c.id 
      WHERE t.id = ?
    `).get(req.params.id);

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id - update fields
router.put('/:id', checkTaskAccess, (req, res) => {
  try {
    const oldTask = req.task;
    const { title, description, priority, assignee_id, due_date, column_id } = req.body;
    const now = new Date().toISOString();

    const newTitle = title !== undefined ? title.trim() : oldTask.title;
    const newDesc = description !== undefined ? description : oldTask.description;
    const newPriority = priority !== undefined ? priority : oldTask.priority;
    const newAssignee = assignee_id !== undefined ? (assignee_id || null) : oldTask.assignee_id;
    const newDueDate = due_date !== undefined ? due_date : oldTask.due_date;
    const newColId = column_id !== undefined ? column_id : oldTask.column_id;

    db.prepare(`
      UPDATE tasks 
      SET title = ?, description = ?, priority = ?, assignee_id = ?, due_date = ?, column_id = ?, updated_at = ?
      WHERE id = ?
    `).run(newTitle, newDesc, newPriority, newAssignee, newDueDate, newColId, now, req.params.id);

    // Notify if new assignee
    if (newAssignee && newAssignee !== oldTask.assignee_id && newAssignee !== req.user.id) {
      const notifId = uuidv4();
      db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(notifId, newAssignee, 'task_assigned', `You were assigned to task: ${newTitle}`, req.projectId, req.params.id, now);
      try {
        getIO().to(`user:${newAssignee}`).emit('notification:new', {
          id: notifId, type: 'task_assigned', message: `You were assigned to task: ${newTitle}`, task_id: req.params.id, created_at: now
        });
      } catch (_) {}
    }

    const updatedTask = db.prepare(`
      SELECT t.*, 
             a.username as assignee_username, a.avatar_color as assignee_avatar, 
             c.username as creator_username, c.avatar_color as creator_avatar,
             (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) as comment_count
      FROM tasks t 
      LEFT JOIN users a ON t.assignee_id = a.id 
      LEFT JOIN users c ON t.creator_id = c.id 
      WHERE t.id = ?
    `).get(req.params.id);

    try {
      getIO().to(`project:${req.projectId}`).emit('task:updated', updatedTask);
    } catch (_) {}

    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id/move - move column or reposition
router.put('/:id/move', checkTaskAccess, (req, res) => {
  try {
    const { column_id, position } = req.body;
    const oldTask = req.task;
    const targetColId = column_id || oldTask.column_id;
    const targetPos = position !== undefined ? Number(position) : oldTask.position;

    db.transaction(() => {
      if (oldTask.column_id === targetColId) {
        if (targetPos < oldTask.position) {
          db.prepare('UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?').run(targetColId, targetPos, oldTask.position);
        } else if (targetPos > oldTask.position) {
          db.prepare('UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?').run(targetColId, oldTask.position, targetPos);
        }
      } else {
        db.prepare('UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?').run(oldTask.column_id, oldTask.position);
        db.prepare('UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?').run(targetColId, targetPos);
      }
      db.prepare('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
        targetColId, targetPos, new Date().toISOString(), req.params.id
      );
    })();

    const updatedTask = db.prepare(`
      SELECT t.*, 
             a.username as assignee_username, a.avatar_color as assignee_avatar, 
             c.username as creator_username, c.avatar_color as creator_avatar,
             (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) as comment_count
      FROM tasks t 
      LEFT JOIN users a ON t.assignee_id = a.id 
      LEFT JOIN users c ON t.creator_id = c.id 
      WHERE t.id = ?
    `).get(req.params.id);

    try {
      getIO().to(`project:${req.projectId}`).emit('task:moved', {
        id: req.params.id,
        taskId: req.params.id,
        task: updatedTask,
        column_id: targetColId,
        targetColumnId: targetColId,
        sourceColumnId: oldTask.column_id,
        position: targetPos,
        newPosition: targetPos
      });
    } catch (_) {}

    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', checkTaskAccess, (req, res) => {
  try {
    const task = req.task;
    db.transaction(() => {
      db.prepare('UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?').run(task.column_id, task.position);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    })();

    try {
      getIO().to(`project:${req.projectId}`).emit('task:deleted', { id: req.params.id, taskId: req.params.id, column_id: task.column_id });
    } catch (_) {}

    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id/comments
router.get('/:id/comments', checkTaskAccess, (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.*, u.username, u.avatar_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.id);

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', checkTaskAccess, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

    const task = req.task;
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO comments (id, task_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, req.params.id, req.user.id, content.trim(), now
    );

    const comment = db.prepare(`
      SELECT c.*, u.username, u.avatar_color
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.id = ?
    `).get(id);

    try {
      getIO().to(`project:${task.project_id}`).emit('comment:created', comment);
    } catch (_) {}

    // Notify assignee and creator if different from commenter
    const notifyUsers = new Set();
    if (task.assignee_id && task.assignee_id !== req.user.id) notifyUsers.add(task.assignee_id);
    if (task.creator_id && task.creator_id !== req.user.id) notifyUsers.add(task.creator_id);

    notifyUsers.forEach(userId => {
      const notifId = uuidv4();
      const notifMsg = `${req.user.username} commented on task: ${task.title}`;
      db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(notifId, userId, 'comment_added', notifMsg, task.project_id, req.params.id, now);
      try {
        getIO().to(`user:${userId}`).emit('notification:new', {
          id: notifId, type: 'comment_added', message: notifMsg, task_id: req.params.id, project_id: task.project_id, created_at: now
        });
      } catch (_) {}
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
