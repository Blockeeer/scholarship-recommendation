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

  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;
  const { scholarshipId, applicationLetter, saveAsDraft } = req.body;

  if (!scholarshipId) {
    return res.status(400).json({ error: "Scholarship ID is required" });
  }

  const isDraft = saveAsDraft === true || saveAsDraft === 'true';

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

    // Check if slots are available (only for non-draft submissions)
    if (!isDraft && (scholarship.slotsFilled || 0) >= scholarship.slotsAvailable) {
      return res.status(400).json({ error: "No slots available for this scholarship" });
    }

    // Check if student already has an application (draft or submitted) for this scholarship
    const applicationsRef = collection(db, "applications");
    const existingQuery = query(
      applicationsRef,
      where("studentUid", "==", studentUid),
      where("scholarshipId", "==", scholarshipId)
    );
    const existingApps = await getDocs(existingQuery);

    if (!existingApps.empty) {
      const existingApp = existingApps.docs[0];
      const existingData = existingApp.data();

      // If existing is a draft, allow updating it
      if (existingData.status === "draft") {
        // Update the existing draft
        await updateDoc(doc(db, "applications", existingApp.id), {
          applicationLetter: applicationLetter || existingData.applicationLetter,
          status: isDraft ? "draft" : "pending",
          updatedAt: new Date().toISOString(),
          submittedAt: isDraft ? null : new Date().toISOString()
        });


        return res.status(200).json({
          success: true,
          message: isDraft ? "Draft saved successfully!" : "Application submitted successfully!",
          applicationId: existingApp.id,
          isDraft
        });
      }

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

    // Build document URLs from assessment files
    const assessmentFiles = assessment.files || {};
    const documents = {
      grades: assessmentFiles.grades ? `/uploads/${assessmentFiles.grades}` : null,
      coe: assessmentFiles.coe ? `/uploads/${assessmentFiles.coe}` : null,
      schoolId: assessmentFiles.schoolId ? `/uploads/${assessmentFiles.schoolId}` : null,
      otherDocuments: assessmentFiles.otherDocuments ? assessmentFiles.otherDocuments.map(f => `/uploads/${f}`) : []
    };

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
      // Documents from assessment
      documents: documents,
      // Application status - draft or pending
      status: isDraft ? "draft" : "pending",
      matchScore: null, // Will be calculated by GPT
      rankScore: null,
      rank: null,
      sponsorNotes: "",
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: isDraft ? null : new Date().toISOString(),
      reviewedAt: null
    };

    const newAppRef = await addDoc(applicationsRef, applicationData);


    // Return success
    res.status(201).json({
      success: true,
      message: isDraft ? "Draft saved successfully!" : "Application submitted successfully!",
      applicationId: newAppRef.id,
      isDraft
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to submit application: " + error.message });
  }
}

/**
 * Get all applications for a student
 */
async function getStudentApplications(req, res) {

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
      const appData = doc.data();
      // Skip draft applications
      if (appData.status !== 'draft') {
        applications.push({ id: doc.id, ...appData });
      }
    });

    // Separate accepted/notified from pending/under_review for ranking
    const acceptedApps = applications.filter(a => ['accepted', 'notified', 'not_selected'].includes(a.status));
    const pendingApps = applications.filter(a => ['pending', 'under_review'].includes(a.status));

    // Sort pending applications by rankScore (highest first), then by createdAt
    pendingApps.sort((a, b) => {
      const scoreA = a.rankScore || a.matchScore || 0;
      const scoreB = b.rankScore || b.matchScore || 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Reassign ranks to pending applications (1, 2, 3, ...) based on sorted order
    pendingApps.forEach((app, index) => {
      if (app.rankScore || app.matchScore) {
        app.rank = index + 1;
      }
    });

    // Sort accepted apps by acceptance date
    acceptedApps.sort((a, b) => {
      const dateA = a.acceptedAt || a.updatedAt || a.createdAt;
      const dateB = b.acceptedAt || b.updatedAt || b.createdAt;
      return new Date(dateB) - new Date(dateA);
    });

    // Combine: pending apps first (ranked), then accepted apps
    const sortedApplications = [...pendingApps, ...acceptedApps];

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
      applications: sortedApplications,
      stats: sponsorStats
    });

  } catch (error) {
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


    res.json({
      success: true,
      message: `Successfully ranked ${rankings.length} applications`,
      rankings
    });

  } catch (error) {
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

    // If sponsor accepts, check slot availability and update slots
    if (status === "accepted" && req.session.user.role === "sponsor") {
      // Get scholarship to check slot availability
      const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
      const scholarshipDoc = await getDoc(scholarshipRef);

      if (scholarshipDoc.exists()) {
        const scholarship = scholarshipDoc.data();
        const slotsFilled = scholarship.slotsFilled || 0;
        const slotsAvailable = scholarship.slotsAvailable || 0;

        // Check if slots are full
        if (slotsFilled >= slotsAvailable) {
          return res.status(400).json({
            error: "All scholarship slots are already filled. Cannot accept more students.",
            slotsFull: true
          });
        }

        // Increment slotsFilled when sponsor accepts
        await updateDoc(scholarshipRef, {
          slotsFilled: slotsFilled + 1,
          updatedAt: new Date().toISOString()
        });
      }

      updateData.acceptedBySponsor = true;
      updateData.acceptedAt = new Date().toISOString();
    }

    // If sponsor undos acceptance (from accepted back to under_review), decrement slots
    if (status === "under_review" && req.session.user.role === "sponsor" && application.status === "accepted") {
      const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
      const scholarshipDoc = await getDoc(scholarshipRef);

      if (scholarshipDoc.exists()) {
        const scholarship = scholarshipDoc.data();
        const currentFilled = scholarship.slotsFilled || 0;

        // Decrement slotsFilled (but don't go below 0)
        await updateDoc(scholarshipRef, {
          slotsFilled: Math.max(0, currentFilled - 1),
          updatedAt: new Date().toISOString()
        });
      }

      // Clear the accepted fields
      updateData.acceptedBySponsor = false;
      updateData.acceptedAt = null;
    }

    // If admin notifies student of acceptance
    if (status === "notified" && req.session.user.role === "admin") {
      updateData.notifiedAt = new Date().toISOString();
      updateData.notifiedBy = req.session.user.email;

      // Note: Slot count is already updated when sponsor accepts, no need to update again

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


    res.json({
      success: true,
      message: `Application ${status} successfully`
    });

  } catch (error) {
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


    res.json({
      success: true,
      message: "Application withdrawn successfully"
    });

  } catch (error) {
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
    res.status(500).send("Error loading applications");
  }
}

