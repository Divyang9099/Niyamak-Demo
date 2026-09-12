import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const ROLE_LABELS = {
  admin:           'Administrator',
  project_manager: 'Project Manager',
  pilot:           'Pilot',
};

const AccessDenied = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'Unknown';

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center mb-6 shadow-sm">
        <span className="material-symbols-outlined text-4xl text-red-400">lock</span>
      </div>

      {/* Heading */}
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-400 mb-2">Access Denied</p>
      <h1 className="text-3xl font-bold text-slate-900 mb-3">You're not eligible for this page</h1>
      <p className="text-sm text-slate-500 max-w-md mb-2">
        Your current role — <span className="font-semibold text-slate-700">{roleLabel}</span> — does not have permission to view this section.
      </p>
      <p className="text-xs text-slate-400 max-w-sm mb-8">
        If you believe this is a mistake, ask your administrator to update your access level.
      </p>

      {/* Role badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full mb-8">
        <span className="material-symbols-outlined text-base text-slate-500 leading-none">badge</span>
        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{roleLabel}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-surface text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base leading-none">arrow_back</span>
          Go back
        </button>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
        >
          <span className="material-symbols-outlined text-base leading-none">home</span>
          Dashboard
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
