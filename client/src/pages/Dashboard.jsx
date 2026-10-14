import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { Link } from 'react-router-dom';
import { Plus, Users, LayoutTemplate, Clock, FolderKanban } from 'lucide-react';
import CreateProjectModal from '../components/CreateProjectModal';
import { getSocket } from '../socket';

const Dashboard = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchProjects = async () => {
    try {
      const data = await api.get('/projects');
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();

    const socket = getSocket();
    if (socket) {
      const handleProjectCreated = (newProject) => {
        setProjects((prev) => [newProject, ...prev]);
      };
      
      const handleProjectDeleted = ({ projectId }) => {
         setProjects((prev) => prev.filter(p => p.id !== projectId));
      };

      socket.on('project:created', handleProjectCreated);
      socket.on('project:deleted', handleProjectDeleted);

      return () => {
        socket.off('project:created', handleProjectCreated);
        socket.off('project:deleted', handleProjectDeleted);
      };
    }
  }, []);

  const handleProjectCreated = (newProject) => {
    setProjects((prev) => [newProject, ...prev]);
    setIsCreateModalOpen(false);
  };

  if (isLoading) {
    return <div className="page-loading">Loading projects...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="welcome-text">Welcome back, {user?.username} 👋</h1>
          <p className="subtitle">Here's an overview of your projects.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={20} />
          Create New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={64} className="empty-icon" />
          <h2>No projects yet</h2>
          <p>Create your first project to start organizing tasks.</p>
          <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={20} />
            Create Project
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <Link to={`/projects/${project.id}`} key={project.id} className="project-card">
              <div className="project-card-header">
                <h3>{project.name}</h3>
              </div>
              {project.description && <p className="project-card-desc">{project.description}</p>}
              
              <div className="project-card-stats">
                <div className="stat">
                  <Users size={16} />
                  <span>{project.memberCount || 1} members</span>
                </div>
                <div className="stat">
                  <LayoutTemplate size={16} />
                  <span>{project.taskCount || 0} tasks</span>
                </div>
              </div>
              
              <div className="project-card-footer">
                <Clock size={14} />
                <span>Created {new Date(project.created_at || project.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <CreateProjectModal 
          onClose={() => setIsCreateModalOpen(false)} 
          onSuccess={handleProjectCreated} 
        />
      )}
    </div>
  );
};

export default Dashboard;
