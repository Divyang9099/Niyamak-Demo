import clsx from 'clsx';

export const Skeleton = ({ className }) => (
  <div className={clsx('bg-slate-200/70 rounded skeleton-shimmer', className)} />
);

export const SkeletonRow = ({ cols = 5 }) => (
  <tr className="border-b border-slate-100">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 px-4">
        <Skeleton className="h-4 w-3/4" />
      </td>
    ))}
  </tr>
);

export const SkeletonCard = ({ lines = 3 }) => (
  <div className="space-y-3 p-4">
    <Skeleton className="h-5 w-1/3" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className="h-3 w-full" />
    ))}
  </div>
);

// Contextual loading for table pages — shimmer rows in the table's own shape,
// instead of a centred spinner that bears no relation to the content.
export const SkeletonTable = ({ cols = 5, rows = 6 }) => (
  <div className="w-full overflow-hidden">
    <table className="w-full border-collapse">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  </div>
);
