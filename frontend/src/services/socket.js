import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
  : 'http://localhost:5000';

let socket = null;

export const getSocket = () => socket;

export const connectSocket = () => {
  // Return existing instance regardless of connection state.
  // Checking socket?.connected would create a new io() while the old socket
  // is still reconnecting, leaking connections and exhausting browser resources.
  if (socket) return socket;

  socket = io(BACKEND_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,         // stop after 10 attempts, don't loop forever
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 10000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    socket._reconnectErrorLogged = false;
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    // Log once per disconnect cycle so the console isn't flooded during server restarts
    if (socket._reconnectErrorLogged) return;
    socket._reconnectErrorLogged = true;
    console.debug('[Socket] Connection error (will retry):', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinProject = (projectId) => {
  socket?.emit('join:project', projectId);
};

export const leaveProject = (projectId) => {
  socket?.emit('leave:project', projectId);
};
