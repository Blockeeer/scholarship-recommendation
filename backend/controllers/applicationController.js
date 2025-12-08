/**
 * Application Controller
 * Handles scholarship applications for students
 */

const { db } = require("../config/firebaseConfig");
const {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  orderBy,
  serverTimestamp
} = require("firebase/firestore");
const { rankApplicantsForScholarship } = require("../services/gptMatchingService");

/**
 * Create a new application
 */
async function createApplication(req, res) {
  console.log("=� Creating new application...");

  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;
  const { scholarshipId, applicationLetter } = req.body;

  if (!scholarshipId) {
    return res.status(400).json({ error: "Scholarship ID is required" });
  }

  try {
    // Check if scholarship exists and is open
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    if (scholarship.status !== "Open") {
      return res.status(400).json({ error: "This scholarship is no longer accepting applications" });
    }

    // Check if slots are available
    if ((scholarship.slotsFilled || 0) >= scholarship.slotsAvailable) {
      return res.status(400).json({ error: "No slots available for this scholarship" });
    }

    // Check if student already applied
    const applicationsRef = collection(db, "applications");
    const existingQuery = query(
      applicationsRef,
      where("studentUid", "==", studentUid),
      where("scholarshipId", "==", scholarshipId)
    );
    const existingApps = await getDocs(existingQuery);

    if (!existingApps.empty) {
      return res.status(400).json({ error: "You have already applied for this scholarship" });
    }

    // Get student's assessment data
    const assessmentRef = doc(db, "users", studentUid, "assessment", "main");
    const assessmentDoc = await getDoc(assessmentRef);

    if (!assessmentDoc.exists()) {
      return res.status(400).json({ error: "Please complete your assessment before applying" });
    }

    const assessment = assessmentDoc.data();

    // Get student user data
    const userRef = doc(db, "users", studentUid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    // Create the application
    const applicationData = {
      studentUid,
      studentEmail: req.session.user.email,
      studentName: assessment.fullName || userData.fullName,
      scholarshipId,
      scholarshipName: scholarship.scholarshipName,
      sponsorUid: scholarship.sponsorUid,
      sponsorName: scholarship.sponsorName,
      // Student details from assessment
      course: assessment.course,
      yearLevel: assessment.yearLevel,
      gpa: assessment.gpa,
      incomeRange: assessment.incomeRange,
      skills: assessment.skills,
      involvement: assessment.involvement,
      applicationLetter: applicationLetter || assessment.essayReason,
      // Application status
      status: "pending", // pending, under_review, approved, rejected
      matchScore: null, // Will be calculated by GPT
      rankScore: null,
      rank: null,
      sponsorNotes: "",
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedAt: null
    };

    const newAppRef = await addDoc(applicationsRef, applicationData);

    console.log(` Application created: ${newAppRef.id}`);

    // Return success
    res.status(201).json({
      success: true,
      message: "Application submitted successfully!",
      applicationId: newAppRef.id
    });

  } catch (error) {
    console.error("L Error creating application:", error);
    res.status(500).json({ error: "Failed to submit application: " + error.message });
  }
}

/**
 * Get all applications for a student
 */
async function getStudentApplications(req, res) {
  console.log("=� Getting student applications...");

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

    res.render("student/my_applications", {
      email: req.session.user.email,
      applications
    });

  } catch (error) {
    console.error("L Error getting student applications:", error);
    res.status(500).send("Error loading applications");
  }
}

/**
 * Get application details for a student
 */
