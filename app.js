const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
const authRoutes = require("./backend/routes/authRoutes");
const studentRoutes = require("./backend/routes/studentRoutes");
const sponsorRoutes = require("./backend/routes/sponsorRoutes");
const adminRoutes = require("./backend/routes/adminRoutes");
const { csrfProtection } = require("./backend/middleware/csrf");
const { sanitizeInputs } = require("./backend/middleware/sanitizer");
const { db } = require("./backend/config/firebaseConfig");
const { doc, getDoc } = require("firebase/firestore");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for Render.com (must be before session)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Require SESSION_SECRET in production
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET environment variable is required in production');
    process.exit(1);
  } else {
    console.warn('WARNING: Using default session secret. Set SESSION_SECRET in .env for production.');
  }
}

// Session configuration with timeout
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours of inactivity

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-secret-change-in-production",
  resave: true, // Enable resave to update session on each request
  saveUninitialized: false,
  rolling: true, // Reset maxAge on each request (extends session on activity)
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE
  }
}));

// Session inactivity timeout middleware
app.use((req, res, next) => {
  if (req.session && req.session.user) {
    const now = Date.now();
    const lastActivity = req.session.lastActivity || now;

    // Check if session has been inactive too long
    if (now - lastActivity > SESSION_INACTIVITY_TIMEOUT) {
      // Destroy session due to inactivity
      return req.session.destroy((err) => {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(401).json({
            success: false,
            error: 'Session expired due to inactivity. Please log in again.',
            redirect: '/'
          });
        }
        return res.redirect('/?sessionExpired=true');
      });
    }

    // Update last activity timestamp
    req.session.lastActivity = now;
  }
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "frontend/views"));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, 'frontend/public')));
app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads')));

// Input sanitization middleware (XSS protection)
app.use(sanitizeInputs);

// CSRF Protection middleware
app.use(csrfProtection);

// Middleware to pass user profile picture to all views
app.use(async (req, res, next) => {
  if (req.session && req.session.user && req.session.user.uid) {
    try {
      // Check if we already have profilePicture cached in session
      if (req.session.user.profilePicture === undefined) {
        const userRef = doc(db, "users", req.session.user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          req.session.user.profilePicture = userData.profilePicture || null;
          req.session.user.fullName = userData.fullName || req.session.user.fullName;
        }
      }
      // Make profilePicture available to all views via res.locals
      res.locals.profilePicture = req.session.user.profilePicture;
      res.locals.fullName = req.session.user.fullName;
      res.locals.email = req.session.user.email;
    } catch (error) {
      console.error("Error fetching user profile for sidebar:", error);
    }
  }
  next();
});

// Routes
app.use("/", authRoutes);
app.use("/student", studentRoutes);
app.use("/sponsor", sponsorRoutes);
app.use("/admin", adminRoutes);

// 404 Error Handler
app.use((req, res, next) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    error: { status: 404 }
  });
});

// General Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again later.'
      : err.message,
    error: { status: err.status || 500 }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));