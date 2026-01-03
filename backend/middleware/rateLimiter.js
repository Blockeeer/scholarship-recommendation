const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints (login, register, password reset)
 * More restrictive to prevent brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * Rate limiter for password reset specifically (even more restrictive)
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password reset requests per hour
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * General API rate limiter (less restrictive)
 */
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: {
    success: false,
    error: 'Too many requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for file uploads
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    success: false,
    error: 'Too many file uploads. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  uploadLimiter
};