async function getApplicationDetails(req, res) {
  const applicationId = req.params.id;

  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const applicationRef = doc(db, "applications", applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).send("Application not found");
    }

    const application = { id: applicationDoc.id, ...applicationDoc.data() };

    // Get scholarship details first (needed for sponsor authorization)
    const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);
    const scholarship = scholarshipDoc.exists() ? { id: scholarshipDoc.id, ...scholarshipDoc.data() } : null;

    // Check authorization
    if (req.session.user.role === "student" && application.studentUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // For sponsor, check if they own the scholarship this application is for
    if (req.session.user.role === "sponsor") {
      if (!scholarship || scholarship.sponsorUid !== req.session.user.uid) {
        return res.status(403).send("Unauthorized");
      }
    }

    // Render appropriate view based on role
    if (req.session.user.role === "student") {
      res.render("student/application_details", {
        email: req.session.user.email,
        application,
        scholarship
      });
    } else if (req.session.user.role === "sponsor") {
      res.render("sponsor/application_review", {
        email: req.session.user.email,
        application,
        scholarship
      });
    } else if (req.session.user.role === "admin") {
      res.render("admin/application_review", {
        email: req.session.user.email,
        application,
        scholarship
      });
    }

  } catch (error) {
    console.error("L Error getting application details:", error);
    res.status(500).send("Error loading application details");
  }
}

/**
 * Get all applications for a scholarship (for sponsors)
 */
async function getScholarshipApplications(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    // Get scholarship details
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    // Check ownership
    if (scholarship.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Get applications - use only where clause to avoid composite index requirement
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId)
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
      pending: applications.filter(a => a.status === "pending").length,
      underReview: applications.filter(a => a.status === "under_review").length,
      approved: applications.filter(a => a.status === "approved").length,
      rejected: applications.filter(a => a.status === "rejected").length
    };

    // Calculate stats for sponsor view
    const sponsorStats = {
      total: applications.length,
      pending: applications.filter(a => a.status === "pending").length,
      underReview: applications.filter(a => a.status === "under_review").length,
      accepted: applications.filter(a => a.status === "accepted").length,
      notified: applications.filter(a => a.status === "notified").length,
      notSelected: applications.filter(a => a.status === "not_selected").length
    };

    res.render("sponsor/applications_list", {
      email: req.session.user.email,
      scholarship,
      applications,
      stats: sponsorStats
    });

  } catch (error) {
    console.error("L Error getting scholarship applications:", error);
    res.status(500).send("Error loading applications");
  }
}

/**
 * Rank applications using GPT
 */
async function rankApplications(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get scholarship details
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    // Check ownership
    if (scholarship.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get pending/under_review applications
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId),
      where("status", "in", ["pending", "under_review"])
    );
    const snapshot = await getDocs(q);

    const applications = [];
    snapshot.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    if (applications.length === 0) {
      return res.json({ success: true, message: "No applications to rank", rankings: [] });
    }

    // Use GPT to rank applications
    const rankings = await rankApplicantsForScholarship(applications, scholarship);

    // Update applications with rank scores
    for (const ranking of rankings) {
      const appRef = doc(db, "applications", ranking.applicationId);
      await updateDoc(appRef, {
        rankScore: ranking.rankScore,
        rank: ranking.rank,
        status: "under_review",
        scoreBreakdown: ranking.scoreBreakdown,
        strengths: ranking.strengths,
        weaknesses: ranking.weaknesses,
        recommendation: ranking.recommendation,
        updatedAt: new Date().toISOString()
      });
    }

    console.log(` Ranked ${rankings.length} applications for scholarship ${scholarshipId}`);

    res.json({
      success: true,
      message: `Successfully ranked ${rankings.length} applications`,
      rankings
    });

  } catch (error) {
    console.error("L Error ranking applications:", error);
    res.status(500).json({ error: "Failed to rank applications: " + error.message });
  }
}

/**
 * Update application status (approve/reject)
 */
