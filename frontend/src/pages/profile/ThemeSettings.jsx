import { useTheme } from '../../context/ThemeContext';

/**
 * Profile → Preferences → Theme.
 * Five application themes; selection applies instantly (no refresh) and
 * persists in localStorage, re-applied pre-paint on every load/login.
 */
const ThemeSettings = ({ SectionHeading }) => {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-soft p-7">
      <div className="mb-6">
        <SectionHeading
          icon="palette"
          title="Theme"
          subtitle="Pick the look for your whole workspace — applies instantly, no refresh"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="radiogroup" aria-label="Application theme">
        {themes.map((t) => {
          const active = theme === t.id;
          const [bg, surface, accent, text] = t.swatches;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(t.id)}
              className={`group relative text-left rounded-2xl border-2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                active ? 'border-primary shadow-glow' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Mini app preview */}
              <div
                className="rounded-xl overflow-hidden border mb-3"
                style={{ backgroundColor: bg, borderColor: active ? accent : 'transparent' }}
                aria-hidden="true"
              >
                <div className="flex h-20">
                  {/* sidebar strip */}
                  <div className="w-1/4 p-1.5 space-y-1" style={{ backgroundColor: surface }}>
                    <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: accent }} />
                    <div className="h-1 w-full rounded-full opacity-30" style={{ backgroundColor: text }} />
                    <div className="h-1 w-5/6 rounded-full opacity-20" style={{ backgroundColor: text }} />
                    <div className="h-1 w-full rounded-full opacity-20" style={{ backgroundColor: text }} />
                  </div>
                  {/* content cards */}
                  <div className="flex-1 p-1.5 space-y-1.5">
                    <div className="h-1.5 w-1/3 rounded-full opacity-60" style={{ backgroundColor: text }} />
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-5 rounded-md" style={{ backgroundColor: surface }} />
                      <div className="h-5 rounded-md" style={{ backgroundColor: surface }} />
                    </div>
                    <div className="h-4 rounded-md flex items-center px-1 gap-1" style={{ backgroundColor: surface }}>
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                      <div className="h-1 flex-1 rounded-full opacity-25" style={{ backgroundColor: text }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.tagline}</p>
                </div>
                <span
                  className={`material-symbols-outlined text-xl shrink-0 transition-all ${
                    active ? 'text-primary scale-100' : 'text-slate-300 scale-90 group-hover:text-slate-400'
                  }`}
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {active ? 'check_circle' : 'circle'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSettings;
