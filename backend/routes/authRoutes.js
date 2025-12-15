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

const router = express.Router();

// Pages
router.get("/", showIndex);
// Redirect old login/register pages to home page (now using modals)
router.get("/login", (req, res) => res.redirect("/"));
router.get("/register/student", (req, res) => res.redirect("/"));
router.get("/register/sponsor", (req, res) => res.redirect("/"));
router.get("/dashboard", showDashboard);

// Auth Actions
router.post("/register/student", registerStudent);
router.post("/register/sponsor", registerSponsor);
router.post("/login", login);
router.post("/logout", logout);

// Google Sign-In
router.post("/auth/google", googleSignIn);

// Password Reset
router.post("/auth/forgot-password", forgotPassword);

// Resend Verification Email
router.post("/auth/resend-verification", resendVerification);

// Link email/password to Google account
router.post("/auth/link-email-password", linkEmailPassword);

// Set password for Google-only users
router.post("/auth/set-password-for-google-user", setPasswordForGoogleUserController);

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
