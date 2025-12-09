const { db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc } = require("firebase/firestore");

async function showAssessmentForm(req, res) {
  console.log("📝 Showing assessment form");
  console.log("Session user:", req.session.user);

  if (!req.session.user || req.session.user.role !== "student") {
    console.log("❌ Unauthorized access, redirecting to login");
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
    console.error("Error loading assessment form:", error);
    res.status(500).send("Error loading assessment form");
  }
}

async function submitAssessment(req, res) {
  console.log("📤 Assessment submission started");
  console.log("📦 Request body:", req.body);
  console.log("📁 Uploaded files:", req.files);
  console.log("👤 Session user:", req.session.user);

  // Check if user is logged in
  if (!req.session.user || req.session.user.role !== "student") {
    console.log("❌ No session user found or not a student");
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
    console.log("❌ Missing required fields:", missingFields);
    return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
  }

  const submissionDate = new Date();

  // Get file paths
  const files = {
    grades: req.files && req.files['grades'] ? req.files['grades'][0].filename : null,
    coe: req.files && req.files['coe'] ? req.files['coe'][0].filename : null,
    schoolId: req.files && req.files['schoolId'] ? req.files['schoolId'][0].filename : null,
    otherDocuments: req.files && req.files['otherDocuments'] ? req.files['otherDocuments'].map(f => f.filename) : []
  };

  try {
    // 1. Save assessment as a subcollection under the user document (using UID)
    const assessmentRef = doc(db, "users", userUid, "assessment", "main");
    
    const assessmentData = {
      fullName: fullName.trim(),
      age: parseInt(age),
      gender: gender.trim(),
      course: course.trim(),
      yearLevel: yearLevel.trim(),
      gpa: gpa.trim(),
      incomeRange: incomeRange.trim(),
      scholarshipType: scholarshipType.trim(),
      skills: skills ? skills.trim() : "",
      involvement: involvement ? involvement.trim() : "",
      essayReason: essayReason.trim(),
      files: files,
      submissionDate: submissionDate.toISOString(),
      status: "pending"
    };

    console.log("💾 Saving assessment data to Firestore...");
    console.log("🆔 User UID:", userUid);
    console.log("📧 User email:", userEmail);
    console.log("📄 Assessment data:", assessmentData);
    
    await setDoc(assessmentRef, assessmentData);

    // 2. Update the user document to mark assessment as completed
    const userRef = doc(db, "users", userUid);
    await setDoc(userRef, { 
      hasCompletedAssessment: true,
      lastAssessmentDate: submissionDate.toISOString()
    }, { merge: true }); // merge: true keeps existing fields

    console.log("✅ Assessment submitted successfully for UID:", userUid);
    console.log("✅ User document updated with assessment completion flag");

    // If there's a redirect scholarship ID, redirect to the scholarship apply page
    if (redirectScholarshipId) {
      console.log("🔄 Redirecting to scholarship apply page:", redirectScholarshipId);
      return res.redirect("/student/scholarships/" + redirectScholarshipId + "/apply");
    }

    console.log("🔄 Redirecting to /dashboard");
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Error submitting assessment:", err);
    console.error("Error stack:", err.stack);
    res.status(500).send("Error submitting assessment: " + err.message);
  }
}

module.exports = {
  showAssessmentForm,
  submitAssessment
};
