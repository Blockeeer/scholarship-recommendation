const { registerUser, loginUser, logoutUser } = require("../services/firebaseAuthService");
const { db } = require("../config/firebaseConfig");
const { doc, getDoc } = require("firebase/firestore");

// ----------------------
// PAGE RENDERING HANDLERS
// ----------------------
function showIndex(req, res) {
  res.render("index");
}

function showLogin(req, res) {
  res.render("login");
}

function showStudentRegister(req, res) {
  res.render("register_student");
}

function showSponsorRegister(req, res) {
  res.render("register_sponsor");
}

async function showDashboard(req, res) {
  if (!req.session.user) return res.redirect("/login");
  
  const { role, uid, email } = req.session.user;

  // ------------------------
  // ADMIN DASHBOARD
  // ------------------------
  if (role === "admin") {
    return res.render("admin/admin_dashboard", {
      layout: "layouts/admin_layout",
      email
    });
  }

  // ------------------------
  // STUDENT DASHBOARD
  // ------------------------
  if (role === "student") {
    try {
      // Check if student has completed assessment using UID
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log("❌ User document not found");
        return res.redirect("/login");
      }

      const userData = userDoc.data();
      
      // Check if assessment is completed
      if (!userData.hasCompletedAssessment) {
        console.log("📝 Assessment not completed, redirecting to assessment form");
        return res.redirect("/student/assessment");
      }

      // Get assessment data from subcollection
      const assessmentRef = doc(db, "users", uid, "assessment", "main");
      const assessmentDoc = await getDoc(assessmentRef);
      
      const assessmentData = assessmentDoc.exists() ? assessmentDoc.data() : null;

      console.log("✅ Loading student dashboard for UID:", uid);
      return res.render("student/student_dashboard", {
        layout: "layouts/student_layout",
        email,
        userData,
        assessmentData
      });
    } catch (error) {
      console.error("Error loading student dashboard:", error);
      return res.status(500).send("Error loading dashboard");
    }
  }

  // ------------------------
  // SPONSOR DASHBOARD
  // ------------------------
  if (role === "sponsor") {
    return res.render("sponsor/sponsor_dashboard", {
      layout: "layouts/sponsor_layout",
      email
    });
  }

  res.redirect("/");
}

// ----------------------
// AUTH LOGIC
// ----------------------

// Student Registration
async function registerStudent(req, res) {
  const { fullName, email, password, confirmPassword } = req.body;
  
  if (password !== confirmPassword) {
    return res.send("Passwords do not match.");
  }

  try {
    const user = await registerUser(email, password, "student", { fullName });
    
    // Store UID in session along with email and role
    req.session.user = { 
      uid: user.uid,
      email: user.email, 
      role: "student" 
    };
    
    console.log("🎓 Student registered with UID:", user.uid);
    // After registration → go to assessment
    return res.redirect("/student/assessment");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).send(error.message);
  }
}

// Sponsor Registration
async function registerSponsor(req, res) {
  const { fullName, email, password, confirmPassword } = req.body;
  
  if (password !== confirmPassword) {
    return res.send("Passwords do not match.");
  }

  try {
    const user = await registerUser(email, password, "sponsor", { fullName });
    
    // Store UID in session
    req.session.user = { 
      uid: user.uid,
      email: user.email, 
      role: "sponsor" 
    };
    
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).send(error.message);
  }
}

// Login
async function login(req, res) {
  const { email, password } = req.body;

  // Hardcoded Admin
  if (email === "admin@example.com" && password === "admin123") {
    req.session.user = { uid: "admin", email, role: "admin" };
    return res.redirect("/dashboard");
  }

  try {
    const { user, role } = await loginUser(email, password);
    
    // Store UID in session
    req.session.user = { 
      uid: user.uid,
      email: user.email, 
      role 
    };
    
    console.log("🔐 User logged in with UID:", user.uid);
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).send(error.message);
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