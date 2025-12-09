const { registerUser, loginUser, logoutUser } = require("../services/firebaseAuthService");
const { db } = require("../config/firebaseConfig");
const { doc, getDoc } = require("firebase/firestore");

// ----------------------
// HELPER FUNCTIONS
// ----------------------
function getReadableErrorMessage(error) {
  const errorCode = error.code || '';
  const errorMessage = error.message || '';
  const lowerMessage = errorMessage.toLowerCase();

  console.log('🔍 Processing error - Code:', errorCode, 'Message:', errorMessage);

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
  console.warn('⚠️ Unhandled error type:', errorCode, errorMessage);
  return 'The email or password you entered is incorrect. Please try again.';
}

// ----------------------
// PAGE RENDERING HANDLERS
// ----------------------
function showIndex(req, res) {
  res.render("index");
}

function showLogin(req, res) {
  res.render("login", {
    error: null,
    email: ""
  });
}

function showStudentRegister(req, res) {
  res.render("register_student", {
    error: null,
    formData: {}
  });
}

function showSponsorRegister(req, res) {
  res.render("register_sponsor", {
    error: null,
    formData: {}
  });
}

async function showDashboard(req, res) {
  if (!req.session.user) return res.redirect("/login");

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

  // Server-side validation
  if (!fullName || !email || !password || !confirmPassword) {
    return res.render("register_student", {
      error: "All fields are required",
      formData: { fullName, email }
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("register_student", {
      error: "Please enter a valid email address",
      formData: { fullName, email }
    });
  }

  // Password length validation
  if (password.length < 6) {
    return res.render("register_student", {
      error: "Password must be at least 6 characters long",
      formData: { fullName, email }
    });
  }

  // Password match validation
  if (password !== confirmPassword) {
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
      fullName: fullName
    };

    console.log("🎓 Student registered with UID:", user.uid);
    // After registration → go to assessment
    return res.redirect("/student/assessment");
  } catch (error) {
    console.error("Registration error:", error);
    return res.render("register_student", {
      error: getReadableErrorMessage(error),
      formData: { fullName, email }
    });
  }
}

// Sponsor Registration
async function registerSponsor(req, res) {
  const { fullName, email, password, confirmPassword } = req.body;

  // Server-side validation
  if (!fullName || !email || !password || !confirmPassword) {
    return res.render("register_sponsor", {
      error: "All fields are required",
      formData: { fullName, email }
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("register_sponsor", {
      error: "Please enter a valid email address",
      formData: { fullName, email }
    });
  }

  // Password length validation
  if (password.length < 6) {
    return res.render("register_sponsor", {
      error: "Password must be at least 6 characters long",
      formData: { fullName, email }
    });
  }

  // Password match validation
  if (password !== confirmPassword) {
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
      fullName: fullName
    };

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Registration error:", error);
    return res.render("register_sponsor", {
      error: getReadableErrorMessage(error),
      formData: { fullName, email }
    });
  }
}

// Login
async function login(req, res) {
  const { email, password } = req.body;

  // Server-side validation
  if (!email || !password) {
    return res.render("login", {
      error: "Please provide both email and password",
      email: email || ""
    });
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("login", {
      error: "Please enter a valid email address",
      email
    });
  }

  // Hardcoded Admin
  if (email === "admin@example.com" && password === "admin123") {
    req.session.user = { uid: "admin", email, role: "admin", fullName: "System Administrator" };
    return res.redirect("/dashboard");
  }

  try {
    const { user, role, userData } = await loginUser(email, password);

    // Store UID in session with fullName
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role,
      fullName: userData.fullName || ""
    };

    console.log("🔐 User logged in with UID:", user.uid);
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);

    // Return to login with user-friendly error message and preserve email
    return res.render("login", {
      error: getReadableErrorMessage(error),
      email
    });
  }
}

// Logout
async function logout(req, res) {
  await logoutUser();
  req.session.destroy(() => res.redirect("/login"));
}

module.exports = {
  showIndex,
  showLogin,
  showStudentRegister,
  showSponsorRegister,
  showDashboard,
  registerStudent,
  registerSponsor,
  login,
  logout,
};