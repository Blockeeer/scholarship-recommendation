/**
 * Student Controller
 * Handles student-related operations (search, apply, recommendations, etc.)
 */

const { db } = require("../config/firebaseConfig");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} = require("firebase/firestore");
const { matchStudentToScholarships } = require("../services/gptMatchingService");
const { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead } = require("../services/notificationService");
const { getPaginationParams, paginateArray, buildPaginationUI, getPaginationInfo } = require("../utils/pagination");
const { generateScholarshipICS } = require("../utils/icalGenerator");

/**
 * Show student dashboard
 */
async function showStudentDashboard(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const studentUid = req.session.user.uid;

  try {
    // Run all independent queries in parallel for better performance
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const applicationsRef = collection(db, "applications");
    const scholarshipsRef = collection(db, "scholarships");

    const appQuery = query(applicationsRef, where("studentUid", "==", studentUid));
    const scholarshipQuery = query(scholarshipsRef, where("status", "==", "Open"));

    const [
      assessmentDoc,
      appSnapshot,
      scholarshipSnapshot,
      unreadCount
    ] = await Promise.all([
      getDoc(assessmentRef),
      getDocs(appQuery),
      getDocs(scholarshipQuery),
      getUnreadCount(studentUid)
    ]);

    const hasAssessment = assessmentDoc.exists();

    let applicationStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    appSnapshot.forEach(doc => {
      const app = doc.data();
      applicationStats.total++;
      if (app.status === "pending" || app.status === "under_review") applicationStats.pending++;
      else if (app.status === "approved") applicationStats.approved++;
      else if (app.status === "rejected") applicationStats.rejected++;
    });

    const availableScholarships = scholarshipSnapshot.size;

    res.render("student/student_dashboard", {
      email: req.session.user.email,
      fullName: req.session.user.fullName || "",
      hasAssessment,
      applicationStats,
      availableScholarships,
      unreadNotifications: unreadCount
    });

  } catch (error) {
    res.render("student/student_dashboard", {
      email: req.session.user.email,
      fullName: req.session.user.fullName || "",
      hasAssessment: false,
      applicationStats: { total: 0, pending: 0, approved: 0, rejected: 0 },
      availableScholarships: 0,
      unreadNotifications: 0
    });
  }
}

/**
 * Search scholarships with filters
 */
async function searchScholarships(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const { type, course, minGPA, search } = req.query;
  const { page, limit } = getPaginationParams(req.query, 9); // 9 items per page (3x3 grid)

  try {
    const scholarshipsRef = collection(db, "scholarships");
    // Use only where clause to avoid composite index requirement
    let q = query(scholarshipsRef, where("status", "==", "Open"));

    const snapshot = await getDocs(q);
    let scholarships = [];

    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt in JavaScript (descending)
    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply filters (client-side filtering for flexibility)
    if (type && type !== "all") {
      scholarships = scholarships.filter(s => s.scholarshipType === type);
    }

    if (course && course !== "all") {
      scholarships = scholarships.filter(s =>
        !s.eligibleCourses ||
        s.eligibleCourses.length === 0 ||
        s.eligibleCourses.some(c => c.toLowerCase().includes(course.toLowerCase()))
      );
    }

    if (minGPA) {
      const gpa = parseFloat(minGPA);
      scholarships = scholarships.filter(s => parseFloat(s.minGPA) <= gpa);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      scholarships = scholarships.filter(s =>
        s.scholarshipName.toLowerCase().includes(searchLower) ||
        s.organizationName.toLowerCase().includes(searchLower)
      );
    }

    // Get unique values for filter dropdowns
    const allScholarshipsSnapshot = await getDocs(query(scholarshipsRef, where("status", "==", "Open")));
    const allScholarships = [];
    allScholarshipsSnapshot.forEach(doc => allScholarships.push(doc.data()));

    const scholarshipTypes = [...new Set(allScholarships.map(s => s.scholarshipType))];
    const courses = [...new Set(allScholarships.flatMap(s => s.eligibleCourses || []))];

    // Paginate the filtered results
    const { data: paginatedScholarships, pagination } = paginateArray(scholarships, page, limit);

    // Build pagination UI with current query params preserved
    const queryParams = { type, course, minGPA, search };
    // Remove empty params
    Object.keys(queryParams).forEach(key => {
      if (!queryParams[key]) delete queryParams[key];
    });
    const paginationUI = buildPaginationUI(pagination, '/student/scholarships', queryParams);
    const paginationInfo = getPaginationInfo(pagination);

    res.render("student/search_scholarships", {
      email: req.session.user.email,
      scholarships: paginatedScholarships,
      totalResults: scholarships.length,
      filters: { type, course, minGPA, search },
      scholarshipTypes,
      courses,
      pagination: paginationUI,
      paginationInfo
    });

  } catch (error) {
    res.status(500).send("Error loading scholarships");
  }
}

