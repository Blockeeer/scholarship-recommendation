const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const dotenv = require("dotenv");
const authRoutes = require("./backend/routes/authRoutes");
const studentRoutes = require("./backend/routes/studentRoutes");
const sponsorRoutes = require("./backend/routes/sponsorRoutes");
const adminRoutes = require("./backend/routes/adminRoutes");
const { csrfProtection } = require("./backend/middleware/csrf");
const { sanitizeInputs } = require("./backend/middleware/sanitizer");
const { errorHandler } = require("./backend/middleware/errorHandler");
const { db } = require("./backend/config/firebaseConfig");
const { doc, getDoc } = require("firebase/firestore");

dotenv.config();
const app = express();

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://www.gstatic.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://api.openai.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.gstatic.com", "https://*.firebaseio.com", "https://*.googleapis.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - restrict to allowed origins
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for Render.com (must be before session)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Require SESSION_SECRET in production
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  process.exit(1);
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
      // Silent fail - profile picture will just not be available
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
app.use(errorHandler);

// Initialize scheduled tasks (auto-close expired scholarships, send reminders)
const { initializeScheduledTasks } = require('./backend/services/scheduledTasks');
// Run scheduled tasks every hour
initializeScheduledTasks(60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});