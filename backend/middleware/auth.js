/**
 * Authentication Middleware
 * Protects routes by checking session
 */

// Check if user is authenticated (any role)
function requireAuth(req, res, next) {
  if (!req.session.user) {
    // Check if it's an API request
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Please log in to continue' });
    }
    return res.redirect('/');
  }
  next();
}

// Check if user is a student
function requireStudent(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Please log in to continue' });
    }
    return res.redirect('/');
  }
  if (req.session.user.role !== 'student') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ success: false, error: 'Access denied. Students only.' });
    }
    return res.redirect('/dashboard');
  }
  next();
}

// Check if user is a sponsor
function requireSponsor(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Please log in to continue' });
    }
    return res.redirect('/');
  }
  if (req.session.user.role !== 'sponsor') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ success: false, error: 'Access denied. Sponsors only.' });
    }
    return res.redirect('/dashboard');
  }
  next();
}

// Check if user is an admin
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Please log in to continue' });
    }
    return res.redirect('/');
  }
  if (req.session.user.role !== 'admin') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ success: false, error: 'Access denied. Admins only.' });
    }
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  requireStudent,
  requireSponsor,
  requireAdmin
};
