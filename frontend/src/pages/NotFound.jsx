import { useNavigate, useLocation } from 'react-router-dom';

const NotFound = () => {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-6 shadow-sm">
        <span className="material-symbols-outlined text-4xl text-amber-400">construction</span>
      </div>

      {/* Heading */}
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-500 mb-2">Under Construction</p>
      <h1 className="text-3xl font-bold text-slate-900 mb-3">This page doesn't exist yet</h1>
      <p className="text-sm text-slate-500 max-w-md mb-2">
        The route <code className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{pathname}</code> hasn't been built yet — it may be coming soon.
      </p>
      <p className="text-xs text-slate-400 max-w-sm mb-8">
        Check back later or return to the dashboard while this section is being prepared.
      </p>

      {/* Decorative bar */}
      <div className="flex items-center gap-1.5 mb-8">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full bg-amber-200"
            style={{ width: `${[32, 20, 40, 16, 28][i]}px`, opacity: 0.4 + i * 0.12 }}
          />
        ))}
        <span className="material-symbols-outlined text-lg text-amber-300 leading-none ml-1">pending</span>
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

export default NotFound;