/**
 * View scholarship details
 */
async function viewScholarshipDetails(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    // Check if student has already applied
    const applicationsRef = collection(db, "applications");
    const appQuery = query(
      applicationsRef,
      where("studentUid", "==", req.session.user.uid),
      where("scholarshipId", "==", scholarshipId)
    );
    const appSnapshot = await getDocs(appQuery);
    const hasApplied = !appSnapshot.empty;

    let existingApplication = null;
    if (hasApplied) {
      appSnapshot.forEach(doc => {
        existingApplication = { id: doc.id, ...doc.data() };
      });
    }

    // Check if student has completed assessment
    const assessmentRef = doc(db, "users", req.session.user.uid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);
    const hasAssessment = assessmentDoc.exists();

    res.render("student/scholarship_details", {
      email: req.session.user.email,
      scholarship,
      hasApplied,
      existingApplication,
      hasAssessment
    });

  } catch (error) {
    res.status(500).send("Error loading scholarship");
  }
}

/**
 * Show application form
 */
async function showApplyForm(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    // Check if student has completed assessment
    const assessmentRef = doc(db, "users", req.session.user.uid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);

    if (!assessmentDoc.exists()) {
      return res.redirect("/student/assessment?redirect=" + scholarshipId);
    }

    const assessment = assessmentDoc.data();

    // Get scholarship details
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    if (scholarship.status !== "Open") {
      return res.redirect("/student/scholarships/" + scholarshipId + "?error=closed");
    }

    res.render("student/apply_scholarship", {
      email: req.session.user.email,
      scholarship,
      assessment
    });

  } catch (error) {
    res.status(500).send("Error loading application form");
  }
}

/**
 * Get saved scholarship recommendations (loads from database)
 */
async function getRecommendations(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const studentUid = req.session.user.uid;

  try {
    // Get student's assessment
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);

    if (!assessmentDoc.exists()) {
      return res.render("student/recommendations", {
        email: req.session.user.email,
        recommendations: [],
        hasAssessment: false,
        lastGenerated: null,
        error: "Please complete your assessment to get personalized recommendations."
      });
    }

    const assessment = assessmentDoc.data();

    // Get saved recommendations from database
    const recommendationsRef = doc(db, "users", studentUid, "recommendations", "main");
    const recommendationsDoc = await getDoc(recommendationsRef);

    if (!recommendationsDoc.exists()) {
      // No saved recommendations yet - show empty state with generate button
      return res.render("student/recommendations", {
        email: req.session.user.email,
        recommendations: [],
        hasAssessment: true,
        lastGenerated: null,
        assessment
      });
    }

    const savedData = recommendationsDoc.data();
    const savedRecommendations = savedData.recommendations || [];
    const lastGenerated = savedData.generatedAt;

    // Get current scholarship data to enrich saved recommendations
    const scholarshipsRef = collection(db, "scholarships");
    const snapshot = await getDocs(scholarshipsRef);

    const scholarshipsMap = {};
    snapshot.forEach(doc => {
      scholarshipsMap[doc.id] = { id: doc.id, ...doc.data() };
    });

    // Enhance saved recommendations with current scholarship data
    const enhancedRecommendations = savedRecommendations.map(rec => {
      const scholarship = scholarshipsMap[rec.scholarshipId];
      return {
        ...rec,
        scholarship
      };
    }).filter(rec => rec.scholarship); // Filter out recommendations for deleted scholarships

    res.render("student/recommendations", {
      email: req.session.user.email,
      recommendations: enhancedRecommendations,
      hasAssessment: true,
      lastGenerated,
      assessment
    });

  } catch (error) {
    res.render("student/recommendations", {
      email: req.session.user.email,
      recommendations: [],
      hasAssessment: true,
      lastGenerated: null,
      error: "Error loading recommendations. Please try again later."
    });
  }
}

