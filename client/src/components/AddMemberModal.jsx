import React, { useState } from 'react';
import { X, UserPlus, UserMinus } from 'lucide-react';
import { api } from '../api';

const AddMemberModal = ({ projectId, currentMembers, onClose, onMemberAdded }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const data = await api.post(`/projects/${projectId}/members`, { email, role: 'member' });
      setSuccess('Member added successfully!');
      setEmail('');
      onMemberAdded(data);
    } catch (err) {
      setError(err.message || 'Failed to add member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content small-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Project Members</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="modal-body">
          <form onSubmit={handleAdd} className="add-member-form">
            <div className="input-group">
              <input 
                type="email" 
                placeholder="User email address" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                <UserPlus size={16} /> Add
              </button>
            </div>
            {error && <div className="text-danger mt-2 text-sm">{error}</div>}
            {success && <div className="text-success mt-2 text-sm">{success}</div>}
          </form>

          <div className="members-list mt-4">
            <h4>Current Members</h4>
            {currentMembers.map(member => (
              <div key={member.id || member.user_id} className="member-list-item">
                <div className="member-info">
                  <div className="avatar-circle small">
                    {(member.user?.username || member.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="member-name">{member.user?.username || member.username}</div>
                    <div className="member-role">{member.role || 'member'}</div>
                  </div>
                </div>
                {/* Remove functionality could go here, omitting for simplicity unless requested */}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMemberModal;
