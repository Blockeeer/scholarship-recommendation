/**
 * Centralized Error Handler Middleware
 * Handles all errors consistently across the application
 */

// Custom error class for application errors
class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Default error values
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An unexpected error occurred';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError' || err.message?.includes('unauthorized')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (err.name === 'ForbiddenError' || err.message?.includes('forbidden')) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = 'Access denied';
  } else if (err.code === 'EBADCSRFTOKEN') {
    statusCode = 403;
    errorCode = 'CSRF_ERROR';
    message = 'Invalid or missing CSRF token';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    errorCode = 'FILE_TOO_LARGE';
    message = 'File size exceeds the allowed limit';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    errorCode = 'INVALID_FILE_FIELD';
    message = 'Unexpected file field';
  }

  // Hide error details in production for security
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  // Handle JSON API requests
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: errorCode,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
      }
    });
  }

  // Handle HTML page requests - render error page
  res.status(statusCode).render('error', {
    title: statusCode === 404 ? 'Page Not Found' : 'Error',
    message,
    error: {
      status: statusCode,
      code: errorCode
    }
  });
};

// Async handler wrapper to catch errors in async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler for undefined routes
const notFoundHandler = (req, res, next) => {
  const error = new AppError('The requested resource was not found', 404, 'NOT_FOUND');
  next(error);
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};
