const xss = require('xss');

/**
 * XSS Filter options
 */
const xssOptions = {
  whiteList: {}, // No HTML tags allowed
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style']
};

/**
 * Sanitize a single value
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return xss(value.trim(), xssOptions);
  }
  return value;
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeValue(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      // Skip password fields (don't modify them)
      if (key.toLowerCase().includes('password')) {
        sanitized[key] = obj[key];
      } else {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Middleware to sanitize request body, query, and params
 */
function sanitizeInputs(req, res, next) {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
}

/**
 * Utility function to sanitize a single string (for use in controllers)
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return xss(str.trim(), xssOptions);
}

module.exports = {
  sanitizeInputs,
  sanitize,
  sanitizeObject
};
