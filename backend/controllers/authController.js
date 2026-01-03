const { registerUser, loginUser, logoutUser, signInWithGoogle, resetPassword, resendVerificationEmail, updateAuthProviderStatus, setPasswordForGoogleUser } = require("../services/firebaseAuthService");
const { db } = require("../config/firebaseConfig");
const { doc, getDoc } = require("firebase/firestore");

// ----------------------
// HELPER FUNCTIONS
// ----------------------

/**
 * Validate email format - checks for common issues like .com.com
 */
function isValidEmail(email) {
  // Basic email regex
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicRegex.test(email)) {
    return { valid: false, error: "Please enter a valid email address" };
  }

  // Check for repeated TLDs like .com.com, .org.org, etc.
  const repeatedTldRegex = /\.(com|org|net|edu|gov|io|co|ph)\.\1$/i;
  if (repeatedTldRegex.test(email)) {
    return { valid: false, error: "Invalid email format: duplicate domain extension detected (e.g., .com.com)" };
  }

  // Check for common typos in TLDs
  const suspiciousTldRegex = /\.(com|org|net|edu|gov|io|co|ph)\.(com|org|net|edu|gov|io|co|ph)$/i;
  if (suspiciousTldRegex.test(email)) {
    return { valid: false, error: "Invalid email format: please check your email domain" };
  }

  // Check for multiple @ symbols
  if ((email.match(/@/g) || []).length > 1) {
    return { valid: false, error: "Invalid email format: multiple @ symbols detected" };
  }

  // Check for spaces
  if (email.includes(' ')) {
    return { valid: false, error: "Email cannot contain spaces" };
  }

  return { valid: true };
}

function getReadableErrorMessage(error) {
  const errorCode = error.code || '';
  const errorMessage = error.message || '';
  const lowerMessage = errorMessage.toLowerCase();


  // Firestore permission errors (check first)
  if (errorCode.includes('permission-denied') || lowerMessage.includes('permission')) {
    return 'Database permission error. Please update Firestore security rules in Firebase Console.';
  }

  // Firebase Auth errors
  if (errorCode.includes('auth/invalid-credential') ||
      errorCode.includes('auth/wrong-password') ||
      errorCode.includes('auth/user-not-found') ||
      errorCode.includes('auth/invalid-login-credentials')) {
    return 'The email or password you entered is incorrect. Please try again.';
  }

  if (errorCode.includes('auth/email-already-in-use')) {
    return 'This email is already registered. Please login or use a different email.';
  }

  if (errorCode.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }

  if (errorCode.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }

  if (errorCode.includes('auth/too-many-requests')) {
    return 'Too many failed login attempts. Please try again later.';
  }

  if (errorCode.includes('auth/network-request-failed')) {
    return 'Network error. Please check your connection and try again.';
  }

  if (errorCode.includes('auth/user-data-not-found')) {
    return 'Account setup incomplete. Please contact support.';
  }

  // Check error message as fallback

  if (lowerMessage.includes('invalid-credential') ||
      lowerMessage.includes('wrong password') ||
      lowerMessage.includes('user not found') ||
      lowerMessage.includes('invalid login')) {
    return 'The email or password you entered is incorrect. Please try again.';
  }

  if (lowerMessage.includes('password')) {
    return 'The email or password you entered is incorrect.';
  }

  if (lowerMessage.includes('email')) {
    return 'There was a problem with the email address provided.';
  }

  // Default fallback
  return 'The email or password you entered is incorrect. Please try again.';
}

// ----------------------
// PAGE RENDERING HANDLERS
// ----------------------
function showIndex(req, res) {
  res.render("index", {
    firebaseApiKey: process.env.FIREBASE_API_KEY || '',
    firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || ''
  });
}

async function showDashboard(req, res) {
  if (!req.session.user) return res.redirect("/");

  const { role, uid, email } = req.session.user;

  // ------------------------
  // ADMIN DASHBOARD - Redirect to admin route with real data
  // ------------------------
  if (role === "admin") {
    return res.redirect("/admin/dashboard");
  }

  // ------------------------
  // STUDENT DASHBOARD - Redirect to student route with real data
  // ------------------------
  if (role === "student") {
    return res.redirect("/student/dashboard");
  }

  // ------------------------
  // SPONSOR DASHBOARD - Redirect to sponsor route with real data
  // ------------------------
  if (role === "sponsor") {
    return res.redirect("/sponsor/dashboard");
  }

  res.redirect("/");
}

// ----------------------
// AUTH LOGIC
// ----------------------

// Student Registration
async function registerStudent(req, res) {
  const { fullName, email, password, confirmPassword } = req.body;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  // Server-side validation
  if (!fullName || !email || !password || !confirmPassword) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }
    return res.render("register_student", {
      error: "All fields are required",
      formData: { fullName, email }
    });
  }

  // Email validation with advanced checks
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: emailValidation.error });
    }
    return res.render("register_student", {
      error: emailValidation.error,
      formData: { fullName, email }
    });
  }

  // Password length validation
  if (password.length < 6) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long" });
    }
    return res.render("register_student", {
      error: "Password must be at least 6 characters long",
      formData: { fullName, email }
    });
  }

  // Password match validation
  if (password !== confirmPassword) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "Passwords do not match" });
    }
    return res.render("register_student", {
      error: "Passwords do not match",
      formData: { fullName, email }
    });
  }

  try {
    const user = await registerUser(email, password, "student", { fullName });

    // Store UID in session along with email, role and fullName
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role: "student",
      fullName: fullName,
      emailVerified: user.emailVerified || false
    };


    // Return JSON response for modal or redirect for form
    if (isJsonRequest) {
      return res.json({
        success: true,
        redirect: "/student/assessment",
        message: "Account created! Please check your email to verify your account."
      });
    }
    return res.redirect("/student/assessment");
  } catch (error) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
    }
    return res.render("register_student", {
      error: getReadableErrorMessage(error),
      formData: { fullName, email }
    });
  }
}

