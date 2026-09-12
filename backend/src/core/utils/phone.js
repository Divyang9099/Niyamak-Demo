/**
 * Phone number normalization + validation → E.164.
 *
 * E.164 is the international standard phone format: a leading "+" followed by
 * country code and national number, digits only, 8–15 digits total
 * (e.g. +919876543210).
 *
 * Default country is India (+91). Bare 10-digit Indian mobiles are upgraded
 * to +91XXXXXXXXXX. International numbers entered with "+" or "00" are kept.
 */

const DEFAULT_CC = '91'; // India

/**
 * Normalize a raw phone string to E.164, or return null if it cannot be made
 * into a plausible mobile number.
 *
 * @param {string} raw
 * @param {string} [defaultCc] - default country code digits, e.g. '91'
 * @returns {string|null} E.164 string (e.g. "+919876543210") or null
 */
function normalizePhone(raw, defaultCc = DEFAULT_CC) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const isIntl = s.startsWith('+') || s.startsWith('00');
  let digits = s.replace(/\D/g, '');     // strip spaces, dashes, parens, etc.
  if (s.startsWith('00')) digits = digits.replace(/^00/, ''); // intl 00 prefix

  if (!isIntl) {
    digits = digits.replace(/^0+/, '');  // drop a domestic trunk zero
    if (digits.length === 10) digits = defaultCc + digits; // bare national → add CC
  }

  // E.164 allows 8–15 digits total (incl. country code).
  if (digits.length < 10 || digits.length > 15) return null;

  // India-specific sanity check: a +91 mobile is exactly 10 digits starting 6–9.
  if (digits.startsWith('91') && digits.length === 12) {
    if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  }

  return '+' + digits;
}

/**
 * @returns {boolean} true if `raw` normalizes to a valid E.164 number.
 */
function isValidPhone(raw, defaultCc = DEFAULT_CC) {
  return normalizePhone(raw, defaultCc) !== null;
}

module.exports = { normalizePhone, isValidPhone, DEFAULT_CC };
