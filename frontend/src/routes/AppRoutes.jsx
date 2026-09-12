import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute    from './PrivateRoute';
import RoleRoute       from './RoleRoute';
import MainLayout      from '../components/layout/MainLayout';
import ErrorBoundary   from '../components/ErrorBoundary';
import NotFound        from '../pages/NotFound';
import { PageSkeleton } from '../components/ui/Skeletons';
import { ROLES, ROUTES } from '../utils/constants';

const Login          = lazy(() => import('../pages/auth/Login'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
const ResetPassword  = lazy(() => import('../pages/auth/ResetPassword'));
const Dashboard      = lazy(() => import('../pages/dashboard/Dashboard'));
const ProjectList    = lazy(() => import('../pages/projects/ProjectList'));
const ProjectForm    = lazy(() => import('../pages/projects/ProjectForm'));
const ProjectDetail  = lazy(() => import('../pages/projects/ProjectDetail'));
const PipelineBoard  = lazy(() => import('../pages/pipeline/PipelineBoard'));
const PipelineForm   = lazy(() => import('../pages/pipeline/PipelineForm'));
const PipelineDetail = lazy(() => import('../pages/pipeline/PipelineDetail'));
const Calendar       = lazy(() => import('../pages/calendar/Calendar'));
const Pilots         = lazy(() => import('../pages/resources/Pilots'));
const CoPilots       = lazy(() => import('../pages/resources/CoPilots'));
const CoPilotDetail  = lazy(() => import('../pages/resources/CoPilotDetail'));
const Drones         = lazy(() => import('../pages/resources/Drones'));
const DroneDetail    = lazy(() => import('../pages/resources/DroneDetail'));
const PilotDetail    = lazy(() => import('../pages/resources/PilotDetail'));
const Allocations    = lazy(() => import('../pages/resources/Allocations'));
const EstimationList = lazy(() => import('../pages/estimations/EstimationList'));
const EstimationForm = lazy(() => import('../pages/estimations/EstimationForm'));
const LibraryPage    = lazy(() => import('../modules/library/pages/LibraryPage'));
const ArchivePage    = lazy(() => import('../modules/archive/pages/ArchivePage'));
const Users          = lazy(() => import('../pages/admin/Users'));
const AuditLog       = lazy(() => import('../pages/admin/AuditLog'));
const Profile        = lazy(() => import('../pages/profile/Profile'));
const Notifications   = lazy(() => import('../pages/notifications/Notifications'));
const SystemSettings  = lazy(() => import('../pages/admin/SystemSettings'));
const Assets          = lazy(() => import('../pages/assets/Assets'));
const ClientsPage     = lazy(() => import('../pages/clients/ClientsPage'));
const ClientDetailPage = lazy(() => import('../pages/clients/ClientDetailPage'));
const SuperAdmin            = lazy(() => import('../pages/admin/SuperAdmin'));
const WeeklyReportSettings  = lazy(() => import('../pages/admin/WeeklyReportSettings'));
const PilotTracking         = lazy(() => import('../pages/admin/PilotTracking'));
const BDClientForm          = lazy(() => import('../modules/bd/pages/BDClientForm'));
const BDClientDetail        = lazy(() => import('../modules/bd/pages/BDClientDetail'));
const BDHome                = lazy(() => import('../modules/bd/pages/BDHome'));

const AppRoutes = () => (
  <ErrorBoundary>
  <Suspense fallback={<PageSkeleton />}>
    <Routes>
      {/* Public */}
      <Route path={ROUTES.LOGIN}          element={<Login />} />
      <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
      <Route path={ROUTES.RESET_PASSWORD}  element={<ResetPassword />} />

      <Route element={<PrivateRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />

          {/* All authenticated roles */}
          <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN,ROLES.PROJECT_MANAGER,ROLES.PILOT]} />}>
            <Route path={ROUTES.PROJECTS}          element={<ProjectList />} />
            <Route path={`${ROUTES.PROJECTS}/:id`} element={<ProjectDetail />} />  {/* FIXED */}
            <Route path={`${ROUTES.RESOURCES}`}    element={<Pilots />} />
            <Route path={`${ROUTES.RESOURCES}/pilots`} element={<Pilots />} />
            <Route path={`${ROUTES.RESOURCES}/pilots/:id`} element={<PilotDetail />} />
            <Route path={ROUTES.COPILOTS}          element={<CoPilots />} />
            <Route path={`${ROUTES.COPILOTS}/:id`} element={<CoPilotDetail />} />
            <Route path={`${ROUTES.RESOURCES}/drones`} element={<Drones />} />
            <Route path={`${ROUTES.RESOURCES}/drones/:id`} element={<DroneDetail />} />

            <Route path={ROUTES.LIBRARY}    element={<LibraryPage />} />
            <Route path={ROUTES.ARCHIVE}    element={<ArchivePage />} />
            <Route path={ROUTES.PROFILE}    element={<Profile />} />
            <Route path={ROUTES.NOTIFICATIONS} element={<Notifications />} />
          </Route>

          {/* Admin + Project Manager only */}
          <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN,ROLES.PROJECT_MANAGER]} />}>
            <Route path={ROUTES.ASSETS}                    element={<Assets />} />
            <Route path={ROUTES.CLIENTS}                   element={<ClientsPage />} />
            <Route path={`${ROUTES.CLIENTS}/:id`}          element={<ClientDetailPage />} />
            <Route path={`${ROUTES.PROJECTS}/new`}         element={<ProjectForm />} />
            <Route path={`${ROUTES.PROJECTS}/:id/edit`}    element={<ProjectForm />} />  {/* NEW */}
            <Route path={ROUTES.PIPELINE}                  element={<PipelineBoard />} />
            <Route path={`${ROUTES.PIPELINE}/new`}         element={<PipelineForm />} />
            <Route path={`${ROUTES.PIPELINE}/:id`}         element={<PipelineDetail />} />
            <Route path={`${ROUTES.PIPELINE}/:id/edit`}    element={<PipelineForm />} />
            <Route path={ROUTES.CALENDAR}                  element={<Calendar />} />
            <Route path={`${ROUTES.RESOURCES}/allocations`} element={<Allocations />} />
          </Route>

          {/* Admin only */}
          <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN]} />}>
            <Route path={ROUTES.ESTIMATIONS}               element={<EstimationList />} />
            <Route path={`${ROUTES.ESTIMATIONS}/new`}      element={<EstimationForm />} />
            <Route path={`${ROUTES.ESTIMATIONS}/:id`}      element={<EstimationForm />} />
            <Route path={ROUTES.USERS}            element={<Users />} />
            <Route path={ROUTES.AUDIT}            element={<AuditLog />} />
            <Route path={ROUTES.SYSTEM_SETTINGS}  element={<SystemSettings />} />
            <Route path={ROUTES.WEEKLY_REPORT}    element={<WeeklyReportSettings />} />
            <Route path={ROUTES.ATTENDANCE}       element={<PilotTracking />} />

            {/* Business Development — independent lead-generation module, admin only (BD_MODULE_PLAN.md §0.3) */}
            <Route path={ROUTES.BD}                         element={<BDHome />} />
            <Route path={ROUTES.BD_CLIENTS}                 element={<Navigate to={ROUTES.BD} replace />} />
            <Route path={`${ROUTES.BD_CLIENTS}/new`}        element={<BDClientForm />} />
            <Route path={`${ROUTES.BD_CLIENTS}/:id/edit`}   element={<BDClientForm />} />
            <Route path={`${ROUTES.BD_CLIENTS}/:id`}        element={<BDClientDetail />} />
            <Route path={ROUTES.BD_FOLLOWUPS}               element={<Navigate to={ROUTES.BD} replace />} />
            <Route path={ROUTES.BD_SETTINGS}                element={<Navigate to={ROUTES.BD} replace />} />
          </Route>
        </Route>

        </Route>

      {/* Super Admin — fully public, self-contained password gate, no PrivateRoute */}
      <Route path={ROUTES.SUPER_ADMIN} element={<SuperAdmin />} />

      {/* Catch-all — unknown URLs */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
  </ErrorBoundary>
);

export default AppRoutes;
