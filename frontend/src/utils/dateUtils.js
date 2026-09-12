/**
 * Varuna Ops — Centralized Date Utility
 *
 * Strategy:
 *  - DATE-only strings ("YYYY-MM-DD") from the DB are timezone-naive. Never pass
 *    them through `new Date()` — that parses them as UTC midnight and will shift
 *    the visible day by -5h30m for IST users. Parse the parts directly instead.
 *  - Full ISO timestamps (created_at, updated_at, etc.) come from the DB as UTC.
 *    Convert to IST (Asia/Kolkata) before displaying.
 *  - All display uses en-IN locale with IST timezone via Intl.DateTimeFormat.
 *  - No third-party date library required.
 */

const IST = 'Asia/Kolkata';
const LOCALE = 'en-IN';
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Parse a "YYYY-MM-DD" string into its integer parts without any TZ conversion. */
const parseDateParts = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return { year: y, month: m, day: d };
};

/** "YYYY-MM-DD" → "15 May 2025" (no time, no TZ shift). */
const fmtDateOnly = (s) => {
  const { year, month, day } = parseDateParts(s);
  return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[month - 1]} ${year}`;
};

/** Full ISO timestamp → "15 May 2025" in IST. */
const fmtTimestampDate = (s) => {
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: IST,
  }).format(d);
};

/** Full ISO timestamp → "15 May 2025, 02:30 PM" in IST. */
const fmtTimestampDateTime = (s) => {
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: IST,
  }).format(d);
};

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Display a date WITH time.
 * DATE-only strings → date only (no time to show).
 * Full timestamps   → "15 May 2025, 02:30 PM" in IST.
 */
export const formatDate = (dateString) => {
  if (!dateString) return '—';
  const s = String(dateString);
  if (isDateOnly(s)) return fmtDateOnly(s);
  return fmtTimestampDateTime(s);
};

/**
 * Display a date WITHOUT time.
 * DATE-only strings → "15 May 2025" (no TZ shift).
 * Full timestamps   → "15 May 2025" in IST.
 */
export const formatDateOnly = (dateString) => {
  if (!dateString) return '—';
  const s = String(dateString);
  if (isDateOnly(s)) return fmtDateOnly(s);
  return fmtTimestampDate(s);
};

/**
 * Relative time: "2m ago", "3h ago", "5d ago".
 * Returns "—" for null/undefined/invalid input.
 */
export const timeAgo = (dateString) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d)) return '—';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/**
 * Validate that end_date is on or after start_date.
 * Accepts "YYYY-MM-DD" strings — safe string comparison, no TZ involved.
 * Returns true if valid, false if end is before start.
 */
export const isEndOnOrAfterStart = (startDate, endDate) => {
  if (!startDate || !endDate) return true;
  return String(startDate) <= String(endDate);
};

/**
 * Format a date for CSV/Excel exports: "15 May 2025".
 * DATE-only strings handled without TZ shift.
 * Timestamps converted to IST date.
 */
export const formatForExport = (dateString) => {
  if (!dateString) return '';
  const s = String(dateString);
  if (isDateOnly(s)) return fmtDateOnly(s);
  return fmtTimestampDate(s);
};

/**
 * Parse an ISO string or "YYYY-MM-DD" into a value suitable for
 * an HTML <input type="date"> (YYYY-MM-DD).
 * Extracts only the date portion without TZ conversion for DATE-only inputs.
 */
export const toInputDate = (dateString) => {
  if (!dateString) return '';
  const s = String(dateString);
  if (isDateOnly(s)) return s;
  // For full timestamps, extract the date in IST
  const d = new Date(s);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('sv', { timeZone: IST }).format(d); // sv locale = YYYY-MM-DD
};

const DateUtils = { formatDate, formatDateOnly, timeAgo, isEndOnOrAfterStart, formatForExport, toInputDate };
export default DateUtils;
