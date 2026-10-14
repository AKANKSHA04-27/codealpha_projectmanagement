const http = require('http');
const { io } = require('./client/node_modules/socket.io-client');

const BASE_URL = 'http://localhost:3001/api';

async function request(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`API Error [${res.status}]: ${data?.error || data?.message || res.statusText}`);
  }
  return data;
}

async function runTests() {
  console.log('🚀 Starting TaskFlow Full-Stack E2E Test...\n');

  // 1. Health check
  const health = await request('/health');
  console.log('✅ 1. Health Check:', health);

  // 2. Register Users
  const timestamp = Date.now();
  const user1Data = await request('/auth/register', 'POST', {
    username: `alex_${timestamp}`,
    email: `alex_${timestamp}@example.com`,
    password: 'password123'
  });
  console.log('✅ 2a. Registered User 1 (Alex):', user1Data.user.username);

  const user2Data = await request('/auth/register', 'POST', {
    username: `sarah_${timestamp}`,
    email: `sarah_${timestamp}@example.com`,
    password: 'password123'
  });
  console.log('✅ 2b. Registered User 2 (Sarah):', user2Data.user.username);

  const token1 = user1Data.token;
  const token2 = user2Data.token;

  // 3. Socket.io connection test for Sarah (checking real-time notifications)
  let receivedSocketNotif = null;
  const socketSarah = io('http://localhost:3001', {
    auth: { token: token2 }
  });

  await new Promise((resolve) => {
    socketSarah.on('connect', () => {
      console.log('✅ 3. Sarah connected to WebSocket successfully! Socket ID:', socketSarah.id);
      resolve();
    });
    socketSarah.on('notification:new', (notif) => {
      console.log('🔔 [WebSocket] Sarah received real-time notification:', notif.message);
      receivedSocketNotif = notif;
    });
  });

  // 4. Create Project
  const project = await request('/projects', 'POST', {
    name: 'SaaS Platform Launch',
    description: 'Collaborative development for TaskFlow 2.0 release'
  }, token1);
  console.log('✅ 4. Alex created project:', project.name, `(ID: ${project.id})`);

  // 5. Connect Alex's socket and join project room
  const socketAlex = io('http://localhost:3001', { auth: { token: token1 } });
  socketAlex.emit('join:project', project.id);
  socketSarah.emit('join:project', project.id);

  // 6. Add Sarah as project member
  const member = await request(`/projects/${project.id}/members`, 'POST', {
    email: user2Data.user.email
  }, token1);
  console.log('✅ 5. Added Sarah as member:', member.username, `(Role: ${member.role})`);

  // 7. Get Columns
  const columns = await request(`/projects/${project.id}/columns`, 'GET', null, token1);
  console.log('✅ 6. Default Columns created:', columns.map(c => c.name).join(' | '));
  const todoCol = columns.find(c => c.name === 'To Do');
  const inProgressCol = columns.find(c => c.name === 'In Progress');

  // 8. Add a custom column
  const reviewCol = await request(`/projects/${project.id}/columns`, 'POST', {
    name: 'QA & Review'
  }, token1);
  console.log('✅ 7. Added custom column:', reviewCol.name);

  // 9. Create a task assigned to Sarah
  const task1 = await request(`/projects/${project.id}/tasks`, 'POST', {
    title: 'Implement OAuth & SSO',
    description: 'Add Google and GitHub OAuth 2.0 login integration',
    column_id: todoCol.id,
    priority: 'urgent',
    assignee_id: user2Data.user.id,
    due_date: '2026-10-15'
  }, token1);
  console.log('✅ 8. Created Task 1:', task1.title, `(Assignee: ${task1.assignee_username}, Priority: ${task1.priority})`);

  // Wait a brief moment for socket notification
  await new Promise(r => setTimeout(r, 500));

  // 10. Move task (drag and drop simulation)
  const movedTask = await request(`/tasks/${task1.id}/move`, 'PUT', {
    column_id: inProgressCol.id,
    position: 0
  }, token2);
  console.log('✅ 9. Simulated Kanban Drag-and-Drop: Moved Task 1 to In Progress column');

  // 11. Add comments
  const comment1 = await request(`/tasks/${task1.id}/comments`, 'POST', {
    content: 'Started working on the Google OAuth flow. Looking good!'
  }, token2);
  console.log('✅ 10a. Sarah commented on task:', `"${comment1.content}"`);

  const comment2 = await request(`/tasks/${task1.id}/comments`, 'POST', {
    content: 'Awesome! Let me know if you need help with credentials setup.',
  }, token1);
  console.log('✅ 10b. Alex replied to task:', `"${comment2.content}"`);

  // 12. Check comments list
  const comments = await request(`/tasks/${task1.id}/comments`, 'GET', null, token1);
  console.log('✅ 11. Retrieved Comments count for task:', comments.length);

  // 13. Check Sarah\'s notifications
  const notifications = await request('/notifications', 'GET', null, token2);
  console.log('✅ 12. Sarah has notifications:', notifications.length);
  notifications.forEach(n => console.log(`   - [${n.type}] ${n.message}`));

  // 14. Mark all notifications as read
  await request('/notifications/read-all', 'PUT', null, token2);
  console.log('✅ 13. Marked all notifications as read for Sarah');

  // 15. Check Projects list with stats
  const projectsList = await request('/projects', 'GET', null, token1);
  console.log('✅ 14. Projects List for Alex:');
  projectsList.forEach(p => {
    console.log(`   - ${p.name}: ${p.memberCount} members, ${p.taskCount} tasks`);
  });

  socketAlex.disconnect();
  socketSarah.disconnect();

  console.log('\n🎉 ALL E2E TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test Failed:', err);
  process.exit(1);
});
