import React, { useEffect } from 'react';

/**
 * Two-column authentication shell.
 * Left  : premium animated gradient hero (no text, no stock photo) — hidden on small screens.
 * Right : centered white form panel with logo, heading, and the page's fields.
 *
 * Pass `sideImage` to use a photo instead of the CSS hero (rendered clean, no overlay text).
 */
const AuthSplitLayout = ({ title, subtitle, sideImage, children, footer }) => {
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev);
      else document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* LEFT — premium hero */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-slate-950">
        {sideImage ? (
          // Photo mode — clean, no text overlay
          <>
            <img
              src={sideImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/40 to-transparent" />
          </>
        ) : (
          // CSS premium mode — animated gradient mesh + glow + grid
          <>
            {/* Base gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900" />

            {/* Soft moving glow orbs */}
            <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-indigo-600/30 blur-[120px] animate-auth-float" />
            <div className="absolute top-1/3 -right-20 w-[24rem] h-[24rem] rounded-full bg-violet-500/25 blur-[120px] animate-auth-float-slow" />
            <div className="absolute -bottom-28 left-1/4 w-[26rem] h-[26rem] rounded-full bg-sky-500/20 blur-[120px] animate-auth-float" />

            {/* Fine grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
              }}
            />

            {/* Concentric radar rings — subtle brand accent */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[34rem] h-[34rem] rounded-full border border-white/[0.06]" />
              <div className="absolute w-[24rem] h-[24rem] rounded-full border border-white/[0.08]" />
              <div className="absolute w-[14rem] h-[14rem] rounded-full border border-white/[0.10]" />
              {/* Center glyph */}
              <img
                src="/favicon.svg"
                alt=""
                className="absolute w-20 h-20 opacity-90 drop-shadow-[0_0_30px_rgba(99,102,241,0.6)]"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {/* Edge vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,23,0.6)_100%)]" />
          </>
        )}
      </div>

      {/* RIGHT — form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-surface">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/logo.png" alt="Niyamak" className="h-12 w-auto mb-4" />
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>}
          </div>

          {children}

          {footer && (
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* Keyframes for the floating glow orbs */}
      <style>{`
        @keyframes auth-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(30px, -24px) scale(1.08); }
        }
        @keyframes auth-float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-26px, 28px) scale(1.12); }
        }
        .animate-auth-float      { animation: auth-float 14s ease-in-out infinite; }
        .animate-auth-float-slow { animation: auth-float-slow 18s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default AuthSplitLayout;
