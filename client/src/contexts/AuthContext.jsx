import React, { createContext, useState, useEffect, useContext } from 'react';
import { api } from '../api';
import { connectSocket, disconnectSocket } from '../socket';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('taskflow_token'));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await api.get('/auth/me');
          setUser(userData);
          connectSocket(token);
        } catch (err) {
          console.error('Auth initialization error', err);
          localStorage.removeItem('taskflow_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [token]);

  const login = async (email, password) => {
    try {
      const data = await api.post('/auth/login', { email, password });
      localStorage.setItem('taskflow_token', data.token);
      setToken(data.token);
      setUser(data.user);
      connectSocket(data.token);
      navigate('/');
    } catch (err) {
      throw err;
    }
  };

  const register = async (username, email, password) => {
    try {
      const data = await api.post('/auth/register', { username, email, password });
      localStorage.setItem('taskflow_token', data.token);
      setToken(data.token);
      setUser(data.user);
      connectSocket(data.token);
      navigate('/');
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('taskflow_token');
    setToken(null);
    setUser(null);
    disconnectSocket();
    navigate('/login');
  };

  if (loading) {
    return <div className="loading-screen">Loading TaskFlow...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
