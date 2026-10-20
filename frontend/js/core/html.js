export const escape = (value = '') =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const date = (timestamp, options = {}) =>
  timestamp
    ? new Date(timestamp * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...options,
      })
    : 'Never';
export const number = (value) => new Intl.NumberFormat().format(value || 0);
export const initials = (name) =>
  (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
