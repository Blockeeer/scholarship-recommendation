const { db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc } = require("firebase/firestore");
const { createNotification } = require("../services/notificationService");
const { validateGPA, validateDateRange, validateSlots, validateIncome, SCHOLARSHIP_TYPES } = require("../utils/constants");

// Show form to add scholarship offer
function showAddScholarshipForm(req, res) {
  
  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  res.render("sponsor/add_scholarship", {
    layout: "layouts/sponsor_layout",
    email: req.session.user.email
  });
}

// Submit new scholarship offer
async function addScholarshipOffer(req, res) {

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const sponsorUid = req.session.user.uid;
  const sponsorEmail = req.session.user.email;

  const {
    scholarshipName,
    organizationName,
    scholarshipType,
    description,
    minGPA,
    eligibleCourses,
    eligibleYearLevels,
    incomeLimit,
    requiredSkills,
    requiredDocuments,
    additionalDocuments,
    slotsAvailable,
    startDate,
    endDate,
    status,
    isDraft
  } = req.body;

  // Check if saving as draft
  const savingAsDraft = isDraft === 'true';

  // Validate required fields (skip for drafts)
  if (!savingAsDraft) {
    if (!scholarshipName || !organizationName || !scholarshipType || !minGPA || !slotsAvailable || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: "Please fill in all required fields" });
    }
  } else {
    // For drafts, only require scholarship name
    if (!scholarshipName) {
      return res.status(400).json({ success: false, error: "Scholarship name is required" });
    }
  }

  // Skip validation for drafts
  if (!savingAsDraft) {
    // Validate GPA
    const gpaValidation = validateGPA(minGPA);
    if (!gpaValidation.valid) {
      return res.status(400).json({ success: false, error: gpaValidation.error });
    }

    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
      return res.status(400).json({ success: false, error: dateValidation.error });
    }

    // Validate slots
    const slotsValidation = validateSlots(slotsAvailable);
    if (!slotsValidation.valid) {
      return res.status(400).json({ success: false, error: slotsValidation.error });
    }

    // Validate income limit if provided
    if (incomeLimit && incomeLimit.trim()) {
      const incomeNum = parseFloat(incomeLimit);
      if (!isNaN(incomeNum)) {
        const incomeValidation = validateIncome(incomeNum);
        if (!incomeValidation.valid) {
          return res.status(400).json({ success: false, error: incomeValidation.error });
        }
      }
    }
  }

  // Helper function to normalize arrays (checkboxes send arrays, old form sent comma strings)
  const normalizeToArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => v.trim());
    if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(v => v);
    return [];
  };

  try {
    // Get sponsor's full name from users collection
    const sponsorDocRef = doc(db, "users", sponsorUid);
    const sponsorDoc = await getDoc(sponsorDocRef);
    const sponsorData = sponsorDoc.exists() ? sponsorDoc.data() : {};

    // Create scholarship data
    const scholarshipData = {
      // Scholarship Information
      scholarshipName: scholarshipName.trim(),
      organizationName: organizationName.trim(),
      scholarshipType: scholarshipType.trim(),
      description: description ? description.trim() : "",

      // Qualification Criteria
      minGPA: parseFloat(minGPA),
      eligibleCourses: normalizeToArray(eligibleCourses),
      eligibleYearLevels: normalizeToArray(eligibleYearLevels),
      incomeLimit: incomeLimit ? incomeLimit.trim() : "",
      requiredSkills: normalizeToArray(requiredSkills),

      // Document Requirements
      requiredDocuments: normalizeToArray(requiredDocuments),
      additionalDocuments: additionalDocuments ? additionalDocuments.trim() : "",

      // Scholarship Capacity
      slotsAvailable: parseInt(slotsAvailable),
      slotsFilled: 0,

      // Duration
      startDate: startDate,
      endDate: endDate,

      // Status - "Draft" if saving as draft, otherwise "Pending" for admin review
      status: savingAsDraft ? "Draft" : "Pending",
      isDraft: savingAsDraft,

      // Sponsor Information
      sponsorUid: sponsorUid,
      sponsorEmail: sponsorEmail,
      sponsorName: sponsorData.fullName || organizationName,

      // Metadata
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };


    // Add to scholarships collection
    const scholarshipsRef = collection(db, "scholarships");
    const docRef = await addDoc(scholarshipsRef, scholarshipData);


    // Only notify admin if not a draft
    if (!savingAsDraft) {
      await createNotification(
        'admin',
        'new_scholarship',
        'New Scholarship Submitted for Review',
        `"${scholarshipName}" by ${organizationName} is awaiting your review.`,
        docRef.id
      );
    } else {
    }

    return res.redirect("/sponsor/offers");
  } catch (err) {
    res.status(500).send("Error adding scholarship: " + err.message);
  }
}