// Sponsor Registration
async function registerSponsor(req, res) {
  const { fullName, email, password, confirmPassword } = req.body;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  // Server-side validation
  if (!fullName || !email || !password || !confirmPassword) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }
    return res.render("register_sponsor", {
      error: "All fields are required",
      formData: { fullName, email }
    });
  }

  // Email validation with advanced checks
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: emailValidation.error });
    }
    return res.render("register_sponsor", {
      error: emailValidation.error,
      formData: { fullName, email }
    });
  }

  // Password length validation
  if (password.length < 6) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long" });
    }
    return res.render("register_sponsor", {
      error: "Password must be at least 6 characters long",
      formData: { fullName, email }
    });
  }

  // Password match validation
  if (password !== confirmPassword) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "Passwords do not match" });
    }
    return res.render("register_sponsor", {
      error: "Passwords do not match",
      formData: { fullName, email }
    });
  }

  try {
    const user = await registerUser(email, password, "sponsor", { fullName });

    // Store UID in session with fullName
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role: "sponsor",
      fullName: fullName,
      emailVerified: user.emailVerified || false
    };

    if (isJsonRequest) {
      return res.json({
        success: true,
        redirect: "/dashboard",
        message: "Account created! Please check your email to verify your account."
      });
    }
    return res.redirect("/dashboard");
  } catch (error) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
    }
    return res.render("register_sponsor", {
      error: getReadableErrorMessage(error),
      formData: { fullName, email }
    });
  }
}

// Login
async function login(req, res) {
  const { email, password } = req.body;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  // Server-side validation
  if (!email || !password) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: "Please provide both email and password" });
    }
    return res.render("login", {
      error: "Please provide both email and password",
      email: email || ""
    });
  }

  // Email validation with advanced checks
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: emailValidation.error });
    }
    return res.render("login", {
      error: emailValidation.error,
      email
    });
  }

  // Admin login via environment variables (secure)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
    req.session.user = { uid: "admin", email, role: "admin", fullName: "System Administrator" };
    if (isJsonRequest) {
      return res.json({ success: true, redirect: "/dashboard" });
    }
    return res.redirect("/dashboard");
  }

  try {
    const { user, role, userData } = await loginUser(email, password);

    // Store UID in session with fullName
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role,
      fullName: userData.fullName || "",
      emailVerified: user.emailVerified || false
    };


    if (isJsonRequest) {
      return res.json({ success: true, redirect: "/dashboard" });
    }
    return res.redirect("/dashboard");
  } catch (error) {

    if (isJsonRequest) {
      return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
    }
    // Return to login with user-friendly error message and preserve email
    return res.render("login", {
      error: getReadableErrorMessage(error),
      email
    });
  }
}

// Google Sign-In
async function googleSignIn(req, res) {
  const { uid, email, displayName, role = "student" } = req.body;


  if (!uid || !email) {
    return res.status(400).json({ success: false, error: "Google user data is required" });
  }

  try {
    const googleUser = { uid, email, displayName };
    const { user, role: userRole, userData, isNewUser } = await signInWithGoogle(googleUser, role);

    // Store in session
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role: userRole,
      fullName: userData.fullName || user.displayName || "",
      emailVerified: true // Google accounts are always verified
    };


    // Determine redirect based on role and new user status
    let redirect = "/dashboard";
    if (isNewUser && userRole === "student") {
      redirect = "/student/assessment";
    }

    return res.json({
      success: true,
      redirect,
      isNewUser,
      message: isNewUser ? "Account created successfully with Google!" : "Logged in with Google!"
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
  }
}

// Password Reset
async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  // Validate email format
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    return res.status(400).json({ success: false, error: emailValidation.error });
  }

  try {
    await resetPassword(email);
    return res.json({
      success: true,
      message: "Password reset email sent! Please check your inbox."
    });
  } catch (error) {

    // Don't reveal if email exists or not for security
    if (error.code === "auth/user-not-found") {
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset email has been sent."
      });
    }

    return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
  }
}

// Resend Verification Email
async function resendVerification(req, res) {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    // Check if user already verified
    if (req.session.user.emailVerified) {
      return res.json({
        success: true,
        message: "Your email is already verified!"
      });
    }

    // Check if user signed up with Google (already verified)
    if (req.session.user.authProvider === 'google') {
      return res.json({
        success: true,
        message: "Google accounts are automatically verified!"
      });
    }

    await resendVerificationEmail();
    return res.json({
      success: true,
      message: "Verification email sent! Please check your inbox."
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: getReadableErrorMessage(error) });
  }
}

// Logout
async function logout(req, res) {
  await logoutUser();
  req.session.destroy(() => res.redirect("/"));
}

// Update auth provider after linking email/password credentials
async function linkEmailPassword(req, res) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const { uid } = req.session.user;

  try {
    await updateAuthProviderStatus(uid);

    // Update session
    req.session.user.authProvider = "both";

    return res.json({
      success: true,
      message: "Email/password login enabled successfully!"
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

// Set password for Google-only users
async function setPasswordForGoogleUserController(req, res) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const { uid, email } = req.session.user;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  try {
    await setPasswordForGoogleUser(uid, email, password);

    // Update session to reflect new auth provider
    req.session.user.authProvider = "both";

    return res.json({
      success: true,
      message: "Password set successfully! You can now log in with email and password."
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

module.exports = {
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
  setPasswordForGoogleUserController,
};