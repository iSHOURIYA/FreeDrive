const { ERROR_CODES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

/**
 * Global error handler middleware
 * Handles all errors thrown in the application and returns standardized error responses
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error caught by error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let statusCode = 500;
  let errorCode = ERROR_CODES.INTERNAL_ERROR;
  let message = 'An unexpected error occurred';
  let details = null;

  // Handle different types of errors
  
  // Validation errors (Joi)
  if (err.name === 'ValidationError' || err.isJoi) {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    details = err.details?.map(detail => detail.message) || [err.message];
  }
  
  // GitHub API errors
  else if (err.name === 'GitHubAPIError' || err.status) {
    statusCode = err.status || 500;
    
    if (err.status === 401) {
      errorCode = ERROR_CODES.GITHUB_UNAUTHORIZED;
      message = 'GitHub authentication failed';
    } else if (err.status === 403) {
      errorCode = ERROR_CODES.GITHUB_RATE_LIMIT;
      message = 'GitHub API rate limit exceeded';
    } else {
      errorCode = ERROR_CODES.GITHUB_API_ERROR;
      message = 'GitHub API error occurred';
    }
    
    details = err.message;
  }
  
  // Supabase/Database errors
  else if (err.name === 'SupabaseError' || err.message?.includes('supabase')) {
    statusCode = 500;
    errorCode = ERROR_CODES.DATABASE_ERROR;
    message = 'Database operation failed';
    details = process.env.NODE_ENV === 'development' ? err.message : null;
  }
  
  // File upload errors (Multer)
  else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    errorCode = ERROR_CODES.FILE_TOO_LARGE;
    message = 'File size exceeds the maximum allowed limit';
    details = `Maximum file size is ${Helpers.formatBytes(err.limit)}`;
  }
  else if (err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Too many files uploaded at once';
  }
  else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Unexpected file field';
  }
  
  // Authentication errors
  else if (err.name === 'UnauthorizedError' || err.message?.includes('unauthorized')) {
    statusCode = 401;
    errorCode = ERROR_CODES.AUTH_INVALID;
    message = 'Authentication required or invalid';
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = ERROR_CODES.AUTH_EXPIRED;
    message = 'Authentication token has expired';
  }
  
  // Custom application errors
  else if (err.code && Object.values(ERROR_CODES).includes(err.code)) {
    statusCode = err.statusCode || 400;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  }
  
  // Network/Connection errors
  else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    statusCode = 503;
    errorCode = ERROR_CODES.DATABASE_CONNECTION_ERROR;
    message = 'Service temporarily unavailable';
    details = 'Unable to connect to external services';
  }
  
  // Syntax errors
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Invalid JSON in request body';
  }

  // Create standardized error response
  const errorResponse = Helpers.createResponse(
    false,
    null,
    message,
    errorCode
  );

  // Add details in development mode or for validation errors
  if (details && (process.env.NODE_ENV === 'development' || errorCode === ERROR_CODES.VALIDATION_ERROR)) {
    errorResponse.details = details;
  }

  // Add error ID for tracking
  errorResponse.errorId = Helpers.generateRandomString(16);

  // Log error for monitoring (in production, this would go to a logging service)
  if (statusCode >= 500) {
    console.error('Server Error:', {
      errorId: errorResponse.errorId,
      error: err.message,
      stack: err.stack,
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      },
      timestamp: new Date().toISOString()
    });
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Create a custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, code, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler
};
