export { formatDate, formatDateOnly, timeAgo } from './dateUtils';

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '—';
  return `₹ ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

export const capitalize = (str) => {
  if (typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const ObjectUtils = { formatCurrency, capitalize };
export default ObjectUtils;
