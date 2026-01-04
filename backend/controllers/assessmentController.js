const { db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc } = require("firebase/firestore");
const { uploadToCloudinary } = require("../config/cloudinaryConfig");
const fs = require("fs");

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

/**
 * Upload a single file to Cloudinary and clean up local file
 * @param {object} file - Multer file object
 * @param {string} userUid - User ID for folder organization
 * @param {string} docType - Document type (grades, coe, schoolId, etc.)
 * @returns {Promise<string|null>} - Cloudinary URL or null
 */
async function uploadFileToCloudinary(file, userUid, docType) {
  if (!file) return null;

  try {
    const folder = `iskolarpath/assessments/${userUid}`;
    const result = await uploadToCloudinary(file.path, folder, `${docType}_${Date.now()}`);

    // Delete the local temp file after successful upload
    fs.unlink(file.path, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    return result.secure_url;
  } catch (error) {
    console.error(`Error uploading ${docType} to Cloudinary:`, error);
    // Clean up local file even on error
    fs.unlink(file.path, () => {});
    return null;
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

    // Upload files to Cloudinary - preserve existing if no new file uploaded
    const files = {
      grades: null,
      coe: null,
      schoolId: null,
      otherDocuments: []
    };

    // Upload grades file
    if (req.files && req.files['grades'] && req.files['grades'][0]) {
      files.grades = await uploadFileToCloudinary(req.files['grades'][0], userUid, 'grades');
    }
    if (!files.grades) {
      files.grades = existingFiles.grades || null;
    }

    // Upload COE file
    if (req.files && req.files['coe'] && req.files['coe'][0]) {
      files.coe = await uploadFileToCloudinary(req.files['coe'][0], userUid, 'coe');
    }
    if (!files.coe) {
      files.coe = existingFiles.coe || null;
    }

    // Upload School ID file
    if (req.files && req.files['schoolId'] && req.files['schoolId'][0]) {
      files.schoolId = await uploadFileToCloudinary(req.files['schoolId'][0], userUid, 'schoolId');
    }
    if (!files.schoolId) {
      files.schoolId = existingFiles.schoolId || null;
    }

    // Upload other documents
    if (req.files && req.files['otherDocuments'] && req.files['otherDocuments'].length > 0) {
      const uploadPromises = req.files['otherDocuments'].map((file, index) =>
        uploadFileToCloudinary(file, userUid, `other_${index}`)
      );
      const uploadedUrls = await Promise.all(uploadPromises);
      files.otherDocuments = uploadedUrls.filter(url => url !== null);
    }
    if (files.otherDocuments.length === 0) {
      files.otherDocuments = existingFiles.otherDocuments || [];
    }

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
    console.error("Assessment submission error:", err);
    res.status(500).send("Error submitting assessment: " + err.message);
  }
}

module.exports = {
  showAssessmentForm,
  submitAssessment
};
