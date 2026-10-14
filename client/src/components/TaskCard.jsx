import React from 'react';
import { Calendar, MessageSquare, AlertCircle } from 'lucide-react';

const priorityColors = {
  urgent: 'var(--danger-color)',
  high: 'var(--warning-color)',
  medium: 'var(--primary-color)',
  low: 'var(--text-muted)'
};

const TaskCard = ({ task, onClick }) => {
  const assigneeName = task.assignee_username || task.assignee?.username;
  const avatarColor = task.assignee_avatar || task.assignee?.avatar_color || '#6366f1';
  const commentCount = task.comment_count !== undefined ? task.comment_count : 0;

  return (
    <div className="task-card" onClick={onClick}>
      <div className="task-labels">
        {task.priority && (
          <span 
            className="priority-badge" 
            style={{ 
              backgroundColor: `${priorityColors[task.priority] || 'var(--primary-color)'}25`, 
              color: priorityColors[task.priority] || 'var(--primary-color)',
              border: `1px solid ${priorityColors[task.priority] || 'var(--primary-color)'}40`
            }}
          >
            {task.priority.toUpperCase()}
          </span>
        )}
      </div>
      
      <h4 className="task-title">{task.title}</h4>
      {task.description && (
        <p className="task-preview-desc" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.description}
        </p>
      )}
      
      <div className="task-footer">
        <div className="task-meta">
          {task.due_date && (
            <div className="meta-item" title="Due Date">
              <Calendar size={13} />
              <span>{new Date(task.due_date).toLocaleDateString()}</span>
            </div>
          )}
          {commentCount > 0 && (
            <div className="meta-item" title="Comments">
              <MessageSquare size={13} />
              <span>{commentCount}</span>
            </div>
          )}
        </div>
        
        {assigneeName && (
          <div 
            className="avatar-circle small" 
            title={`Assigned to ${assigneeName}`}
            style={{ backgroundColor: avatarColor, color: '#fff', fontSize: '11px', fontWeight: 600 }}
          >
            {assigneeName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
