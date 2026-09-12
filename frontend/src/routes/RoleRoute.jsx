import React from 'react';
import { Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { AppShellSkeleton } from '../components/ui/Skeletons';
import AccessDenied from '../pages/AccessDenied';

const RoleRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <AppShellSkeleton />;

  return user && allowedRoles.includes(user.role)
    ? <Outlet />
    : <AccessDenied />;
};

export default RoleRoute;