/**
 * Batch update application status (for sponsors)
 */
async function batchUpdateApplicationStatus(req, res) {

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sponsorUid = req.session.user.uid;
  const { applicationIds, status } = req.body;

  if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
    return res.status(400).json({ error: "No applications specified" });
  }

  if (!status || !["accepted", "not_selected", "under_review"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    let successCount = 0;
    let failCount = 0;
    let slotFullCount = 0;

    // Track scholarship slot updates to avoid multiple reads
    const scholarshipSlots = {};

    for (const applicationId of applicationIds) {
      try {
        const applicationRef = doc(db, "applications", applicationId);
        const applicationDoc = await getDoc(applicationRef);

        if (!applicationDoc.exists()) {
          failCount++;
          continue;
        }

        const application = applicationDoc.data();

        // Verify the application belongs to a scholarship owned by this sponsor
        if (application.sponsorUid !== sponsorUid) {
          failCount++;
          continue;
        }

        // Handle slot counting for accepting
        if (status === "accepted") {
          // Get or fetch scholarship slot info
          if (!scholarshipSlots[application.scholarshipId]) {
            const scholarshipRef = doc(db, "scholarships", application.scholarshipId);
            const scholarshipDoc = await getDoc(scholarshipRef);
            if (scholarshipDoc.exists()) {
              const scholarship = scholarshipDoc.data();
              scholarshipSlots[application.scholarshipId] = {
                ref: scholarshipRef,
                slotsFilled: scholarship.slotsFilled || 0,
                slotsAvailable: scholarship.slotsAvailable || 0
              };
            }
          }

          const slotInfo = scholarshipSlots[application.scholarshipId];
          if (slotInfo && slotInfo.slotsFilled >= slotInfo.slotsAvailable) {
            slotFullCount++;
            continue;
          }

          // Increment slot count
          if (slotInfo) {
            slotInfo.slotsFilled++;
            await updateDoc(slotInfo.ref, {
              slotsFilled: slotInfo.slotsFilled,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // Update application status
        const updateData = {
          status: status,
          statusUpdatedAt: new Date().toISOString(),
          statusUpdatedBy: "sponsor",
          updatedAt: new Date().toISOString()
        };

        if (status === "accepted") {
          updateData.acceptedBySponsor = true;
          updateData.acceptedAt = new Date().toISOString();
        }

        await updateDoc(applicationRef, updateData);

        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    let message = `${successCount} application(s) updated successfully`;
    if (failCount > 0) message += `, ${failCount} failed`;
    if (slotFullCount > 0) message += `, ${slotFullCount} skipped (slots full)`;

    res.json({
      success: true,
      message
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to update applications" });
  }
}

/**
 * Get draft application for a scholarship (if exists)
 */
async function getDraftApplication(req, res) {
  const scholarshipId = req.params.scholarshipId;

  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const studentUid = req.session.user.uid;

  try {
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef,
      where("studentUid", "==", studentUid),
      where("scholarshipId", "==", scholarshipId),
      where("status", "==", "draft")
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.json({ success: true, draft: null });
    }

    const draftDoc = snapshot.docs[0];
    const draft = { id: draftDoc.id, ...draftDoc.data() };

    res.json({ success: true, draft });

  } catch (error) {
    res.status(500).json({ error: "Failed to get draft" });
  }
}

/**
 * Delete draft application
 */
async function deleteDraftApplication(req, res) {
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

    // Can only delete drafts
    if (application.status !== "draft") {
      return res.status(400).json({ error: "Cannot delete submitted applications. Use withdraw instead." });
    }

    await deleteDoc(applicationRef);


    res.json({
      success: true,
      message: "Draft deleted successfully"
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to delete draft" });
  }
}

module.exports = {
  createApplication,
  getStudentApplications,
  getApplicationDetails,
  getScholarshipApplications,
  rankApplications,
  updateApplicationStatus,
  batchUpdateApplicationStatus,
  withdrawApplication,
  getAllApplications,
  getDraftApplication,
  deleteDraftApplication
};