// View all scholarship offers by sponsor
async function viewScholarshipOffers(req, res) {

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const sponsorUid = req.session.user.uid;

  try {
    // Query scholarships by sponsor UID
    const scholarshipsRef = collection(db, "scholarships");
    const q = query(scholarshipsRef, where("sponsorUid", "==", sponsorUid));
    const querySnapshot = await getDocs(q);

    const scholarships = [];
    querySnapshot.forEach((doc) => {
      scholarships.push({
        id: doc.id,
        ...doc.data()
      });
    });


    res.render("sponsor/view_offers", {
      layout: "layouts/sponsor_layout",
      email: req.session.user.email,
      scholarships: scholarships
    });
  } catch (err) {
    res.status(500).send("Error loading scholarships");
  }
}

// View single scholarship details
async function viewScholarshipDetails(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check if this sponsor owns this scholarship
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    res.render("sponsor/scholarship_details", {
      layout: "layouts/sponsor_layout",
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    res.status(500).send("Error loading scholarship");
  }
}

// Update scholarship status (Open/Closed)
async function updateScholarshipStatus(req, res) {
  const scholarshipId = req.params.id;
  const { status } = req.body;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // If trying to reopen (change from Closed to Open), require admin approval
    if (scholarshipData.status === 'Closed' && status === 'Open') {
      // Set status to Pending Reopen and notify admin
      await updateDoc(scholarshipRef, {
        status: 'Pending Reopen',
        reopenRequested: true,
        reopenRequestedAt: new Date().toISOString(),
        previousStatus: scholarshipData.status,
        updatedAt: new Date().toISOString()
      });

      // Notify admin about reopen request
      await createNotification(
        'admin',
        'reopen_request',
        'Scholarship Reopen Request',
        `"${scholarshipData.scholarshipName}" by ${scholarshipData.organizationName} is requesting to be reopened for applications.`,
        scholarshipId
      );

      return res.redirect("/sponsor/offers");
    }

    // Sponsor can close their own scholarship directly
    await updateDoc(scholarshipRef, {
      status: status,
      updatedAt: new Date().toISOString()
    });

    res.redirect("/sponsor/offers");
  } catch (err) {
    res.status(500).send("Error updating scholarship");
  }
}

// Delete scholarship (soft delete - archives instead of permanent deletion)
async function deleteScholarship(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Notify admin if the scholarship was approved/open
    if (scholarshipData.status === 'Open' || scholarshipData.status === 'Approved') {
      await createNotification(
        'admin',
        'scholarship_deleted',
        'Scholarship Archived by Sponsor',
        `"${scholarshipData.scholarshipName}" by ${scholarshipData.organizationName} has been archived by the sponsor.`,
        null
      );
    }

    // Soft delete: update status to Archived instead of deleting
    await updateDoc(scholarshipRef, {
      status: 'Archived',
      isArchived: true,
      archivedAt: new Date().toISOString(),
      previousStatus: scholarshipData.status,
      updatedAt: new Date().toISOString()
    });

    res.redirect("/sponsor/offers");
  } catch (err) {
    res.status(500).send("Error archiving scholarship");
  }
}

// Restore archived scholarship
async function restoreScholarship(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Only archived scholarships can be restored
    if (scholarshipData.status !== 'Archived') {
      return res.status(400).json({ error: "Only archived scholarships can be restored" });
    }

    // Restore to previous status or Draft if no previous status
    const restoredStatus = scholarshipData.previousStatus || 'Draft';

    await updateDoc(scholarshipRef, {
      status: restoredStatus,
      isArchived: false,
      archivedAt: null,
      previousStatus: null,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: "Scholarship restored successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error restoring scholarship" });
  }
}

// Permanently delete scholarship (for archived scholarships only)
async function permanentlyDeleteScholarship(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Only archived scholarships can be permanently deleted
    if (scholarshipData.status !== 'Archived') {
      return res.status(400).json({ error: "Only archived scholarships can be permanently deleted" });
    }

    await deleteDoc(scholarshipRef);

    res.json({ success: true, message: "Scholarship permanently deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting scholarship" });
  }
}

