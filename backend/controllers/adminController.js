/**
 * Admin Controller
 * Handles all admin-related operations
 */

const { db } = require("../config/firebaseConfig");
const {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  orderBy
} = require("firebase/firestore");
const { createNotification, sendNotificationToRole } = require("../services/notificationService");

// Middleware to check admin role
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }
  next();
}

/**
 * Admin Dashboard
 */
async function showAdminDashboard(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    // Get counts for dashboard
    const usersRef = collection(db, "users");
    const scholarshipsRef = collection(db, "scholarships");
    const applicationsRef = collection(db, "applications");

    // Count students
    const studentsQuery = query(usersRef, where("role", "==", "student"));
    const studentsSnapshot = await getDocs(studentsQuery);
    const totalStudents = studentsSnapshot.size;

    // Count sponsors
    const sponsorsQuery = query(usersRef, where("role", "==", "sponsor"));
    const sponsorsSnapshot = await getDocs(sponsorsQuery);
    const totalSponsors = sponsorsSnapshot.size;

    // Count scholarships
    const scholarshipsSnapshot = await getDocs(scholarshipsRef);
    const totalScholarships = scholarshipsSnapshot.size;

    // Count pending scholarships
    const pendingQuery = query(scholarshipsRef, where("status", "==", "Pending"));
    const pendingSnapshot = await getDocs(pendingQuery);
    const pendingScholarships = pendingSnapshot.size;

    // Count applications
    const applicationsSnapshot = await getDocs(applicationsRef);
    const totalApplications = applicationsSnapshot.size;

    // Count approved applications
    const approvedQuery = query(applicationsRef, where("status", "==", "approved"));
    const approvedSnapshot = await getDocs(approvedQuery);
    const approvedApplications = approvedSnapshot.size;

    res.render("admin/admin_dashboard", {
      email: req.session.user.email,
      stats: {
        totalStudents,
        totalSponsors,
        totalScholarships,
        pendingScholarships,
        totalApplications,
        approvedApplications
      }
    });

  } catch (error) {
    console.error("L Error loading admin dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
}

/**
 * Get all pending scholarships for approval
 */
async function getPendingScholarships(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const scholarshipsRef = collection(db, "scholarships");
    // Use only where clause to avoid composite index requirement
    const q = query(
      scholarshipsRef,
      where("status", "==", "Pending")
    );
    const snapshot = await getDocs(q);

    const scholarships = [];
    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt in JavaScript (descending)
    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("admin/pending_scholarships", {
      email: req.session.user.email,
      scholarships
    });

  } catch (error) {
    console.error("L Error getting pending scholarships:", error);
    res.status(500).send("Error loading scholarships");
  }
}

/**
 * Get all approved/active scholarships
 */
async function getApprovedScholarships(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const scholarshipsRef = collection(db, "scholarships");
    // Use only where clause to avoid composite index requirement
    const q = query(
      scholarshipsRef,
      where("status", "in", ["Open", "Closed"])
    );
    const snapshot = await getDocs(q);

    const scholarships = [];
    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt in JavaScript (descending)
    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("admin/approved_scholarships", {
      email: req.session.user.email,
      scholarships
    });

  } catch (error) {
    console.error("L Error getting approved scholarships:", error);
    res.status(500).send("Error loading scholarships");
  }
}

/**
 * Get all scholarships (admin view)
 */
async function getAllScholarships(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const scholarshipsRef = collection(db, "scholarships");
    const q = query(scholarshipsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const scholarships = [];
    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    // Calculate stats
    const stats = {
      total: scholarships.length,
      open: scholarships.filter(s => s.status === "Open").length,
      closed: scholarships.filter(s => s.status === "Closed").length,
      pending: scholarships.filter(s => s.status === "Pending").length
    };

    res.render("admin/all_scholarships", {
      email: req.session.user.email,
      scholarships,
      stats
    });

  } catch (error) {
    console.error("L Error getting all scholarships:", error);
    res.status(500).send("Error loading scholarships");
  }
}

