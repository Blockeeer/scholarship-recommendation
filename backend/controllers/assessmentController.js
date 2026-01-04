const { db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc } = require("firebase/firestore");

async function showAssessmentForm(req, res) {

  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const userUid = req.session.user.uid;
  const redirectScholarshipId = req.query.redirect || null;

  try {
    // Check if user has already completed assessment
    const userRef = doc(db, "users", userUid);
    const userDoc = await getDoc(userRef);

    const hasCompletedAssessment = userDoc.exists() && userDoc.data().hasCompletedAssessment;

    // Get existing assessment data if available
    let assessmentData = null;
    if (hasCompletedAssessment) {
      const assessmentRef = doc(db, "users", userUid, "assessment", "main");
      const assessmentDoc = await getDoc(assessmentRef);
      if (assessmentDoc.exists()) {
        assessmentData = assessmentDoc.data();
      }
    }

    res.render("student/student_assessment", {
      email: req.session.user.email,
      uid: req.session.user.uid,
      hasCompletedAssessment,
      assessmentData,
      redirectScholarshipId
    });
  } catch (error) {
    res.status(500).send("Error loading assessment form");
  }
}

async function submitAssessment(req, res) {

  // Check if user is logged in
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const userUid = req.session.user.uid;
  const userEmail = req.session.user.email;

  const {
    fullName,
    age,
    gender,
    course,
    yearLevel,
    gpa,
    incomeRange,
    scholarshipType,
    skills,
    involvement,
    essayReason,
    redirectScholarshipId
  } = req.body;

  // Validate required fields
  const requiredFields = { fullName, age, gender, course, yearLevel, gpa, incomeRange, scholarshipType, essayReason };
  const missingFields = Object.keys(requiredFields).filter(key => !requiredFields[key]);
  
  if (missingFields.length > 0) {
    return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
  }

  const submissionDate = new Date();

  try {
    // 1. Get existing assessment data to preserve files if not replaced
    const assessmentRef = doc(db, "users", userUid, "assessment", "main");
    const existingAssessmentDoc = await getDoc(assessmentRef);
    const existingFiles = existingAssessmentDoc.exists() ? (existingAssessmentDoc.data().files || {}) : {};

    // Get file paths - preserve existing if no new file uploaded
    const files = {
      grades: req.files && req.files['grades'] ? req.files['grades'][0].filename : existingFiles.grades || null,
      coe: req.files && req.files['coe'] ? req.files['coe'][0].filename : existingFiles.coe || null,
      schoolId: req.files && req.files['schoolId'] ? req.files['schoolId'][0].filename : existingFiles.schoolId || null,
      otherDocuments: req.files && req.files['otherDocuments']
        ? req.files['otherDocuments'].map(f => f.filename)
        : existingFiles.otherDocuments || []
    };

    const assessmentData = {
      fullName: fullName.trim(),
      age: parseInt(age),
      gender: gender.trim(),
      course: course.trim(),
      yearLevel: yearLevel.trim(),
      gpa: gpa.trim(),
      incomeRange: incomeRange.trim(),
      scholarshipType: scholarshipType.trim(),
      skills: skills ? (Array.isArray(skills) ? skills.join(', ') : skills.trim()) : "",
      involvement: involvement ? (Array.isArray(involvement) ? involvement.join(', ') : involvement.trim()) : "",
      essayReason: essayReason.trim(),
      files: files,
      submissionDate: submissionDate.toISOString(),
      status: "pending"
    };

    
    await setDoc(assessmentRef, assessmentData);

    // 2. Update the user document to mark assessment as completed
    const userRef = doc(db, "users", userUid);
    await setDoc(userRef, { 
      hasCompletedAssessment: true,
      lastAssessmentDate: submissionDate.toISOString()
    }, { merge: true }); // merge: true keeps existing fields


    // If there's a redirect scholarship ID, redirect to the scholarship apply page
    if (redirectScholarshipId) {
      return res.redirect("/student/scholarships/" + redirectScholarshipId + "/apply");
    }

    return res.redirect("/dashboard");
  } catch (err) {
    res.status(500).send("Error submitting assessment: " + err.message);
  }
}

module.exports = {
  showAssessmentForm,
  submitAssessment
};