/**
 * Generate and save AI-powered scholarship recommendations
 */
async function generateAndSaveRecommendations(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;

  try {
    // Get student's assessment
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);

    if (!assessmentDoc.exists()) {
      return res.status(400).json({ error: "Please complete your assessment first." });
    }

    const assessment = assessmentDoc.data();

    // Get all open scholarships
    const scholarshipsRef = collection(db, "scholarships");
    const q = query(scholarshipsRef, where("status", "==", "Open"));
    const snapshot = await getDocs(q);

    const scholarships = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only include scholarships with available slots
      if ((data.slotsAvailable - (data.slotsFilled || 0)) > 0) {
        scholarships.push({ id: doc.id, ...data });
      }
    });

    if (scholarships.length === 0) {
      return res.status(400).json({ error: "No scholarships are currently available." });
    }


    // Get GPT recommendations - personalized for this specific student (with caching)
    const recommendations = await matchStudentToScholarships(assessment, scholarships, studentUid);

    // Sort recommendations by matchScore (highest to lowest)
    recommendations.sort((a, b) => b.matchScore - a.matchScore);

    // Save recommendations to database (each student has their own recommendations)
    const recommendationsRef = doc(db, "users", studentUid, "recommendations", "main");
    await setDoc(recommendationsRef, {
      recommendations: recommendations,
      generatedAt: new Date().toISOString(),
      studentName: assessment.fullName,
      assessmentSnapshot: {
        fullName: assessment.fullName,
        gpa: assessment.gpa,
        course: assessment.course,
        yearLevel: assessment.yearLevel,
        incomeRange: assessment.incomeRange,
        scholarshipType: assessment.scholarshipType
      }
    });


    res.json({
      success: true,
      count: recommendations.length,
      message: `Generated ${recommendations.length} scholarship recommendations.`
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to generate recommendations. Please try again later." });
  }
}

/**
 * Get student's applications
 */
async function getMyApplications(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const studentUid = req.session.user.uid;
  const { page, limit } = getPaginationParams(req.query, 10);

  try {
    const applicationsRef = collection(db, "applications");
    // Use only where clause to avoid composite index requirement
    const q = query(
      applicationsRef,
      where("studentUid", "==", studentUid)
    );
    const snapshot = await getDocs(q);

    const applications = [];
    snapshot.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt in JavaScript (descending)
    applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate stats (before pagination)
    const stats = {
      total: applications.filter(a => a.status !== "draft").length, // Don't count drafts in total
      draft: applications.filter(a => a.status === "draft").length,
      pending: applications.filter(a => a.status === "pending" || a.status === "under_review" || a.status === "accepted").length,
      notified: applications.filter(a => a.status === "notified").length,
      notSelected: applications.filter(a => a.status === "not_selected").length
    };

    // Paginate applications
    const { data: paginatedApplications, pagination } = paginateArray(applications, page, limit);
    const paginationUI = buildPaginationUI(pagination, '/student/applications', {});
    const paginationInfo = getPaginationInfo(pagination);

    res.render("student/my_applications", {
      email: req.session.user.email,
      applications: paginatedApplications,
      stats,
      pagination: paginationUI,
      paginationInfo
    });

  } catch (error) {
    res.status(500).send("Error loading applications");
  }
}

