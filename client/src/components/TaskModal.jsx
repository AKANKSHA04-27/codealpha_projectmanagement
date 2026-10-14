import React, { useState, useEffect } from 'react';
import { X, Calendar, AlignLeft, User, Hash, MessageSquare, Trash2, Send } from 'lucide-react';
import { api } from '../api';
import { getSocket } from '../socket';
import { useAuth } from '../contexts/AuthContext';

const TaskModal = ({ task, projectId, columns, members, onClose, onTaskUpdated, onTaskDeleted }) => {
  const { user } = useAuth();
  const [editedTask, setEditedTask] = useState(task);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditedTask(task);
    const fetchComments = async () => {
      try {
        const data = await api.get(`/tasks/${task.id}/comments`);
        setComments(data || []);
      } catch (err) {
        console.error('Failed to fetch comments', err);
      }
    };
    fetchComments();

    const socket = getSocket();
    if (socket) {
      const handleCommentCreated = (comment) => {
        if (comment.task_id === task.id) {
          setComments(prev => {
            if (prev.some(c => c.id === comment.id)) return prev;
            return [...prev, comment];
          });
        }
      };
      socket.on('comment:created', handleCommentCreated);
      return () => socket.off('comment:created', handleCommentCreated);
    }
  }, [task.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await api.put(`/tasks/${task.id}`, editedTask);
      onTaskUpdated(updated);
      onClose();
    } catch (err) {
      console.error('Failed to update task', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      if (onTaskDeleted) onTaskDeleted(task.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  const handleAddComment = async (e) => {
    if (e) e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const added = await api.post(`/tasks/${task.id}/comments`, { content: newComment.trim() });
      setComments(prev => {
        if (prev.some(c => c.id === added.id)) return prev;
        return [...prev, added];
      });
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment', err);
    }
  };

  const handleChange = (field, value) => {
    setEditedTask(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content task-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <input 
            className="task-title-input"
            value={editedTask.title || ''}
            onChange={e => handleChange('title', e.target.value)}
            placeholder="Task Title"
          />
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="task-modal-body">
          <div className="task-main">
            <div className="section">
              <h4><AlignLeft size={16} /> Description</h4>
              <textarea 
                className="task-desc-textarea"
                placeholder="Add a more detailed description..."
                value={editedTask.description || ''}
                onChange={e => handleChange('description', e.target.value)}
              />
            </div>

            <div className="section comments-section">
              <h4><MessageSquare size={16} /> Activity & Discussion</h4>
              <form onSubmit={handleAddComment} className="add-comment">
                <div 
                  className="avatar-circle small"
                  style={{ backgroundColor: user?.avatar_color || '#6366f1', color: '#fff' }}
                >
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="comment-input-wrapper">
                  <textarea 
                    placeholder="Write a comment or update the team..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!newComment.trim()}>
                      <Send size={14} /> Comment
                    </button>
                  </div>
                </div>
              </form>
              
              <div className="comments-list">
                {comments.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
                    No comments yet. Start the conversation!
                  </div>
                ) : (
                  comments.map(comment => {
                    const commenterName = comment.username || comment.user?.username || 'Team Member';
                    const commenterAvatar = comment.avatar_color || comment.user?.avatar_color || '#6366f1';
                    return (
                      <div key={comment.id} className="comment-item">
                        <div 
                          className="avatar-circle small" 
                          style={{ backgroundColor: commenterAvatar, color: '#fff' }}
                        >
                          {commenterName.charAt(0).toUpperCase()}
                        </div>
                        <div className="comment-content">
                          <div className="comment-header">
                            <span className="comment-author">{commenterName}</span>
                            <span className="comment-time">{new Date(comment.created_at || comment.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="comment-text">{comment.content}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="task-sidebar">
            <div className="sidebar-section">
              <h4><Hash size={14} /> Column Status</h4>
              <select 
                value={editedTask.column_id} 
                onChange={e => handleChange('column_id', e.target.value)}
              >
                {columns.map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>

            <div className="sidebar-section">
              <h4><User size={14} /> Assignee</h4>
              <select 
                value={editedTask.assignee_id || ''} 
                onChange={e => handleChange('assignee_id', e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {members.map(m => {
                  const mId = m.id || m.user_id;
                  const mName = m.username || m.user?.username;
                  return (
                    <option key={mId} value={mId}>
                      {mName} {m.role === 'owner' ? '(Owner)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="sidebar-section">
              <h4>Priority</h4>
              <select 
                value={editedTask.priority || 'medium'} 
                onChange={e => handleChange('priority', e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="sidebar-section">
              <h4><Calendar size={14} /> Due Date</h4>
              <input 
                type="date" 
                value={editedTask.due_date ? editedTask.due_date.split('T')[0] : ''}
                onChange={e => handleChange('due_date', e.target.value)}
              />
            </div>

            <div className="sidebar-actions" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button className="btn btn-primary w-full" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-danger w-full" onClick={handleDelete}>
                <Trash2 size={16} /> Delete Task
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
