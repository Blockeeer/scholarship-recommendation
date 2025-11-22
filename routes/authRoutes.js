const express = require("express");
const {
  showIndex,
  showLogin,
  showStudentRegister,
  showSponsorRegister,
  showDashboard,
  registerStudent,
  registerSponsor,
  login,
  logout
} = require("../controllers/authController");
const {
  showAssessmentForm,
  submitAssessment
} = require("../controllers/assessmentController");

const router = express.Router();

// Pages
router.get("/", showIndex);
router.get("/login", showLogin);
router.get("/register/student", showStudentRegister);
router.get("/register/sponsor", showSponsorRegister);
router.get("/dashboard", showDashboard);

// Auth Actions
router.post("/register/student", registerStudent);
router.post("/register/sponsor", registerSponsor);
router.post("/login", login);
router.get("/logout", logout);

// // Show form
// router.get("/student/assessment", showAssessmentForm);
// router.post("/student/assessment", submitAssessment);

module.exports = router;
