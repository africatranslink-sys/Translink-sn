import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

function isTokenExpired(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;

    const decoded = JSON.parse(window.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return !Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch {
    // Continue without a persisted session when storage is unavailable.
  }
}

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      let storedUser;
      let token;
      let hasStoredUser = false;
      try {
        storedUser = localStorage.getItem('user');
        token = localStorage.getItem('token');
        if (storedUser && token) {
          if (isTokenExpired(token)) {
            clearStoredSession();
          } else {
            const cachedUser = JSON.parse(storedUser);
            setUser(cachedUser);
            hasStoredUser = Boolean(cachedUser);
          }
        } else if (storedUser || token) {
          clearStoredSession();
        }
      } catch {
        clearStoredSession();
      }

      if (hasStoredUser && token) {
        try {
          const response = await api.get('/api/auth/profile');
          if (!active) return;
          setUser(response.data);
          try {
            localStorage.setItem('user', JSON.stringify(response.data));
          } catch {
            // The in-memory session remains usable when storage is unavailable.
          }
        } catch {
          if (active) {
            setUser(null);
            clearStoredSession();
          }
        }
      }

      if (active) setLoading(false);
    };

    void restoreSession();
    return () => { active = false; };
  }, []);

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
  };

  const clearSession = () => {
    setUser(null);
    clearStoredSession();
  };

  const logout = () => {
    clearSession();
    window.location.replace('/login');
  };

  const syncUser = (userData) => {
    const updatedUser = { ...(user || {}), ...userData };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const updateProfile = async (updatedData) => {
    try {
      const response = await api.put('/api/auth/profile', updatedData);
      return syncUser(response.data);
    } catch (error) {
      throw error;
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    clearSession,
    syncUser,
    updateProfile
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
