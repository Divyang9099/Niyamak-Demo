const { normalizePhone } = require('../../core/utils/phone');

const PRIORITIES        = ['A', 'B', 'C'];
const CLIENT_STATUSES    = ['to_be_initiated', 'wip', 'closed_onboard', 'closed_cancelled'];
const OWNER_TYPES        = ['client', 'contact'];
const CHANNEL_TYPES      = ['email', 'phone', 'linkedin', 'whatsapp'];
const CHANNEL_STATUSES   = ['not_contacted', 'contacted', 'awaiting_response', 'responded', 'bounced', 'unreachable'];
const INTERACTION_TYPES  = ['email', 'call', 'linkedin', 'whatsapp', 'meeting', 'site_visit', 'other'];
const DIRECTIONS         = ['outbound', 'inbound'];
const RESPONSE_STATUSES  = ['awaiting', 'positive', 'negative', 'neutral', 'no_response', 'bounced'];
const FOLLOWUP_STATUSES  = ['pending', 'sent', 'completed', 'cancelled', 'escalated'];

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts any LinkedIn link shape people actually paste: bare or schemed, any
// subdomain (www/in/m/…), profile/company/post/school paths, and lnkd.in shorts.
const LINKEDIN_RE = /^(https?:\/\/)?([\w-]+\.)*(linkedin\.com|lnkd\.in)(\/\S*)?$/i;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const assertIn = (value, allowed, fieldName) => {
  if (!allowed.includes(value)) {
    throw badRequest(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
};

/**
 * Validates + normalizes a bd_channels `value` for its channel_type.
 * Returns the normalized value to store.
 */
const normalizeChannelValue = (channelType, rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) throw badRequest('Channel value is required');

  if (channelType === 'email') {
    if (!EMAIL_RE.test(value)) throw badRequest('Invalid email address');
    return value.toLowerCase();
  }
  if (channelType === 'phone' || channelType === 'whatsapp') {
    const normalized = normalizePhone(value);
    if (!normalized) throw badRequest('Invalid phone number');
    return normalized;
  }
  if (channelType === 'linkedin') {
    if (!LINKEDIN_RE.test(value)) throw badRequest('Enter a LinkedIn link (linkedin.com/… or lnkd.in/…)');
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }
  return value;
};

module.exports = {
  PRIORITIES,
  CLIENT_STATUSES,
  OWNER_TYPES,
  CHANNEL_TYPES,
  CHANNEL_STATUSES,
  INTERACTION_TYPES,
  DIRECTIONS,
  RESPONSE_STATUSES,
  FOLLOWUP_STATUSES,
  badRequest,
  assertIn,
  normalizeChannelValue,
};
