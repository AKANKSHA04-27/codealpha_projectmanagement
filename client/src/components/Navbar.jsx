import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Bell, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import { getSocket } from '../socket';
import { api } from '../api';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef();

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await api.get('/notifications');
        setNotifications(data);
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      }
    };
    
    fetchNotifications();

    const socket = getSocket();
    if (socket) {
      socket.on('notification:new', (notif) => {
        setNotifications(prev => [notif, ...prev]);
      });
    }

    return () => {
      if (socket) socket.off('notification:new');
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read && !n.is_read).length;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="logo-link">
          <ClipboardList className="logo-icon" size={24} />
          <span className="logo-text">TaskFlow</span>
        </Link>
      </div>

      <div className="navbar-links">
        <Link to="/" className="nav-link">Dashboard</Link>
      </div>

      <div className="navbar-actions">
        <div className="notification-wrapper" ref={notifRef}>
          <button className="btn-icon" onClick={() => setIsNotifOpen(!isNotifOpen)} title="Notifications">
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>
          
          {isNotifOpen && (
            <NotificationDropdown 
              notifications={notifications} 
              setNotifications={setNotifications} 
              onClose={() => setIsNotifOpen(false)}
            />
          )}
        </div>

        <div className="profile-menu-wrapper" onMouseLeave={() => setIsProfileOpen(false)}>
          <button className="profile-btn" onMouseEnter={() => setIsProfileOpen(true)}>
            <div 
              className="avatar-circle"
              style={{ backgroundColor: user?.avatar_color || '#6366f1', color: '#fff' }}
            >
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <span className="username">{user?.username}</span>
          </button>
          
          {isProfileOpen && (
            <div className="profile-dropdown">
              <div className="dropdown-item">
                <UserIcon size={16} /> Profile
              </div>
              <div className="dropdown-item text-danger" onClick={logout}>
                <LogOut size={16} /> Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