/**
 * Approve a scholarship
 */
async function approveScholarship(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    await updateDoc(scholarshipRef, {
      status: "Open",
      approvedAt: new Date().toISOString(),
      approvedBy: req.session.user.email,
      updatedAt: new Date().toISOString()
    });

    // Notify sponsor
    await createNotification(
      scholarship.sponsorUid,
      "scholarship_approved",
      "Scholarship Approved!",
      `Your scholarship "${scholarship.scholarshipName}" has been approved and is now open for applications.`,
      scholarshipId
    );

    // Notify all students about new scholarship
    await sendNotificationToRole(
      "student",
      "scholarship_new",
      "New Scholarship Available!",
      `A new scholarship "${scholarship.scholarshipName}" is now available. Check it out!`
    );

    console.log(` Scholarship ${scholarshipId} approved`);

    res.json({ success: true, message: "Scholarship approved successfully" });

  } catch (error) {
    console.error("L Error approving scholarship:", error);
    res.status(500).json({ error: "Failed to approve scholarship" });
  }
}

/**
 * Reject a scholarship
 */
async function rejectScholarship(req, res) {
  const scholarshipId = req.params.id;
  const { reason } = req.body;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    await updateDoc(scholarshipRef, {
      status: "Rejected",
      rejectionReason: reason || "Does not meet our guidelines",
      rejectedAt: new Date().toISOString(),
      rejectedBy: req.session.user.email,
      updatedAt: new Date().toISOString()
    });

    // Notify sponsor
    await createNotification(
      scholarship.sponsorUid,
      "scholarship_update",
      "Scholarship Not Approved",
      `Your scholarship "${scholarship.scholarshipName}" was not approved. Reason: ${reason || "Does not meet our guidelines"}`,
      scholarshipId
    );

    console.log(`L Scholarship ${scholarshipId} rejected`);

    res.json({ success: true, message: "Scholarship rejected" });

  } catch (error) {
    console.error("L Error rejecting scholarship:", error);
    res.status(500).json({ error: "Failed to reject scholarship" });
  }
}

/**
 * Get scholarship details (admin view)
 */
async function getScholarshipDetails(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    // Get applications for this scholarship
    const applicationsRef = collection(db, "applications");
    const q = query(applicationsRef, where("scholarshipId", "==", scholarshipId));
    const applicationsSnapshot = await getDocs(q);

    const applications = [];
    applicationsSnapshot.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    res.render("admin/scholarship_details", {
      email: req.session.user.email,
      scholarship,
      applications
    });

  } catch (error) {
    console.error("L Error getting scholarship details:", error);
    res.status(500).send("Error loading scholarship details");
  }
}

/**
 * Get all users
 */
async function getAllUsers(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });

    // Separate by role
    const students = users.filter(u => u.role === "student");
    const sponsors = users.filter(u => u.role === "sponsor");
    const admins = users.filter(u => u.role === "admin");

    res.render("admin/manage_users", {
      email: req.session.user.email,
      users,
      students,
      sponsors,
      admins,
      stats: {
        total: users.length,
        students: students.length,
        sponsors: sponsors.length,
        admins: admins.length
      }
    });

  } catch (error) {
    console.error("L Error getting users:", error);
    res.status(500).send("Error loading users");
  }
}

/**
 * Get user details
 */
