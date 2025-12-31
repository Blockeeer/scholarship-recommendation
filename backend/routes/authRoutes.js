const express = require("express");
const {
  showIndex,
  showDashboard,
  registerStudent,
  registerSponsor,
  login,
  logout,
  googleSignIn,
  forgotPassword,
  resendVerification,
  linkEmailPassword,
  setPasswordForGoogleUserController
} = require("../controllers/authController");
const {
  showAssessmentForm,
  submitAssessment
} = require("../controllers/assessmentController");
const { initializeAdmin } = require("../services/firebaseAuthService");
const { authLimiter, passwordResetLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Pages
router.get("/", showIndex);
// Redirect old login/register pages to home page (now using modals)
router.get("/login", (req, res) => res.redirect("/"));
router.get("/register/student", (req, res) => res.redirect("/"));
router.get("/register/sponsor", (req, res) => res.redirect("/"));
router.get("/dashboard", showDashboard);

// Auth Actions (with rate limiting)
router.post("/register/student", authLimiter, registerStudent);
router.post("/register/sponsor", authLimiter, registerSponsor);
router.post("/login", authLimiter, login);
router.post("/logout", logout);

// Google Sign-In (with rate limiting)
router.post("/auth/google", authLimiter, googleSignIn);

// Password Reset (with stricter rate limiting)
router.post("/auth/forgot-password", passwordResetLimiter, forgotPassword);

// Resend Verification Email (with rate limiting)
router.post("/auth/resend-verification", authLimiter, resendVerification);

// Link email/password to Google account (with rate limiting)
router.post("/auth/link-email-password", authLimiter, linkEmailPassword);

// Set password for Google-only users (with rate limiting)
router.post("/auth/set-password-for-google-user", authLimiter, setPasswordForGoogleUserController);

// // Show form
// router.get("/student/assessment", showAssessmentForm);
// router.post("/student/assessment", submitAssessment);

// One-time admin setup route (visit once to create admin)
router.get("/setup-admin", async (req, res) => {
  try {
    const result = await initializeAdmin();
    res.json({ success: true, message: "Admin account created", ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
