import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../utils/apiBaseUrl';
import api from '../utils/api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const useDashboardDataRefresh = (onChange) => {
  const { socket } = useSocket();
  const callbackRef = useRef(onChange);

  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleChange = (change) => callbackRef.current?.(change);
    socket.on('dashboard:data-changed', handleChange);
    return () => socket.off('dashboard:data-changed', handleChange);
  }, [socket]);
};

export const SocketProvider = ({ children }) => {
  const { user, syncUser } = useAuth();
  const userId = user?.id;
  const syncUserRef = useRef(syncUser);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    syncUserRef.current = syncUser;
  }, [syncUser]);

  useEffect(() => {
    let token = null;
    try {
      token = localStorage.getItem('token');
    } catch {
      // Continue without a socket session when storage is unavailable.
    }
    
    if (userId && token) {
      // Create a socket connection pointing to the API Gateway
      const newSocket = io(API_BASE_URL, {
        auth: {
          token
        },
        transports: ['websocket', 'polling'] // Try websocket first
      });
      const handleProfileUpdated = (profile) => {
        if (String(profile?.id) === String(userId)) syncUserRef.current(profile);
      };
      const refreshProfile = async () => {
        try {
          const response = await api.get('/api/auth/profile');
          if (String(response.data?.id) === String(userId)) syncUserRef.current(response.data);
        } catch {
          // Keep the current profile when a reconnect refresh fails.
        }
      };
      newSocket.on('profile:updated', handleProfileUpdated);
      newSocket.on('connect', refreshProfile);

      setSocket(newSocket);

      return () => {
        newSocket.off('profile:updated', handleProfileUpdated);
        newSocket.off('connect', refreshProfile);
        newSocket.close();
      };
    } else {
      setSocket(null);
    }
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
