import React, { createContext, useContext, useEffect, useState } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';
import useAuth from '../hooks/useAuth';

// Safe default — destructuring `{ socket }` from this never throws
const SocketContext = createContext({ socket: null, connected: false });

export const SocketProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket,    setSocket]    = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = connectSocket();
    setSocket(s);
    setConnected(s.connected);

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect',    onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect',    onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

export default SocketContext;
