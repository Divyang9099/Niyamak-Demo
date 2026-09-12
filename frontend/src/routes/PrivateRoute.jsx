import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { AppShellSkeleton } from '../components/ui/Skeletons';

const PrivateRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <AppShellSkeleton />;

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;
