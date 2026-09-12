/**
 * Page-accurate loading skeletons built on react-loading-skeleton.
 *
 * These replace the old logo/spinner loaders everywhere. Each skeleton mirrors
 * the real layout it stands in for, so the page "fills in" rather than flashing
 * a brand emblem. Theme is centralised here for one consistent shimmer.
 */
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

// Colors resolve through the active theme's CSS variables so skeletons blend
// with the current surface instead of flashing a fixed light-gray box on dark
// themes. base = raised surface tint, highlight = one shade up for the shimmer.
const THEME = {
  baseColor:      'rgb(var(--c-surface-high))',
  highlightColor: 'rgb(var(--sl-200))',
  borderRadius:   8,
};
const Themed = ({ children }) => <SkeletonTheme {...THEME}>{children}</SkeletonTheme>;

// Eyebrow + title + description — matches <PageHeader>.
const HeaderBlock = () => (
  <div className="space-y-2.5">
    <Skeleton width={90} height={10} />
    <Skeleton width={240} height={28} />
    <Skeleton width={360} height={12} />
  </div>
);

const Rows = ({ n = 8, height = 22 }) =>
  Array.from({ length: n }).map((_, i) => <Skeleton key={i} height={height} />);

// Generic content area (header + a card of rows). Used as the in-layout fallback
// while a lazily-loaded page chunk resolves — sidebar/topbar stay put.
export const ContentSkeleton = () => (
  <Themed>
    <div className="space-y-6">
      <HeaderBlock />
      <div className="bg-surface rounded-2xl border border-slate-200 p-5 space-y-3">
        <Skeleton height={38} />
        <Rows n={8} />
      </div>
    </div>
  </Themed>
);

// Minimal, app-shell-agnostic full-viewport skeleton — used as the outer Suspense
// fallback (covers public/auth pages too, where there is no sidebar).
export const PageSkeleton = () => (
  <Themed>
    <div className="min-h-screen w-full flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4">
        <Skeleton height={30} width={200} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} width={150} />
      </div>
    </div>
  </Themed>
);

// Full app shell (sidebar + topbar + content) — shown while auth state resolves
// in the route guards, so the whole frame appears instantly.
export const AppShellSkeleton = () => (
  <Themed>
    <div className="min-h-screen w-full bg-background flex">
      <div className="hidden md:flex flex-col w-72 bg-surface border-r border-slate-200 p-4 gap-2">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton circle width={40} height={40} />
          <Skeleton width={90} height={18} />
        </div>
        <Rows n={9} height={36} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-16 md:h-20 border-b border-slate-200 bg-surface flex items-center justify-between px-6">
          <Skeleton width={320} height={36} />
          <Skeleton circle width={40} height={40} />
        </div>
        <div className="p-4 md:p-8"><ContentSkeleton /></div>
      </div>
    </div>
  </Themed>
);

// List/table pages (Projects, Users, Drones, Estimations, Pipeline, Audit…).
export const TablePageSkeleton = ({ rows = 8 }) => (
  <Themed>
    <div className="space-y-6">
      <HeaderBlock />
      <div className="bg-surface rounded-2xl border border-slate-200 p-5 space-y-3">
        <Skeleton height={40} />
        <Rows n={rows} />
      </div>
    </div>
  </Themed>
);

// Detail pages (Project / Pilot / Drone) — header + 2-col cards.
export const DetailSkeleton = () => (
  <Themed>
    <div className="space-y-6">
      <HeaderBlock />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-surface rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex gap-4">
            <Skeleton width={80} height={80} borderRadius={12} />
            <div className="flex-1 space-y-2">
              <Skeleton width={160} height={20} />
              <Skeleton width={220} height={12} />
              <Skeleton width={80} height={20} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton width={70} height={10} />
                <Skeleton width={110} height={16} />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-slate-200 p-6 space-y-3">
          <Skeleton width={120} height={16} />
          <Rows n={3} height={14} />
        </div>
      </div>
      <div className="bg-surface rounded-2xl border border-slate-200 p-5 space-y-3">
        <Skeleton width={180} height={18} />
        <Rows n={4} />
      </div>
    </div>
  </Themed>
);

// Dashboard — KPI cards + map + list.
export const DashboardSkeleton = () => (
  <Themed>
    <div className="space-y-6">
      <HeaderBlock />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={104} borderRadius={12} />)}
      </div>
      <Skeleton height={280} borderRadius={16} />
      <div className="bg-surface rounded-2xl border border-slate-200 p-5 space-y-3">
        <Skeleton width={180} height={16} />
        <Rows n={4} height={40} />
      </div>
    </div>
  </Themed>
);

// In-card / tab section loading (a few shimmer rows). For detail-page tabs,
// modal sub-lists, settings panels, etc.
export const SectionSkeleton = ({ rows = 5 }) => (
  <Themed>
    <div className="p-4 space-y-3">
      <Rows n={rows} />
    </div>
  </Themed>
);

// Generic vertical list of records (notifications, pipeline column, etc.).
export const ListSkeleton = ({ rows = 6 }) => (
  <Themed>
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-surface rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <Skeleton circle width={36} height={36} />
          <div className="flex-1 space-y-2">
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  </Themed>
);

// Calendar month-grid placeholder.
export const CalendarSkeleton = () => (
  <Themed>
    <div className="p-2">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 42 }).map((_, i) => <Skeleton key={i} height={84} borderRadius={8} />)}
      </div>
    </div>
  </Themed>
);

// Library — folder sidebar + file-card grid.
export const LibrarySkeleton = () => (
  <Themed>
    <div className="flex h-[calc(100vh-64px)]">
      <div className="hidden md:flex flex-col w-60 bg-surface border-r border-slate-200 p-4 gap-2">
        <Rows n={7} height={32} />
      </div>
      <div className="flex-1 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} height={120} borderRadius={12} />)}
        </div>
      </div>
    </div>
  </Themed>
);
