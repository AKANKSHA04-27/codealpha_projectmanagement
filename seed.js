const bcrypt = require('./server/node_modules/bcryptjs');
const { v4: uuidv4 } = require('./server/node_modules/uuid');
const { db, initDB } = require('./server/db');

initDB();

async function seed() {
  console.log('🌱 Seeding TaskFlow database with demo data...');

  const passwordHash = await bcrypt.hash('password123', 10);
  const now = new Date().toISOString();

  // Create Users
  const users = [
    { id: uuidv4(), username: 'Alex Turner', email: 'demo@taskflow.dev', color: '#6366f1' },
    { id: uuidv4(), username: 'Sarah Connor', email: 'sarah@taskflow.dev', color: '#ec4899' },
    { id: uuidv4(), username: 'David Miller', email: 'david@taskflow.dev', color: '#10b981' },
    { id: uuidv4(), username: 'Elena Rostova', email: 'elena@taskflow.dev', color: '#f59e0b' }
  ];

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  users.forEach(u => {
    insertUser.run(u.id, u.username, u.email, passwordHash, u.color, now);
  });

  // Query actual user IDs
  const alex = db.prepare('SELECT id, username FROM users WHERE email = ?').get('demo@taskflow.dev');
  const sarah = db.prepare('SELECT id, username FROM users WHERE email = ?').get('sarah@taskflow.dev');
  const david = db.prepare('SELECT id, username FROM users WHERE email = ?').get('david@taskflow.dev');
  const elena = db.prepare('SELECT id, username FROM users WHERE email = ?').get('elena@taskflow.dev');

  // Create Project: Next-Gen Web App
  const projectId = uuidv4();
  db.prepare('INSERT OR IGNORE INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    projectId,
    'TaskFlow Web Platform 2.0',
    'Core product engineering including Kanban drag-and-drop, WebSocket real-time engine, and collaborative workspace.',
    alex.id,
    now
  );

  // Add members
  const addMember = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
  addMember.run(projectId, alex.id, 'owner', now);
  addMember.run(projectId, sarah.id, 'member', now);
  addMember.run(projectId, david.id, 'member', now);
  addMember.run(projectId, elena.id, 'member', now);

  // Columns
  const cols = [
    { id: uuidv4(), name: 'Backlog', pos: 0 },
    { id: uuidv4(), name: 'In Progress', pos: 1 },
    { id: uuidv4(), name: 'Code Review', pos: 2 },
    { id: uuidv4(), name: 'Completed', pos: 3 }
  ];

  const insertCol = db.prepare('INSERT OR IGNORE INTO columns_table (id, project_id, name, position) VALUES (?, ?, ?, ?)');
  cols.forEach(c => insertCol.run(c.id, projectId, c.name, c.pos));

  // Tasks
  const tasks = [
    {
      id: uuidv4(),
      col: cols[1].id, // In Progress
      title: 'Real-Time WebSocket Collaboration',
      desc: 'Broadcast task drag-and-drop movements, comment activity, and team notifications with Socket.IO.',
      priority: 'urgent',
      assignee: alex.id,
      due: '2026-10-10'
    },
    {
      id: uuidv4(),
      col: cols[1].id, // In Progress
      title: 'Interactive HTML5 Kanban Drag & Drop',
      desc: 'Smooth native draggable cards with column drag-over styling and optimistic position re-ordering.',
      priority: 'high',
      assignee: sarah.id,
      due: '2026-10-12'
    },
    {
      id: uuidv4(),
      col: cols[0].id, // Backlog
      title: 'Role-Based Access Control (RBAC)',
      desc: 'Support Admin, Member, and Viewer permissions on project boards and team settings.',
      priority: 'medium',
      assignee: david.id,
      due: '2026-10-25'
    },
    {
      id: uuidv4(),
      col: cols[2].id, // Code Review
      title: 'JWT Authentication & Session Refresh',
      desc: 'Secure bearer token verification, protected routes, and bcrypt password hashing.',
      priority: 'high',
      assignee: elena.id,
      due: '2026-10-08'
    },
    {
      id: uuidv4(),
      col: cols[3].id, // Completed
      title: 'Dark Theme UI & Component Styling',
      desc: 'Custom Linear/Notion-inspired dark palette with CSS variables, badge indicators, and glassmorphism headers.',
      priority: 'medium',
      assignee: sarah.id,
      due: '2026-10-01'
    }
  ];

  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (id, column_id, project_id, title, description, priority, assignee_id, creator_id, position, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  tasks.forEach((t, idx) => {
    insertTask.run(t.id, t.col, projectId, t.title, t.desc, t.priority, t.assignee, alex.id, idx, t.due, now, now);
  });

  // Comments on Task 1
  const insertComment = db.prepare('INSERT OR IGNORE INTO comments (id, task_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)');
  insertComment.run(uuidv4(), tasks[0].id, sarah.id, 'Socket room events are firing properly across multiple browser tabs!', now);
  insertComment.run(uuidv4(), tasks[0].id, alex.id, 'Great job Sarah! Tested with 4 concurrent team members and updates were instantaneous.', now);

  // Add a sample notification for Alex
  const notifId = uuidv4();
  db.prepare('INSERT OR IGNORE INTO notifications (id, user_id, type, message, project_id, task_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    notifId, alex.id, 'comment_added', 'Sarah Connor commented on task: Real-Time WebSocket Collaboration', projectId, tasks[0].id, 0, now
  );

  console.log('✅ Demo data created successfully!');
  console.log('🔑 Login Credentials:');
  console.log('   Email:    demo@taskflow.dev');
  console.log('   Password: password123');
}

seed().catch(console.error);
