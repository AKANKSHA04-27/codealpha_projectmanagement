import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import { Plus, Users, Settings, MoreHorizontal } from 'lucide-react';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import AddMemberModal from '../components/AddMemberModal';

const ProjectBoard = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState({}); // columnId -> array of tasks
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isAddColumnMode, setIsAddColumnMode] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  
  // For adding tasks inline
  const [addingTaskToColumn, setAddingTaskToColumn] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [draggedTask, setDraggedTask] = useState(null);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);
      const projData = await api.get(`/projects/${id}`);
      setProject(projData);

      const colsData = await api.get(`/projects/${id}/columns`);
      setColumns(colsData);

      const tasksData = await api.get(`/projects/${id}/tasks`);
      const groupedTasks = {};
      colsData.forEach(c => groupedTasks[c.id] = []);
      tasksData.forEach(t => {
        if (!groupedTasks[t.column_id]) groupedTasks[t.column_id] = [];
        groupedTasks[t.column_id].push(t);
      });
      // Sort tasks by position
      Object.keys(groupedTasks).forEach(colId => {
        groupedTasks[colId].sort((a, b) => a.position - b.position);
      });
      setTasks(groupedTasks);

      const membersData = await api.get(`/projects/${id}/members`);
      setMembers(membersData);
    } catch (err) {
      console.error('Failed to fetch project board', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();

    const socket = getSocket();
    if (socket) {
      socket.emit('join:project', id);

      const handleTaskCreated = (task) => {
        setTasks(prev => {
          const colTasks = [...(prev[task.column_id] || []), task];
          return { ...prev, [task.column_id]: colTasks };
        });
      };

      const handleTaskUpdated = (task) => {
        setTasks(prev => {
          const next = { ...prev };
          // If task moved columns, it's handled by task:moved typically, but just in case
          Object.keys(next).forEach(colId => {
            next[colId] = next[colId].filter(t => t.id !== task.id);
          });
          if (!next[task.column_id]) next[task.column_id] = [];
          next[task.column_id].push(task);
          next[task.column_id].sort((a, b) => a.position - b.position);
          return next;
        });
        
        if (selectedTask?.id === task.id) {
            setSelectedTask(task);
        }
      };

      const handleTaskDeleted = ({ taskId }) => {
        setTasks(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(colId => {
            next[colId] = next[colId].filter(t => t.id !== taskId);
          });
          return next;
        });
        if (selectedTask?.id === taskId) {
            setSelectedTask(null);
        }
      };

      const handleTaskMoved = ({ task, sourceColumnId, targetColumnId, newPosition }) => {
         // Trust the incoming task object state and update lists. We usually just re-fetch or apply delta.
         // Simpler to just re-fetch for perfect sync, or optimistically update. Let's do delta.
         setTasks(prev => {
             const next = {...prev};
             if (next[sourceColumnId]) next[sourceColumnId] = next[sourceColumnId].filter(t => t.id !== task.id);
             if (!next[targetColumnId]) next[targetColumnId] = [];
             
             // Check if it's already there (local optimism)
             if (!next[targetColumnId].find(t => t.id === task.id)) {
                 next[targetColumnId].push(task);
             } else {
                 next[targetColumnId] = next[targetColumnId].map(t => t.id === task.id ? task : t);
             }
             next[targetColumnId].sort((a, b) => a.position - b.position);
             return next;
         });
      };

      const handleColumnCreated = (col) => setColumns(prev => [...prev, col]);
      const handleColumnDeleted = ({ columnId }) => {
          setColumns(prev => prev.filter(c => c.id !== columnId));
      };
      
      const handleMemberAdded = (member) => setMembers(prev => [...prev, member]);
      const handleMemberRemoved = ({ userId }) => setMembers(prev => prev.filter(m => m.user_id !== userId));

      socket.on('task:created', handleTaskCreated);
      socket.on('task:updated', handleTaskUpdated);
      socket.on('task:deleted', handleTaskDeleted);
      socket.on('task:moved', handleTaskMoved);
      socket.on('column:created', handleColumnCreated);
      socket.on('column:deleted', handleColumnDeleted);
      socket.on('member:added', handleMemberAdded);
      socket.on('member:removed', handleMemberRemoved);

      return () => {
        socket.emit('leave:project', id);
        socket.off('task:created');
        socket.off('task:updated');
        socket.off('task:deleted');
        socket.off('task:moved');
        socket.off('column:created');
        socket.off('column:deleted');
        socket.off('member:added');
        socket.off('member:removed');
      };
    }
  }, [id]);

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    try {
      const col = await api.post(`/projects/${id}/columns`, {
        name: newColumnName,
        position: columns.length
      });
      // The socket will broadcast to others, local update might be needed or handled by socket.
      // Usually good to update local immediately
      setColumns(prev => [...prev, col]);
      setNewColumnName('');
      setIsAddColumnMode(false);
    } catch (err) {
      console.error('Error adding column', err);
    }
  };

  const handleAddTask = async (columnId) => {
    if (!newTaskTitle.trim()) return;
    try {
      const position = tasks[columnId]?.length || 0;
      const task = await api.post(`/projects/${id}/tasks`, {
        title: newTaskTitle,
        column_id: columnId,
        position
      });
      setTasks(prev => ({
        ...prev,
        [columnId]: [...(prev[columnId] || []), task]
      }));
      setNewTaskTitle('');
      setAddingTaskToColumn(null);
    } catch (err) {
      console.error('Error adding task', err);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, task, sourceColumnId) => {
    e.dataTransfer.effectAllowed = 'move';
    // Store data to transfer
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('sourceColumnId', sourceColumnId);
    setDraggedTask(task);
    setTimeout(() => {
        if (e.target) e.target.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (e) => {
      e.target.classList.remove('dragging');
      setDraggedTask(null);
      // Remove all dragover highlights
      document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    const column = e.currentTarget;
    if (!column.classList.contains('drag-over')) {
        column.classList.add('drag-over');
    }
  };

  const handleDragLeave = (e) => {
      e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (e, targetColumnId) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const taskId = e.dataTransfer.getData('taskId');
    const sourceColumnId = e.dataTransfer.getData('sourceColumnId');

    if (!taskId || !sourceColumnId) return;

    // Determine new position. Simplified: just add to end of target column.
    // For proper sorting, one would calculate position based on mouse coordinates over target tasks.
    const targetTasks = tasks[targetColumnId] || [];
    const newPosition = targetTasks.length;

    if (sourceColumnId === targetColumnId && draggedTask?.position === newPosition) {
        return; // No change
    }

    // Optimistic UI update
    const taskToMove = (tasks[sourceColumnId] || []).find(t => t.id === parseInt(taskId) || t.id === taskId);
    if (!taskToMove) return;

    const updatedTask = { ...taskToMove, column_id: targetColumnId, position: newPosition };

    setTasks(prev => {
        const next = { ...prev };
        next[sourceColumnId] = next[sourceColumnId].filter(t => t.id !== taskToMove.id);
        if (!next[targetColumnId]) next[targetColumnId] = [];
        next[targetColumnId] = [...next[targetColumnId], updatedTask];
        return next;
    });

    try {
        await api.put(`/tasks/${taskId}/move`, {
            column_id: targetColumnId,
            position: newPosition
        });
    } catch (err) {
        console.error('Failed to move task', err);
        // Revert on failure
        fetchProjectData();
    }
  };


  if (isLoading) return <div className="page-loading">Loading project...</div>;
  if (!project) return <div className="error-message">Project not found.</div>;

  return (
    <div className="project-board-container">
      <header className="board-header">
        <div className="board-info">
          <h1>{project.name}</h1>
          {project.description && <p>{project.description}</p>}
        </div>
        
        <div className="board-actions">
          <div className="member-avatars">
            {members.slice(0, 5).map(m => (
              <div key={m.id || m.user_id} className="avatar-circle" title={m.user?.username || m.username}>
                {(m.user?.username || m.username || '?').charAt(0).toUpperCase()}
              </div>
            ))}
            {members.length > 5 && <div className="avatar-circle more">+{members.length - 5}</div>}
          </div>
          
          <button className="btn btn-secondary" onClick={() => setIsAddMemberModalOpen(true)}>
            <Users size={16} /> Add Member
          </button>
          <button className="btn btn-icon">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div className="kanban-board">
        {columns.map(column => (
          <div 
            key={column.id} 
            className="kanban-column"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="column-header">
              <h3>{column.name}</h3>
              <span className="task-count">{(tasks[column.id] || []).length}</span>
              <button className="btn-icon-small"><MoreHorizontal size={16} /></button>
            </div>
            
            <div className="column-tasks">
              {(tasks[column.id] || []).map(task => (
                <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task, column.id)}
                    onDragEnd={handleDragEnd}
                >
                    <TaskCard 
                        task={task} 
                        onClick={() => setSelectedTask(task)} 
                    />
                </div>
              ))}
              
              {addingTaskToColumn === column.id ? (
                <div className="add-task-form">
                  <textarea 
                    autoFocus
                    placeholder="What needs to be done?"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddTask(column.id);
                      }
                    }}
                  />
                  <div className="add-task-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => handleAddTask(column.id)}>Add Task</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAddingTaskToColumn(null); setNewTaskTitle(''); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="add-task-btn" onClick={() => setAddingTaskToColumn(column.id)}>
                  <Plus size={16} /> Add a task
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="add-column-wrapper">
          {isAddColumnMode ? (
            <div className="add-column-form">
              <input 
                type="text" 
                autoFocus
                placeholder="Enter column name..."
                value={newColumnName}
                onChange={e => setNewColumnName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddColumn()}
              />
              <div className="add-task-actions">
                <button className="btn btn-primary btn-sm" onClick={handleAddColumn}>Add Column</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsAddColumnMode(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="add-column-btn" onClick={() => setIsAddColumnMode(true)}>
              <Plus size={16} /> Add another column
            </button>
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskModal 
          task={selectedTask} 
          projectId={id}
          columns={columns}
          members={members}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={(updated) => {
              setTasks(prev => {
                  const next = {...prev};
                  Object.keys(next).forEach(colId => {
                    next[colId] = (next[colId] || []).filter(t => t.id !== updated.id);
                  });
                  if (!next[updated.column_id]) next[updated.column_id] = [];
                  next[updated.column_id].push(updated);
                  next[updated.column_id].sort((a, b) => a.position - b.position);
                  return next;
              });
              setSelectedTask(updated);
          }}
          onTaskDeleted={(deletedId) => {
              setTasks(prev => {
                  const next = {...prev};
                  Object.keys(next).forEach(colId => {
                    next[colId] = (next[colId] || []).filter(t => t.id !== deletedId);
                  });
                  return next;
              });
              setSelectedTask(null);
          }}
        />
      )}

      {isAddMemberModalOpen && (
        <AddMemberModal
            projectId={id}
            currentMembers={members}
            onClose={() => setIsAddMemberModalOpen(false)}
            onMemberAdded={(m) => setMembers(prev => [...prev, m])}
        />
      )}
    </div>
  );
};

export default ProjectBoard;
