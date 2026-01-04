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
const { getPaginationParams, paginateArray, buildPaginationUI, getPaginationInfo } = require("../utils/pagination");

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
    // Get counts for dashboard using parallel queries for better performance
    const usersRef = collection(db, "users");
    const scholarshipsRef = collection(db, "scholarships");
    const applicationsRef = collection(db, "applications");

    // Execute all independent queries in parallel
    const [
      usersSnapshot,
      scholarshipsSnapshot,
      applicationsSnapshot
    ] = await Promise.all([
      getDocs(usersRef),
      getDocs(scholarshipsRef),
      getDocs(applicationsRef)
    ]);

    // Process users by role
    let totalStudents = 0;
    let totalSponsors = 0;
    usersSnapshot.forEach(doc => {
      const role = doc.data().role;
      if (role === 'student') totalStudents++;
      else if (role === 'sponsor') totalSponsors++;
    });

    // Process scholarships by status
    let totalScholarships = 0;
    let pendingScholarships = 0;
    let openScholarships = 0;
    let closedScholarships = 0;
    scholarshipsSnapshot.forEach(doc => {
      totalScholarships++;
      const status = doc.data().status;
      if (status === 'Pending') pendingScholarships++;
      else if (status === 'Open') openScholarships++;
      else if (status === 'Closed') closedScholarships++;
    });

    // Process applications by status
    let totalApplications = 0;
    let acceptedApplications = 0;
    let notifiedApplications = 0;
    let notSelectedApplications = 0;
    let pendingApplications = 0;
    applicationsSnapshot.forEach(doc => {
      totalApplications++;
      const status = doc.data().status;
      if (status === 'accepted') acceptedApplications++;
      else if (status === 'notified') notifiedApplications++;
      else if (status === 'not_selected') notSelectedApplications++;
      else if (status === 'pending' || status === 'under_review') pendingApplications++;
    });

    // Get recent activity (last 5 actions)
    const recentActivity = [];

    // Add recent scholarship submissions
    const recentScholarships = [];
    scholarshipsSnapshot.forEach(doc => {
      recentScholarships.push({ id: doc.id, ...doc.data(), type: 'scholarship' });
    });
    recentScholarships
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3)
      .forEach(s => {
        recentActivity.push({
          title: `New Scholarship: ${s.scholarshipName}`,
          description: `Status: ${s.status}`,
          time: new Date(s.createdAt).toLocaleDateString()
        });
      });

    // Add recent applications
    const recentApps = [];
    applicationsSnapshot.forEach(doc => {
      recentApps.push({ id: doc.id, ...doc.data(), type: 'application' });
    });
    recentApps
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 2)
      .forEach(a => {
        recentActivity.push({
          title: `New Application`,
          description: `For: ${a.scholarshipName || 'Scholarship'}`,
          time: new Date(a.createdAt).toLocaleDateString()
        });
      });

    // Sort all activity by time
    recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.render("admin/admin_dashboard", {
      email: req.session.user.email,
      fullName: req.session.user.fullName || "Admin",
      profilePicture: req.session.user.profilePicture,
      stats: {
        totalStudents,
        totalSponsors,
        totalScholarships,
        pendingScholarships,
        openScholarships,
        closedScholarships,
        totalApplications,
        acceptedApplications,
        notifiedApplications,
        notSelectedApplications,
        pendingApplications
      },
      recentActivity: recentActivity.slice(0, 5)
    });

  } catch (error) {
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


    res.json({ success: true, message: "Scholarship approved successfully" });

  } catch (error) {
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


    res.json({ success: true, message: "Scholarship rejected" });

  } catch (error) {
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

  const { page, limit } = getPaginationParams(req.query, 15);
  const { tab } = req.query; // 'all', 'students', or 'sponsors'

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Separate by role
    const students = users.filter(u => u.role === "student");
    const sponsors = users.filter(u => u.role === "sponsor");
    const admins = users.filter(u => u.role === "admin");

    // Paginate based on active tab
    let activeList = users;
    let baseUrl = '/admin/users';
    if (tab === 'students') {
      activeList = students;
    } else if (tab === 'sponsors') {
      activeList = sponsors;
    }

    const { data: paginatedUsers, pagination } = paginateArray(activeList, page, limit);
    const paginationUI = buildPaginationUI(pagination, baseUrl, tab ? { tab } : {});
    const paginationInfo = getPaginationInfo(pagination);

    res.render("admin/manage_users", {
      email: req.session.user.email,
      users: tab ? paginatedUsers : users,
      students: tab === 'students' ? paginatedUsers : students,
      sponsors: tab === 'sponsors' ? paginatedUsers : sponsors,
      admins,
      stats: {
        total: users.length,
        students: students.length,
        sponsors: sponsors.length,
        admins: admins.length
      },
      pagination: paginationUI,
      paginationInfo,
      activeTab: tab || 'all'
    });

  } catch (error) {
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


    res.json({
      success: true,
      message: `User ${newStatus ? "suspended" : "reactivated"} successfully`
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to update user status" });
  }
}

/**
 * Bulk action on multiple users (suspend/activate)
 */
async function bulkUserAction(req, res) {
  const { userIds, action } = req.body;

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "No users specified" });
  }

  if (!action || !["suspend", "activate"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const newStatus = action === "suspend";
    let successCount = 0;
    let failCount = 0;

    // Process each user
    for (const userId of userIds) {
      try {
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          failCount++;
          continue;
        }

        const user = userDoc.data();

        // Skip admins
        if (user.role === "admin") {
          failCount++;
          continue;
        }

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

        successCount++;
      } catch (err) {
        failCount++;
      }
    }


    res.json({
      success: true,
      message: `${successCount} user(s) ${action === "suspend" ? "suspended" : "activated"} successfully${failCount > 0 ? `, ${failCount} failed` : ""}`
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to perform bulk action" });
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


    res.json({
      success: true,
      message: `Notification sent to ${count} users`
    });

  } catch (error) {
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


    res.json({ success: true, message: `Application ${status} successfully` });

  } catch (error) {
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
  bulkUserAction,
  getAllApplications,
  getSystemAnalytics,
  sendSystemNotification,
  getManageScholarships,
  updateApplicationStatus
};