// Show edit scholarship form
async function showEditScholarshipForm(req, res) {
  const scholarshipId = req.params.id;


  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    res.render("sponsor/edit_scholarship", {
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    res.status(500).send("Error loading scholarship");
  }
}

// Update scholarship (full update)
async function updateScholarship(req, res) {
  const scholarshipId = req.params.id;


  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const {
    scholarshipName,
    organizationName,
    scholarshipType,
    minGPA,
    eligibleCourses,
    eligibleYearLevels,
    incomeLimit,
    requiredSkills,
    requiredDocuments,
    slotsAvailable,
    startDate,
    endDate,
    status
  } = req.body;

  // Validate required fields
  if (!scholarshipName || !organizationName || !scholarshipType || !minGPA || !slotsAvailable || !startDate || !endDate) {
    return res.status(400).send("Please fill in all required fields");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const existingData = scholarshipDoc.data();

    // Check ownership
    if (existingData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Create updated scholarship data
    const updatedScholarshipData = {
      // Scholarship Information
      scholarshipName: scholarshipName.trim(),
      organizationName: organizationName.trim(),
      scholarshipType: scholarshipType.trim(),

      // Qualification Criteria
      minGPA: parseFloat(minGPA),
      eligibleCourses: eligibleCourses ? eligibleCourses.split(',').map(c => c.trim()) : [],
      eligibleYearLevels: eligibleYearLevels ? eligibleYearLevels.split(',').map(y => y.trim()) : [],
      incomeLimit: incomeLimit ? incomeLimit.trim() : "",
      requiredSkills: requiredSkills ? requiredSkills.split(',').map(s => s.trim()) : [],

      // Document Requirements
      requiredDocuments: requiredDocuments ? requiredDocuments.split(',').map(d => d.trim()) : [],

      // Scholarship Capacity
      slotsAvailable: parseInt(slotsAvailable),
      // Keep existing slotsFilled
      slotsFilled: existingData.slotsFilled || 0,

      // Duration
      startDate: startDate,
      endDate: endDate,

      // Status
      status: status || "Open",

      // Metadata
      updatedAt: new Date().toISOString()
    };


    // Update the document
    await updateDoc(scholarshipRef, updatedScholarshipData);


    return res.redirect("/sponsor/offers");
  } catch (err) {
    res.status(500).send("Error updating scholarship: " + err.message);
  }
}

// View applications for a scholarship
async function viewScholarshipApplications(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // TODO: Fetch actual applications from database
    // For now, render with sample data (the UI will show hardcoded samples)

    res.render("sponsor/applications_list", {
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    res.status(500).send("Error loading applications");
  }
}

/**
 * Create announcement for a scholarship
 * Sponsor can send announcements to: all applicants, approved/grantees only
 */
async function createAnnouncement(req, res) {
  const scholarshipId = req.params.id;
  const { title, message, audience, examDate, examTime, examLocation } = req.body;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!title || !message || !audience) {
    return res.status(400).json({ error: "Title, message, and audience are required" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get applications based on audience
    const applicationsRef = collection(db, "applications");

    // Get all applications for this scholarship first
    const allAppsQuery = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const allAppsSnapshot = await getDocs(allAppsQuery);

    // Filter applications based on audience
    const filteredApps = [];
    allAppsSnapshot.forEach((doc) => {
      const app = doc.data();
      if (audience === 'all') {
        // All applicants except draft and withdrawn
        if (app.status && !['draft', 'withdrawn'].includes(app.status)) {
          filteredApps.push({ id: doc.id, ...app });
        }
      } else if (audience === 'grantees') {
        // Only enrolled/accepted/notified/approved students
        if (app.status && ['enrolled', 'accepted', 'notified', 'approved'].includes(app.status)) {
          filteredApps.push({ id: doc.id, ...app });
        }
      }
    });

    if (audience !== 'all' && audience !== 'grantees') {
      return res.status(400).json({ error: "Invalid audience. Must be 'all' or 'grantees'" });
    }

    if (filteredApps.length === 0) {
      return res.status(400).json({ error: "No students found for the selected audience" });
    }

    // Count recipients
    const recipientCount = filteredApps.length;

    // Create announcement record
    const announcementData = {
      scholarshipId,
      scholarshipName: scholarship.scholarshipName,
      sponsorUid: req.session.user.uid,
      sponsorName: scholarship.organizationName,
      title,
      message,
      audience,
      examDate: examDate || null,
      examTime: examTime || null,
      examLocation: examLocation || null,
      isExamSchedule: !!(examDate && examTime),
      recipientCount,
      createdAt: new Date().toISOString()
    };

    const announcementRef = await addDoc(collection(db, "announcements"), announcementData);

    // Send notifications to all targeted students
    let notificationCount = 0;
    const notificationPromises = [];

    filteredApps.forEach((application) => {
      let notificationTitle = title;
      let notificationMessage = message;

      // If this is an exam schedule, format the notification
      if (examDate && examTime) {
        notificationTitle = `Exam Scheduled: ${scholarship.scholarshipName}`;
        notificationMessage = `${message}\n\nExam Date: ${examDate}\nTime: ${examTime}${examLocation ? `\nLocation: ${examLocation}` : ''}`;
      }

      const notificationData = {
        userId: application.studentUid,
        type: examDate ? "exam_scheduled" : "sponsor_announcement",
        title: notificationTitle,
        message: notificationMessage,
        relatedId: announcementRef.id,
        scholarshipId: scholarshipId,
        scholarshipName: scholarship.scholarshipName,
        read: false,
        createdAt: new Date().toISOString()
      };

      notificationPromises.push(addDoc(collection(db, "notifications"), notificationData));
      notificationCount++;
    });

    await Promise.all(notificationPromises);

    res.json({
      success: true,
      message: `Announcement sent to ${notificationCount} student(s)`,
      announcementId: announcementRef.id
    });

  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: "Failed to create announcement" });
  }
}

/**
 * Get announcements for a scholarship
 */
async function getScholarshipAnnouncements(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get announcements for this scholarship
    const announcementsRef = collection(db, "announcements");
    const announcementsQuery = query(
      announcementsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const snapshot = await getDocs(announcementsQuery);

    const announcements = [];
    snapshot.forEach((doc) => {
      announcements.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    announcements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, announcements });

  } catch (error) {
    console.error('Error getting announcements:', error);
    res.status(500).json({ error: "Failed to get announcements" });
  }
}

/**
 * Get grantees report for a scholarship
 * Shows all approved/enrolled students with their detailed information
 */
async function getGranteesReport(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
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

    // Get all grantees (enrolled, accepted, approved) for this scholarship
    const applicationsRef = collection(db, "applications");
    const appsQuery = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const appsSnapshot = await getDocs(appsQuery);

    const grantees = [];
    const studentUids = [];

    appsSnapshot.forEach((doc) => {
      const app = doc.data();
      // Only include enrolled, accepted, notified, or approved students
      if (app.status && ['enrolled', 'accepted', 'notified', 'approved'].includes(app.status)) {
        grantees.push({ id: doc.id, ...app });
        if (app.studentUid) {
          studentUids.push(app.studentUid);
        }
      }
    });

    // Get assessment data for each student to get additional details
    const assessmentsRef = collection(db, "assessments");
    const assessmentMap = {};

    // Process student UIDs in batches of 30 (Firestore limit)
    if (studentUids.length > 0) {
      const batchSize = 30;
      for (let i = 0; i < studentUids.length; i += batchSize) {
        const batch = studentUids.slice(i, i + batchSize);
        const assessQuery = query(assessmentsRef, where("userId", "in", batch));
        const assessSnapshot = await getDocs(assessQuery);
        assessSnapshot.forEach((doc) => {
          const assessment = doc.data();
          assessmentMap[assessment.userId] = assessment;
        });
      }
    }

    // Combine application data with assessment data
    const granteesWithDetails = grantees.map((grantee, index) => {
      const assessment = assessmentMap[grantee.studentUid] || {};

      return {
        rowNumber: index + 1,
        fullName: assessment.fullName || grantee.studentName || 'N/A',
        age: assessment.age || 'N/A',
        gender: assessment.gender || 'N/A',
        course: grantee.course || assessment.course || 'N/A',
        yearLevel: grantee.yearLevel || assessment.yearLevel || 'N/A',
        gpa: grantee.gpa || assessment.gpa || 'N/A',
        incomeRange: grantee.incomeRange || assessment.incomeRange || 'N/A',
        scholarshipType: assessment.scholarshipType || 'N/A',
        skills: grantee.skills || assessment.skills || [],
        involvement: grantee.involvement || assessment.involvement || [],
        status: grantee.status,
        appliedAt: grantee.createdAt,
        matchScore: grantee.matchScore || grantee.rankScore || 'N/A'
      };
    });

    res.render("sponsor/grantees_report", {
      email: req.session.user.email,
      scholarship,
      grantees: granteesWithDetails,
      totalGrantees: granteesWithDetails.length
    });

  } catch (error) {
    console.error('Error getting grantees report:', error);
    res.status(500).send("Error loading grantees report");
  }
}

/**
 * Export grantees report as CSV
 */
async function exportGranteesReport(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: "Scholarship not found" });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== req.session.user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get all grantees for this scholarship
    const applicationsRef = collection(db, "applications");
    const appsQuery = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const appsSnapshot = await getDocs(appsQuery);

    const grantees = [];
    const studentUids = [];

    appsSnapshot.forEach((doc) => {
      const app = doc.data();
      if (app.status && ['enrolled', 'accepted', 'notified', 'approved'].includes(app.status)) {
        grantees.push({ id: doc.id, ...app });
        if (app.studentUid) {
          studentUids.push(app.studentUid);
        }
      }
    });

    // Get assessment data
    const assessmentsRef = collection(db, "assessments");
    const assessmentMap = {};

    if (studentUids.length > 0) {
      const batchSize = 30;
      for (let i = 0; i < studentUids.length; i += batchSize) {
        const batch = studentUids.slice(i, i + batchSize);
        const assessQuery = query(assessmentsRef, where("userId", "in", batch));
        const assessSnapshot = await getDocs(assessQuery);
        assessSnapshot.forEach((doc) => {
          const assessment = doc.data();
          assessmentMap[assessment.userId] = assessment;
        });
      }
    }

    // Build CSV
    const csvHeaders = [
      '#',
      'Full Name',
      'Age',
      'Gender',
      'Course/Program',
      'Year Level',
      'GPA/GWA',
      'Financial Information',
      'Preferred Scholarship Type',
      'Skills & Qualities',
      'Status',
      'Date Applied'
    ];

    const csvRows = grantees.map((grantee, index) => {
      const assessment = assessmentMap[grantee.studentUid] || {};
      const skills = grantee.skills || assessment.skills || [];
      const involvement = grantee.involvement || assessment.involvement || [];
      const allSkills = [...(Array.isArray(skills) ? skills : []), ...(Array.isArray(involvement) ? involvement : [])];

      // Format date applied
      const dateApplied = grantee.createdAt
        ? new Date(grantee.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'N/A';

      return [
        index + 1,
        `"${(assessment.fullName || grantee.studentName || 'N/A').replace(/"/g, '""')}"`,
        assessment.age || 'N/A',
        assessment.gender || 'N/A',
        `"${(grantee.course || assessment.course || 'N/A').replace(/"/g, '""')}"`,
        grantee.yearLevel || assessment.yearLevel || 'N/A',
        grantee.gpa || assessment.gpa || 'N/A',
        `"${(grantee.incomeRange || assessment.incomeRange || 'N/A').replace(/"/g, '""')}"`,
        assessment.scholarshipType || 'N/A',
        `"${allSkills.join(', ').replace(/"/g, '""')}"`,
        grantee.status,
        dateApplied
      ];
    });

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Set headers for CSV download
    const filename = `grantees_report_${scholarship.scholarshipName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting grantees report:', error);
    res.status(500).json({ error: "Failed to export report" });
  }
}

/**
 * Show announcement page for a scholarship
 */
async function showAnnouncementPage(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
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

    // Get application counts for display
    const applicationsRef = collection(db, "applications");

    // Count all applicants (get all and filter in memory to avoid not-in index issues)
    const allAppsQuery = query(
      applicationsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const allAppsSnapshot = await getDocs(allAppsQuery);

    let allApplicantsCount = 0;
    let granteesCount = 0;

    allAppsSnapshot.forEach((doc) => {
      const app = doc.data();
      // Count all except draft and withdrawn
      if (app.status && !['draft', 'withdrawn'].includes(app.status)) {
        allApplicantsCount++;
      }
      // Count grantees (enrolled, accepted, notified)
      if (app.status && ['enrolled', 'accepted', 'notified', 'approved'].includes(app.status)) {
        granteesCount++;
      }
    });

    // Get existing announcements
    const announcementsRef = collection(db, "announcements");
    const announcementsQuery = query(
      announcementsRef,
      where("scholarshipId", "==", scholarshipId)
    );
    const announcementsSnapshot = await getDocs(announcementsQuery);
    const announcements = [];
    announcementsSnapshot.forEach((doc) => {
      announcements.push({ id: doc.id, ...doc.data() });
    });
    announcements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("sponsor/announcements", {
      email: req.session.user.email,
      scholarship,
      allApplicantsCount,
      granteesCount,
      announcements
    });

  } catch (error) {
    console.error('Error loading announcement page:', error);
    res.status(500).send("Error loading announcement page");
  }
}

module.exports = {
  showAddScholarshipForm,
  addScholarshipOffer,
  viewScholarshipOffers,
  viewScholarshipDetails,
  updateScholarshipStatus,
  deleteScholarship,
  restoreScholarship,
  permanentlyDeleteScholarship,
  showEditScholarshipForm,
  updateScholarship,
  viewScholarshipApplications,
  createAnnouncement,
  getScholarshipAnnouncements,
  showAnnouncementPage,
  getGranteesReport,
  exportGranteesReport
};