const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const auth = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

router.use(auth);

// Helper to check project membership
function getProjectMember(projectId, userId) {
  return db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// GET /api/projects - list projects where user is owner or member
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT p.*, pm.role 
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
    `);
    const projects = stmt.all(req.user.id);
    
    // Enrich with counts
    const enriched = projects.map(p => {
      const memberCountRow = db.prepare('SELECT COUNT(*) as c FROM project_members WHERE project_id = ?').get(p.id);
      const taskCountRow = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE project_id = ?').get(p.id);
      return {
        ...p,
        memberCount: memberCountRow ? memberCountRow.c : 1,
        taskCount: taskCountRow ? taskCountRow.c : 0
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects - create a new project
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const projectId = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare('INSERT INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
        projectId, name.trim(), description || '', req.user.id, now
      );
      db.prepare('INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
        projectId, req.user.id, 'owner', now
      );
      
      const defaultCols = ['To Do', 'In Progress', 'Done'];
      const insertCol = db.prepare('INSERT INTO columns_table (id, project_id, name, position) VALUES (?, ?, ?, ?)');
      defaultCols.forEach((colName, index) => {
        insertCol.run(uuidv4(), projectId, colName, index);
      });
    })();

    const newProject = {
      id: projectId,
      name: name.trim(),
      description: description || '',
      owner_id: req.user.id,
      created_at: now,
      memberCount: 1,
      taskCount: 0
    };

    try {
      getIO().emit('project:created', newProject);
    } catch (_) {}

    res.status(201).json(newProject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id - get single project
router.get('/:id', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const columns = db.prepare('SELECT * FROM columns_table WHERE project_id = ? ORDER BY position ASC').all(req.params.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar_color, pm.role, pm.joined_at
      FROM project_members pm 
      JOIN users u ON pm.user_id = u.id 
      WHERE pm.project_id = ?
    `).all(req.params.id);
    
    const taskCounts = db.prepare('SELECT column_id, COUNT(id) as count FROM tasks WHERE project_id = ? GROUP BY column_id').all(req.params.id);
    const countsMap = {};
    taskCounts.forEach(tc => { countsMap[tc.column_id] = tc.count; });
    
    columns.forEach(col => {
      col.task_count = countsMap[col.id] || 0;
    });

    project.columns = columns;
    project.members = members;

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/columns
router.get('/:id/columns', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const columns = db.prepare('SELECT * FROM columns_table WHERE project_id = ? ORDER BY position ASC').all(req.params.id);
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/columns
router.post('/:id/columns', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const { name, position } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const maxPosRow = db.prepare('SELECT MAX(position) as maxPos FROM columns_table WHERE project_id = ?').get(req.params.id);
    const colPosition = position !== undefined ? position : ((maxPosRow?.maxPos ?? -1) + 1);
    const id = uuidv4();

    db.prepare('INSERT INTO columns_table (id, project_id, name, position) VALUES (?, ?, ?, ?)').run(
      id, req.params.id, name.trim(), colPosition
    );

    const column = { id, project_id: req.params.id, name: name.trim(), position: colPosition };

    try {
      getIO().to(`project:${req.params.id}`).emit('column:created', column);
    } catch (_) {}

    res.status(201).json(column);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/tasks
router.get('/:id/tasks', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const tasks = db.prepare(`
      SELECT t.*, 
             a.username as assignee_username, a.avatar_color as assignee_avatar,
             c.username as creator_username, c.avatar_color as creator_avatar,
             (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) as comment_count
      FROM tasks t
      LEFT JOIN users a ON t.assignee_id = a.id
      LEFT JOIN users c ON t.creator_id = c.id
      WHERE t.project_id = ?
      ORDER BY t.position ASC
    `).all(req.params.id);

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/tasks
router.post('/:id/tasks', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const { title, description, column_id, priority, assignee_id, due_date, position } = req.body;
    if (!title || !title.trim() || !column_id) {
      return res.status(400).json({ error: 'Title and column_id are required' });
    }

    const maxPosRow = db.prepare('SELECT MAX(position) as maxPos FROM tasks WHERE column_id = ?').get(column_id);
    const taskPosition = position !== undefined ? position : ((maxPosRow?.maxPos ?? -1) + 1);
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, column_id, project_id, title, description, priority, assignee_id, creator_id, position, due_date, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, column_id, req.params.id, title.trim(), description || '',
      priority || 'medium', assignee_id || null, req.user.id, taskPosition, due_date || null, now, now
    );

    if (assignee_id && assignee_id !== req.user.id) {
      const notifId = uuidv4();
      db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(notifId, assignee_id, 'task_assigned', `You were assigned to task: ${title.trim()}`, req.params.id, id, now);
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
      getIO().to(`project:${req.params.id}`).emit('task:created', task);
    } catch (_) {}

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/members
router.get('/:id/members', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this project' });

    const members = db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar_color, pm.role, pm.joined_at
      FROM project_members pm 
      JOIN users u ON pm.user_id = u.id 
      WHERE pm.project_id = ?
    `).all(req.params.id);

    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/members
router.post('/:id/members', (req, res) => {
  try {
    const invoker = getProjectMember(req.params.id, req.user.id);
    if (!invoker || (invoker.role !== 'owner' && invoker.role !== 'admin')) {
      return res.status(403).json({ error: 'Permission denied: only owner or admin can add members' });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = db.prepare('SELECT id, username, email, avatar_color FROM users WHERE email = ?').get(email.trim());
    if (!user) return res.status(404).json({ error: 'User not found with this email' });

    const checkExisting = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.id, user.id);
    if (checkExisting) return res.status(400).json({ error: 'User is already a member of this project' });

    const now = new Date().toISOString();
    db.prepare('INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
      req.params.id, user.id, 'member', now
    );

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.id);
    const addedMember = { ...user, role: 'member', joined_at: now };

    // Notify the added user
    const notifId = uuidv4();
    db.prepare('INSERT INTO notifications (id, user_id, type, message, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(notifId, user.id, 'project_invite', `You were added to project: ${project?.name || 'Project'}`, req.params.id, now);

    try {
      getIO().to(`project:${req.params.id}`).emit('member:added', addedMember);
      getIO().to(`user:${user.id}`).emit('notification:new', {
        id: notifId, type: 'project_invite', message: `You were added to project: ${project?.name || 'Project'}`, project_id: req.params.id, created_at: now
      });
    } catch (_) {}

    res.status(201).json(addedMember);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const invoker = getProjectMember(req.params.id, req.user.id);
    if (!invoker || (invoker.role !== 'owner' && invoker.role !== 'admin')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.id, req.params.userId);

    try {
      getIO().to(`project:${req.params.id}`).emit('member:removed', { userId: req.params.userId });
    } catch (_) {}
    
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id - update project
router.put('/:id', (req, res) => {
  try {
    const member = getProjectMember(req.params.id, req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { name, description } = req.body;
    db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
      name ? name.trim() : undefined, description, req.params.id
    );
    
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id - delete project
router.delete('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.owner_id !== req.user.id) return res.status(403).json({ error: 'Only project owner can delete project' });

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

    try {
      getIO().emit('project:deleted', { projectId: req.params.id });
    } catch (_) {}

    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