/**
 * View single application details
 */
async function viewApplicationDetails(req, res) {
  const applicationId = req.params.id;

  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    const applicationRef = doc(db, "applications", applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).send("Application not found");
    }

    const application = { id: applicationDoc.id, ...applicationDoc.data() };

    // Check ownership
    if (application.studentUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Get scholarship details
    const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);
    const scholarship = scholarshipDoc.exists()
      ? { id: scholarshipDoc.id, ...scholarshipDoc.data() }
      : null;

    res.render("student/application_details", {
      email: req.session.user.email,
      application,
      scholarship
    });

  } catch (error) {
    res.status(500).send("Error loading application");
  }
}

/**
 * Get student notifications
 */
async function getNotifications(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  try {
    const notifications = await getUserNotifications(req.session.user.uid);

    res.render("student/notifications", {
      email: req.session.user.email,
      notifications
    });

  } catch (error) {
    res.status(500).send("Error loading notifications");
  }
}

/**
 * Mark notification as read
 */
async function markNotificationRead(req, res) {
  const notificationId = req.params.id;

  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await markAsRead(notificationId, req.session.user.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsRead(req, res) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const count = await markAllAsRead(req.session.user.uid);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
}

/**
 * Get student profile
 */
async function getProfile(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const studentUid = req.session.user.uid;

  try {
    // Get user data
    const userRef = doc(db, "users", studentUid);
    const userDoc = await getDoc(userRef);
    const user = userDoc.exists() ? userDoc.data() : {};

    // Get assessment data
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);
    const assessment = assessmentDoc.exists() ? assessmentDoc.data() : null;

    // Pass Firebase config for credential linking (Google-only users)
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID
    };

    res.render("student/profile", {
      email: req.session.user.email,
      user,
      assessment,
      firebaseConfig
    });

  } catch (error) {
    res.status(500).send("Error loading profile");
  }
}

/**
 * Update student profile
 */
async function updateProfile(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;
  const { fullName } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: "Full name is required" });
  }

  try {
    const userRef = doc(db, "users", studentUid);
    await updateDoc(userRef, {
      fullName: fullName.trim(),
      updatedAt: new Date().toISOString()
    });

    // Update session
    req.session.user.fullName = fullName.trim();

    res.json({ success: true, message: "Profile updated successfully" });

  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
}

/**
 * Upload profile picture
 */
async function uploadAvatar(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Generate the URL path for the uploaded file
    const profilePictureUrl = `/uploads/${req.file.filename}`;

    const userRef = doc(db, "users", studentUid);
    await updateDoc(userRef, {
      profilePicture: profilePictureUrl,
      updatedAt: new Date().toISOString()
    });

    // Update session so sidebar updates immediately
    req.session.user.profilePicture = profilePictureUrl;

    res.json({ success: true, message: "Profile picture updated", url: profilePictureUrl });

  } catch (error) {
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
}

/**
 * Download scholarship deadline as iCal file
 */
async function downloadScholarshipCalendar(req, res) {
  const scholarshipId = req.params.id;

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = { id: scholarshipId, ...scholarshipDoc.data() };

    // Generate iCal content
    const icsContent = generateScholarshipICS(scholarship, {
      includeReminder: true,
      reminderDays: 3,
      portalUrl: `${req.protocol}://${req.get('host')}/student/scholarships/${scholarshipId}`
    });

    // Set headers for file download
    const filename = `${scholarship.scholarshipName.replace(/[^a-zA-Z0-9]/g, '_')}_deadline.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(icsContent);

  } catch (error) {
    res.status(500).json({ error: "Failed to generate calendar file" });
  }
}

module.exports = {
  showStudentDashboard,
  searchScholarships,
  viewScholarshipDetails,
  showApplyForm,
  getRecommendations,
  generateAndSaveRecommendations,
  getMyApplications,
  viewApplicationDetails,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProfile,
  updateProfile,
  uploadAvatar,
  downloadScholarshipCalendar
};
