/**
 * Student Controller
 * Handles student-related operations (search, apply, recommendations, etc.)
 */

const { db } = require("../config/firebaseConfig");
const {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where
} = require("firebase/firestore");
const { matchStudentToScholarships } = require("../services/gptMatchingService");
const { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead } = require("../services/notificationService");

/**
 * Show student dashboard
 */
async function showStudentDashboard(req, res) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/login");
  }

  const studentUid = req.session.user.uid;

  try {
    // Get student's assessment status
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);
    const hasAssessment = assessmentDoc.exists();

    // Get application counts
    const applicationsRef = collection(db, "applications");
    const appQuery = query(applicationsRef, where("studentUid", "==", studentUid));
    const appSnapshot = await getDocs(appQuery);

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

    // Get available scholarships count
    const scholarshipsRef = collection(db, "scholarships");
    const scholarshipQuery = query(scholarshipsRef, where("status", "==", "Open"));
    const scholarshipSnapshot = await getDocs(scholarshipQuery);
    const availableScholarships = scholarshipSnapshot.size;

    // Get unread notifications count
    const unreadCount = await getUnreadCount(studentUid);

    res.render("student/student_dashboard", {
      email: req.session.user.email,
      hasAssessment,
      applicationStats,
      availableScholarships,
      unreadNotifications: unreadCount
    });

  } catch (error) {
    console.error("❌ Error loading student dashboard:", error);
    res.render("student/student_dashboard", {
      email: req.session.user.email,
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

    res.render("student/search_scholarships", {
      email: req.session.user.email,
      scholarships,
      filters: { type, course, minGPA, search },
      scholarshipTypes,
      courses
    });

  } catch (error) {
    console.error("❌ Error searching scholarships:", error);
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
    console.error("❌ Error viewing scholarship:", error);
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
    console.error("❌ Error showing apply form:", error);
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
    console.error("❌ Error getting recommendations:", error);
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

    // Get GPT recommendations
    const recommendations = await matchStudentToScholarships(assessment, scholarships);

    // Save recommendations to database
    const recommendationsRef = doc(db, "users", studentUid, "recommendations", "main");
    await setDoc(recommendationsRef, {
      recommendations: recommendations,
      generatedAt: new Date().toISOString(),
      assessmentSnapshot: {
        gpa: assessment.gpa,
        course: assessment.course,
        yearLevel: assessment.yearLevel
      }
    });

    console.log(`✅ Saved ${recommendations.length} recommendations for student ${studentUid}`);

    res.json({
      success: true,
      count: recommendations.length,
      message: `Generated ${recommendations.length} scholarship recommendations.`
    });

  } catch (error) {
    console.error("❌ Error generating recommendations:", error);
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

    // Calculate stats
    const stats = {
      total: applications.length,
      pending: applications.filter(a => a.status === "pending" || a.status === "under_review" || a.status === "accepted").length,
      notified: applications.filter(a => a.status === "notified").length,
      notSelected: applications.filter(a => a.status === "not_selected").length
    };

    res.render("student/my_applications", {
      email: req.session.user.email,
      applications,
      stats
    });

  } catch (error) {
    console.error("❌ Error getting applications:", error);
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
    console.error("❌ Error viewing application:", error);
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
    console.error("❌ Error getting notifications:", error);
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
    console.error("❌ Error marking notification read:", error);
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
    console.error("❌ Error marking all notifications read:", error);
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

    res.render("student/profile", {
      email: req.session.user.email,
      user,
      assessment
    });

  } catch (error) {
    console.error("❌ Error loading profile:", error);
    res.status(500).send("Error loading profile");
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
  getProfile
};
