# TaskFlow — Collaborative Project Management & Kanban Platform

A full-stack, real-time collaborative project management application built with **React**, **Node.js/Express**, **SQLite**, and **Socket.IO** (inspired by Trello and Asana).

---

## 🌟 Key Features

### 1. Group Projects & Workspace
- Create group projects with custom names and descriptions.
- Invite team members by email with role-based assignment (`owner`, `member`).
- Real-time project member list with initials & color-coded avatars.
- Interactive Dashboard showing project cards with live member and task counts.

### 2. Interactive Kanban Boards & Task Cards
- Flexible Kanban columns: **To Do**, **In Progress**, **Review**, **Done**, or custom columns.
- **Native HTML5 Drag & Drop**: Drag task cards seamlessly between columns with real-time position re-ordering and visual drag feedback.
- Rich Task Cards displaying:
  - Priority badge: `Urgent` (Red), `High` (Orange), `Medium` (Indigo), `Low` (Muted)
  - Title and description preview
  - Due date indicator
  - Comment count indicator
  - Assignee avatar with custom color

### 3. Task Details & Team Communication
- Modal slide-over for deep task inspection:
  - Editable title & description
  - Column status selector
  - Member assignment dropdown
  - Priority & due date picker
  - Task deletion
- **Real-Time Task Comments**: Full team discussion thread inside each task card, updating instantaneously via WebSockets across all active participants.

### 4. Real-Time WebSockets & Notifications
- Powered by **Socket.IO** with authenticated rooms:
  - `project:{id}` room: Live board synchronization on task creation, moves, edits, deletions, and comments.
  - `user:{id}` room: Targeted instant push notifications.
- In-App Notifications Dropdown in the top navigation bar:
  - Unread count badge
  - Real-time notification arrival
  - One-click "Mark all as read"
  - Notifications for task assignments, comment mentions, and project invitations.

### 5. Authentication & Security
- Secure registration and login using **JWT (JSON Web Tokens)** stored in `localStorage`.
- Passwords hashed with **bcryptjs**.
- Protected API routes and protected React Router navigation.
- Automatic session hydration on page reload.

---

## 🏗️ Architecture & Technology Stack

```
project-management-tool/
├── client/                     # Frontend (React 18 + Vite)
│   ├── src/
│   │   ├── components/         # Navbar, TaskCard, TaskModal, Modals, Dropdowns
│   │   ├── contexts/           # AuthContext (Auth state & JWT)
│   │   ├── pages/              # AuthPage, Dashboard, ProjectBoard
│   │   ├── api.js              # REST client wrapper with Bearer token injection
│   │   ├── socket.js           # Socket.IO client singleton with auth
│   │   ├── App.jsx             # React Router routing & ProtectedRoute
│   │   └── index.css           # 900+ lines modern dark theme (Linear/Notion style)
│   └── package.json
├── server/                     # Backend (Node.js + Express + Socket.IO)
│   ├── middleware/             # JWT auth middleware
│   ├── routes/                 # auth, projects, columns, tasks, comments, notifications
│   ├── db.js                   # SQLite database initialization & transaction helper
│   ├── socket.js               # Socket.IO rooms & event dispatchers
│   ├── index.js                # Server entry point + static client serving
│   └── package.json
├── seed.js                     # Sample data seeder (users, projects, tasks, comments)
├── test-e2e.js                 # Complete automated E2E integration test suite
└── package.json                # Project root runner
```

---

## 🚀 Quickstart & How to Run

### Prerequisites
- Node.js (v18+)

### 1. Start the Application
Run the backend server (which serves both the API and the built React frontend):

```bash
cd project-management-tool
node server/index.js
```

Open your browser to: **[http://localhost:3001](http://localhost:3001)**

---

## 🔑 Demo Account Credentials

Use the pre-seeded account to test immediately:
- **Email:** `demo@taskflow.dev`
- **Password:** `password123`

Other available team member accounts (for testing multi-user collaboration and notifications):
- `sarah@taskflow.dev` (Password: `password123`)
- `david@taskflow.dev` (Password: `password123`)
- `elena@taskflow.dev` (Password: `password123`)

*Tip: Open two separate browser windows (or an Incognito window) logged in as Alex and Sarah to observe real-time drag-and-drop and comments updating simultaneously!*

---

## 🧪 Automated End-to-End Test Suite

Run the full automated integration test covering auth, project creation, columns, tasks, drag-and-drop, comments, and WebSockets:

```bash
node test-e2e.js
```
