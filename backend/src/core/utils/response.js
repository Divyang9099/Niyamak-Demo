/**
 * Standardised API response helpers
 */

const success = (data = null, message = 'Success', statusCode = 200) => ({
  success: true,
  statusCode,
  message,
  data,
});

const error = (message = 'Something went wrong', statusCode = 500, details = null) => ({
  success: false,
  statusCode,
  message,
  ...(details && { details }),
});

const paginated = (data, total, page, limit) => ({
  success: true,
  data,
  pagination: {
    total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / limit),
  },
});

module.exports = { success, error, paginated };
