'use strict';
/**
 * Varuna Ops — Backend Date Utility (Node.js / server-side)
 *
 * Strategy:
 *  - DATE-only "YYYY-MM-DD" strings are timezone-naive. Never pass them through
 *    new Date() for display — that forces UTC midnight, causing IST off-by-one.
 *  - Full timestamps are treated as UTC and converted to IST for display.
 *  - Comparisons between DATE-only strings use direct string lexicographic
 *    comparison (valid because the format is ISO 8601 YYYY-MM-DD).
 *  - For insurance/maintenance DATE checks we compare against today's IST date
 *    string rather than new Date() (which is UTC).
 */

const IST_TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const isDateOnly = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

/**
 * Returns today's date as "YYYY-MM-DD" in IST.
 * Used for insurance/maintenance comparisons instead of new Date().
 */
const todayIST = () => {
  return new Intl.DateTimeFormat('sv', { timeZone: IST_TZ }).format(new Date());
};

/**
 * Format a DATE string or timestamp for human-readable display.
 * DATE-only "YYYY-MM-DD" → "15 May 2025" (no TZ shift).
 * Full timestamp       → "15 May 2025" in IST.
 */
const formatDateIST = (input) => {
  if (!input) return '';
  const s = String(input);
  if (isDateOnly(s)) {
    const [year, month, day] = s.split('-').map(Number);
    return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: IST_TZ,
  }).format(d);
};

/**
 * Format a timestamp with time for display.
 * "15 May 2025, 02:30 PM" in IST.
 */
const formatDateTimeIST = (input) => {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: IST_TZ,
  }).format(d);
};

/**
 * Check if a DATE-only string (YYYY-MM-DD) is before today (IST).
 * Safe replacement for: new Date(dateStr) < new Date()
 */
const isDateExpired = (dateStr) => {
  if (!dateStr) return false;
  return String(dateStr).substring(0, 10) < todayIST();
};

/**
 * Check if a DATE-only string is within `days` days from today (IST).
 * Safe replacement for: dateStr <= NOW() + INTERVAL '30 days'
 */
const isDateWithinDays = (dateStr, days) => {
  if (!dateStr) return false;
  const today = todayIST();
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  const future = new Intl.DateTimeFormat('sv', { timeZone: IST_TZ }).format(d);
  const s = String(dateStr).substring(0, 10);
  return s >= today && s <= future;
};

module.exports = { todayIST, formatDateIST, formatDateTimeIST, isDateExpired, isDateWithinDays };