async function getUserDetails(req, res) {
  const userId = req.params.id;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).send("User not found");
    }

    const user = { id: userDoc.id, ...userDoc.data() };

    // Get additional data based on role
    let additionalData = {};

    if (user.role === "student") {
      // Get assessment
      const assessmentRef = doc(db, "users", userId, "assessment", "main");
      const assessmentDoc = await getDoc(assessmentRef);
      if (assessmentDoc.exists()) {
        additionalData.assessment = assessmentDoc.data();
      }

      // Get applications
      const applicationsRef = collection(db, "applications");
      const q = query(applicationsRef, where("studentUid", "==", userId));
      const applicationsSnapshot = await getDocs(q);
      additionalData.applications = [];
      applicationsSnapshot.forEach(doc => {
        additionalData.applications.push({ id: doc.id, ...doc.data() });
      });
    }

    if (user.role === "sponsor") {
      // Get scholarships
      const scholarshipsRef = collection(db, "scholarships");
      const q = query(scholarshipsRef, where("sponsorUid", "==", userId));
      const scholarshipsSnapshot = await getDocs(q);
      additionalData.scholarships = [];
      scholarshipsSnapshot.forEach(doc => {
        additionalData.scholarships.push({ id: doc.id, ...doc.data() });
      });
    }

    res.render("admin/user_details", {
      email: req.session.user.email,
      user,
      ...additionalData
    });

  } catch (error) {
    console.error("L Error getting user details:", error);
    res.status(500).send("Error loading user details");
  }
}

/**
 * Suspend/Unsuspend a user
 */
