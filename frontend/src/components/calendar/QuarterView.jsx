/**
 * QuarterView — PRD §6.2 compact 3-month overview.
 * "Each week represented as a narrow column. Project blocks span their full duration."
 *
 * Rendered as three side-by-side mini-month calendars.
 * Clicking a day fires onDateClick; clicking an event strip fires onEventClick.
 */
import { useMemo } from 'react';

// Return array of Date objects for every day in a month (YYYY, 0-based month)
const daysInMonth = (year, month) => {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
};

// LOCAL YYYY-MM-DD for a Date. Must NOT use toISOString() — that converts to UTC
// and shifts the calendar day by the local offset (−5:30 in IST), which mis-keyed
// every day cell and the "today" highlight.
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse a "YYYY-MM-DD" (or ISO) date string into a LOCAL Date at its calendar day,
// with no timezone conversion. Keeps event placement on the exact intended day.
const parseYmd = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// Short month name
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// Type → Tailwind bg colour class (matches Calendar.jsx FC_STYLES palette)
const TYPE_BG = {
  project:     'bg-indigo-500',
  pipeline:    'bg-indigo-200 border border-dashed border-indigo-400',
  meeting:     'bg-amber-400',
  maintenance: 'bg-slate-400',
  leave:       'bg-red-300',
  deadline:    'bg-red-500',
  training:    'bg-teal-400',
  exhibition:  'bg-orange-400',
  other:       'bg-emerald-400',
};
const typeBg = (t) => TYPE_BG[(t || 'other').toLowerCase()] || 'bg-slate-300';

const MiniMonth = ({ year, month, events, today, onDateClick, onEventClick }) => {
  const days  = daysInMonth(year, month);
  // Build a map: isoDate → events[]
  const byDay = useMemo(() => {
    const m = {};
    for (const e of events) {
      const rawStart = e.start || e.start_date;
      const rawEnd   = e.end   || e.end_date || rawStart;
      if (!rawStart) continue; // skip events with no date
      // expand range to all days the event spans (inclusive), parsing by parts so
      // a "YYYY-MM-DD" never gets pulled across a timezone boundary.
      const cur  = parseYmd(rawStart);
      const last = parseYmd(rawEnd);
      while (cur <= last) {
        const k = isoDate(cur);
        if (!m[k]) m[k] = [];
        m[k].push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [events]);

  // Offset so week starts on Sunday
  const startOffset = days[0].getDay();
  const cells = [
    ...Array(startOffset).fill(null),
    ...days,
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-900 mb-3 text-center">
        {MONTHS[month]} {year}
      </p>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const iso = isoDate(day);
          const isToday = iso === today;
          const dayEvents = byDay[iso] || [];
          return (
            <div
              key={iso}
              onClick={() => onDateClick && onDateClick({ dateStr: iso })}
              className={`min-h-[44px] p-0.5 rounded cursor-pointer transition-colors ${
                isToday
                  ? 'bg-indigo-50 ring-1 ring-indigo-300'
                  : 'hover:bg-slate-50'
              }`}
            >
              <p className={`text-[11px] text-center mb-0.5 leading-tight ${
                isToday ? 'font-black text-primary' : 'text-slate-500 font-medium'
              }`}>
                {day.getDate()}
              </p>
              {/* Show up to 3 event strips */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <div
                    key={`${e.id}-${i}`}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick && onEventClick({ event: e }); }}
                    title={e.title}
                    className={`text-[9px] leading-none px-1 py-0.5 rounded truncate text-white font-semibold cursor-pointer hover:opacity-80 ${typeBg(e.extendedProps?.type || e.event_type || 'other')}`}
                  >
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-slate-400 text-center">+{dayEvents.length - 3}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const QuarterView = ({ anchorDate, events = [], onDateClick, onEventClick }) => {
  const today = isoDate(new Date());
  const base  = anchorDate ? new Date(anchorDate) : new Date();

  // Quarter starts at the month of anchorDate, span 3 months
  const months = [0, 1, 2].map(offset => {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="flex flex-col md:flex-row gap-6 p-4 overflow-x-auto">
      {months.map(({ year, month }) => (
        <MiniMonth
          key={`${year}-${month}`}
          year={year}
          month={month}
          events={events}
          today={today}
          onDateClick={onDateClick}
          onEventClick={onEventClick}
        />
      ))}
    </div>
  );
};

export default QuarterView;
