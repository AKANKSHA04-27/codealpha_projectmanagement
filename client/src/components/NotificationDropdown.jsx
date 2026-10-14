import React from 'react';
import { Check, CheckCircle2, MessageSquare, Bell, UserPlus } from 'lucide-react';
import { api } from '../api';

const NotificationDropdown = ({ notifications, setNotifications, onClose }) => {

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1, read: true } : n));
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put(`/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1, read: true })));
    } catch (err) {
      console.error('Failed to mark all read', err);
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'comment_added':
      case 'mention': 
        return <MessageSquare size={16} className="text-primary" />;
      case 'task_assigned':
      case 'assigned': 
        return <CheckCircle2 size={16} className="text-success" />;
      case 'project_invite':
        return <UserPlus size={16} style={{ color: '#ec4899' }} />;
      default: 
        return <Bell size={16} className="text-muted" />;
    }
  };

  return (
    <div className="notification-dropdown">
      <div className="dropdown-header">
        <h4>Notifications</h4>
        {notifications.some(n => (!n.is_read && !n.read)) && (
          <button className="btn-link" onClick={markAllAsRead}>Mark all as read</button>
        )}
      </div>
      
      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-notifications">No notifications yet</div>
        ) : (
          notifications.map(notif => {
            const isUnread = (!notif.is_read && !notif.read);
            return (
              <div 
                key={notif.id} 
                className={`notification-item ${isUnread ? 'unread' : ''}`}
                onClick={() => {
                  if (isUnread) markAsRead(notif.id);
                }}
              >
                <div className="notif-icon">{getIcon(notif.type)}</div>
                <div className="notif-content">
                  <p>{notif.message}</p>
                  <span className="notif-time">{new Date(notif.created_at || notif.createdAt).toLocaleString()}</span>
                </div>
                {isUnread && <div className="unread-dot"></div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;