async function toggleUserStatus(req, res) {
  const userId = req.params.id;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userDoc.data();
    const newStatus = user.suspended ? false : true;

    await updateDoc(userRef, {
      suspended: newStatus,
      updatedAt: new Date().toISOString()
    });

    // Notify user
    await createNotification(
      userId,
      "system",
      newStatus ? "Account Suspended" : "Account Reactivated",
      newStatus
        ? "Your account has been suspended. Please contact support for more information."
        : "Your account has been reactivated. You can now access all features.",
      null
    );

    console.log(` User ${userId} ${newStatus ? "suspended" : "reactivated"}`);

    res.json({
      success: true,
      message: `User ${newStatus ? "suspended" : "reactivated"} successfully`
    });

  } catch (error) {
    console.error("L Error toggling user status:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
}

/**
 * Get all applications (admin view)
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

    res.render("admin/review_applications", {
      email: req.session.user.email,
      applications,
      stats
    });

  } catch (error) {
    console.error("L Error getting all applications:", error);
    res.status(500).send("Error loading applications");
  }
}

/**
 * Generate system reports
 */
async function getSystemAnalytics(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    // Get all data for reports
    const usersRef = collection(db, "users");
    const scholarshipsRef = collection(db, "scholarships");
    const applicationsRef = collection(db, "applications");

    const usersSnapshot = await getDocs(usersRef);
    const scholarshipsSnapshot = await getDocs(scholarshipsRef);
    const applicationsSnapshot = await getDocs(applicationsRef);

    const users = [];
    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

    const scholarships = [];
    scholarshipsSnapshot.forEach(doc => scholarships.push({ id: doc.id, ...doc.data() }));

    const applications = [];
    applicationsSnapshot.forEach(doc => applications.push({ id: doc.id, ...doc.data() }));

    // Calculate analytics
    const analytics = {
      users: {
        total: users.length,
        students: users.filter(u => u.role === "student").length,
        sponsors: users.filter(u => u.role === "sponsor").length,
        admins: users.filter(u => u.role === "admin").length,
        newThisMonth: users.filter(u => {
          const created = new Date(u.createdAt);
          const now = new Date();
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length
      },
      scholarships: {
        total: scholarships.length,
        open: scholarships.filter(s => s.status === "Open").length,
        closed: scholarships.filter(s => s.status === "Closed").length,
        pending: scholarships.filter(s => s.status === "Pending").length,
        totalSlots: scholarships.reduce((sum, s) => sum + (s.slotsAvailable || 0), 0),
        filledSlots: scholarships.reduce((sum, s) => sum + (s.slotsFilled || 0), 0)
      },
      applications: {
        total: applications.length,
        pending: applications.filter(a => a.status === "pending").length,
        underReview: applications.filter(a => a.status === "under_review").length,
        approved: applications.filter(a => a.status === "approved").length,
        rejected: applications.filter(a => a.status === "rejected").length,
        approvalRate: applications.length > 0
          ? Math.round((applications.filter(a => a.status === "approved").length / applications.length) * 100)
          : 0
      },
      // Scholarship types distribution
      scholarshipTypes: scholarships.reduce((acc, s) => {
        acc[s.scholarshipType] = (acc[s.scholarshipType] || 0) + 1;
        return acc;
      }, {})
    };

    res.render("admin/reports", {
      email: req.session.user.email,
      analytics,
      scholarships,
      applications
    });

  } catch (error) {
    console.error("L Error generating analytics:", error);
    res.status(500).send("Error generating analytics");
  }
}

/**
 * Send system notification
 */
async function sendSystemNotification(req, res) {
  const { targetRole, title, message } = req.body;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!title || !message) {
    return res.status(400).json({ error: "Title and message are required" });
  }

  try {
    let count = 0;

    if (targetRole === "all") {
      // Send to all users
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      for (const docSnapshot of snapshot.docs) {
        await createNotification(docSnapshot.id, "system", title, message);
        count++;
      }
    } else {
      // Send to specific role
      count = await sendNotificationToRole(targetRole, "system", title, message);
    }

    console.log(`=� System notification sent to ${count} users`);

    res.json({
      success: true,
      message: `Notification sent to ${count} users`
    });

  } catch (error) {
    console.error("L Error sending system notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
}

/**
 * Get manage scholarships page (combines pending, approved, all)
 */
async function getManageScholarships(req, res) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  try {
    const scholarshipsRef = collection(db, "scholarships");
    const snapshot = await getDocs(scholarshipsRef);

    const scholarships = [];
    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Separate pending scholarships
    const pendingScholarships = scholarships.filter(s => s.status === "Pending");

    // Calculate stats
    const stats = {
      total: scholarships.length,
      open: scholarships.filter(s => s.status === "Open").length,
      closed: scholarships.filter(s => s.status === "Closed").length,
      pending: pendingScholarships.length
    };

    res.render("admin/manage_scholarships", {
      email: req.session.user.email,
      scholarships,
      pendingScholarships,
      stats
    });

  } catch (error) {
    console.error("L Error getting scholarships:", error);
    res.status(500).send("Error loading scholarships");
  }
}

/**
 * Update application status (approve/reject)
 */
async function updateApplicationStatus(req, res) {
  const applicationId = req.params.id;
  const { status } = req.body;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const applicationRef = doc(db, "applications", applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: "Application not found" });
    }

    const application = applicationDoc.data();

    await updateDoc(applicationRef, {
      status,
      updatedAt: new Date().toISOString(),
      reviewedBy: req.session.user.email
    });

    // Notify student
    await createNotification(
      application.studentUid,
      status === "approved" ? "application_approved" : "application_rejected",
      status === "approved" ? "Application Approved!" : "Application Update",
      status === "approved"
        ? `Congratulations! Your application for "${application.scholarshipName}" has been approved.`
        : `Your application for "${application.scholarshipName}" was not approved. Please check other opportunities.`,
      applicationId
    );

    console.log(`Application ${applicationId} ${status}`);

    res.json({ success: true, message: `Application ${status} successfully` });

  } catch (error) {
    console.error("L Error updating application status:", error);
    res.status(500).json({ error: "Failed to update application" });
  }
}

module.exports = {
  isAdmin,
  showAdminDashboard,
  getPendingScholarships,
  getApprovedScholarships,
  getAllScholarships,
  approveScholarship,
  rejectScholarship,
  getScholarshipDetails,
  getAllUsers,
  getUserDetails,
  toggleUserStatus,
  getAllApplications,
  getSystemAnalytics,
  sendSystemNotification,
  getManageScholarships,
  updateApplicationStatus
};