async function updateApplicationStatus(req, res) {
  const applicationId = req.params.id;
  const { status, notes } = req.body;

  if (!req.session.user || !["sponsor", "admin"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Valid statuses: pending, under_review, accepted (sponsor), notified (admin confirmed), not_selected
  if (!["accepted", "under_review", "pending", "notified", "not_selected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const applicationRef = doc(db, "applications", applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: "Application not found" });
    }

    const application = applicationDoc.data();

    // Check authorization for sponsors
    if (req.session.user.role === "sponsor" && application.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update application
    const updateData = {
      status,
      sponsorNotes: notes || application.sponsorNotes,
      updatedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.session.user.email
    };

    // If sponsor accepts, record acceptance details (no slot limit check - sponsor decides)
    if (status === "accepted" && req.session.user.role === "sponsor") {
      updateData.acceptedBySponsor = true;
      updateData.acceptedAt = new Date().toISOString();
    }

    // If admin notifies student of acceptance
    if (status === "notified" && req.session.user.role === "admin") {
      updateData.notifiedAt = new Date().toISOString();
      updateData.notifiedBy = req.session.user.email;

      // Update scholarship slots when admin confirms
      const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
      const scholarshipDoc = await getDoc(scholarshipRef);
      if (scholarshipDoc.exists()) {
        const scholarship = scholarshipDoc.data();
        await updateDoc(scholarshipRef, {
          slotsFilled: (scholarship.slotsFilled || 0) + 1,
          updatedAt: new Date().toISOString()
        });
      }

      // Notify student of approval
      const notificationData = {
        userId: application.studentUid,
        type: "application_approved",
        title: "Congratulations! You've Been Selected!",
        message: `Great news! You have been selected for the scholarship "${application.scholarshipName}". Check your applications for more details.`,
        relatedId: applicationId,
        read: false,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, "notifications"), notificationData);
    }

    // If admin marks as not selected
    if (status === "not_selected" && req.session.user.role === "admin") {
      updateData.notSelectedAt = new Date().toISOString();

      // Notify student they were not chosen
      const notificationData = {
        userId: application.studentUid,
        type: "application_not_selected",
        title: "Application Update",
        message: `Unfortunately, you were not selected for the scholarship "${application.scholarshipName}". Don't give up - keep applying to other scholarships!`,
        relatedId: applicationId,
        read: false,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, "notifications"), notificationData);
    }

    await updateDoc(applicationRef, updateData);

    console.log(` Application ${applicationId} updated to ${status}`);

    res.json({
      success: true,
      message: `Application ${status} successfully`
    });

  } catch (error) {
    console.error("L Error updating application:", error);
    res.status(500).json({ error: "Failed to update application: " + error.message });
  }
}

/**
 * Withdraw an application (student)
 */
async function withdrawApplication(req, res) {
  const applicationId = req.params.id;

  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const applicationRef = doc(db, "applications", applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: "Application not found" });
    }

    const application = applicationDoc.data();

    // Check ownership
    if (application.studentUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Can only withdraw pending or under_review applications
    if (!["pending", "under_review"].includes(application.status)) {
      return res.status(400).json({ error: "Cannot withdraw this application" });
    }

    // Delete the application
    await deleteDoc(applicationRef);

    console.log(` Application ${applicationId} withdrawn`);

    res.json({
      success: true,
      message: "Application withdrawn successfully"
    });

  } catch (error) {
    console.error("L Error withdrawing application:", error);
    res.status(500).json({ error: "Failed to withdraw application: " + error.message });
  }
}

/**
 * Get all applications (admin)
 */
async function getAllApplications(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const applicationsRef = collection(db, "applications");
    const q = query(applicationsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const applications = [];
    snapshot.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    // Calculate stats
    const stats = {
      total: applications.length,
      pending: applications.filter(a => a.status === "pending").length,
      underReview: applications.filter(a => a.status === "under_review").length,
      approved: applications.filter(a => a.status === "approved").length,
      rejected: applications.filter(a => a.status === "rejected").length
    };

    res.render("admin/all_applications", {
      email: req.session.user.email,
      applications,
      stats
    });

  } catch (error) {
    console.error("L Error getting all applications:", error);
    res.status(500).send("Error loading applications");
  }
}

module.exports = {
  createApplication,
  getStudentApplications,
  getApplicationDetails,
  getScholarshipApplications,
  rankApplications,
  updateApplicationStatus,
  withdrawApplication,
  getAllApplications
};
