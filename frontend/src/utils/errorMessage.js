const HTTP_MESSAGES = {
  400: (msg) => msg || 'Invalid request. Please check your input.',
  401: () => 'Your session has expired. Please log in again.',
  403: () => "You don't have permission to perform this action.",
  404: () => 'The requested resource was not found.',
  409: (msg) => msg || 'A conflict occurred. This record may already exist.',
  413: () => 'File too large. Maximum upload size is 5 MB.',
  422: (msg) => msg || 'Validation failed. Please check your input.',
  429: () => 'Too many requests. Please wait a moment and try again.',
  500: () => 'Server error. Please try again in a moment.',
  502: () => 'Service temporarily unavailable. Please try again.',
  503: () => 'Service temporarily unavailable. Please try again.',
  504: () => 'Request timed out on the server. Please try again.',
};

export function getErrorMessage(err) {
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return 'Request timed out. Please check your connection and try again.';
    }
    return 'Network error. Please check your internet connection.';
  }

  const { status, data } = err.response;
  const serverMsg = data?.message || data?.error || null;

  const handler = HTTP_MESSAGES[status];
  if (handler) return handler(serverMsg);

  if (status >= 500) return 'Server error. Please try again in a moment.';

  return serverMsg || 'Something went wrong. Please try again.';
}
