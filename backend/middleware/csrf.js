const crypto = require('crypto');

/**
 * Generate a CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens for form submissions
 */
function csrfProtection(req, res, next) {
  // Generate token if not exists
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }

  // Make token available to views
  res.locals.csrfToken = req.session.csrfToken;

  // Skip CSRF check for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API routes that use other authentication (like session-based JSON APIs)
  // These are protected by session cookies with sameSite: strict
  if (req.xhr || req.headers['content-type']?.includes('application/json')) {
    return next();
  }

  // Validate CSRF token for form submissions
  const token = req.body._csrf || req.headers['x-csrf-token'];

  if (!token || token !== req.session.csrfToken) {
    console.warn('CSRF token mismatch:', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'Invalid security token. Please refresh the page and try again.',
      error: { status: 403 }
    });
  }

  // Regenerate token after successful validation (one-time use)
  req.session.csrfToken = generateToken();
  res.locals.csrfToken = req.session.csrfToken;

  next();
}

/**
 * Helper to create CSRF hidden input for forms
 */
function csrfField(token) {
  return `<input type="hidden" name="_csrf" value="${token}">`;
}

module.exports = {
  csrfProtection,
  generateToken,
  csrfField
};
