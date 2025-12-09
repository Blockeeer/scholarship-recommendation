const express = require('express');
const router = express.Router();
const {
  showAddScholarshipForm,
  addScholarshipOffer,
  viewScholarshipOffers,
  viewScholarshipDetails,
  updateScholarshipStatus,
  deleteScholarship,
  showEditScholarshipForm,
  updateScholarship
} = require('../controllers/scholarshipController');
const {
  getScholarshipApplications,
  getApplicationDetails,
  rankApplications,
  updateApplicationStatus
} = require('../controllers/applicationController');
const { getUserNotifications, markAsRead, markAllAsRead, getUnreadCount, createNotification } = require('../services/notificationService');
const { db } = require('../config/firebaseConfig');
const { collection, query, where, getDocs, doc, getDoc, updateDoc } = require('firebase/firestore');

// Show form to add scholarship
router.get('/add-offer', showAddScholarshipForm);

// Submit new scholarship
router.post('/add-offer', addScholarshipOffer);

// View all scholarship offers
router.get('/offers', viewScholarshipOffers);

// View single scholarship details
router.get('/offers/:id', viewScholarshipDetails);

// View applications for a scholarship
router.get('/offers/:id/applications', getScholarshipApplications);

// Rank applications using GPT
router.post('/offers/:id/applications/rank', rankApplications);

// View single application
router.get('/applications/:id', getApplicationDetails);

// Update application status (approve/reject)
router.post('/applications/:id/status', updateApplicationStatus);

// Show edit scholarship form
router.get('/offers/:id/edit', showEditScholarshipForm);

// Update scholarship (full update)
router.post('/offers/:id/edit', updateScholarship);

// Update scholarship status
router.post('/offers/:id/status', updateScholarshipStatus);

// Delete scholarship
router.post('/offers/:id/delete', deleteScholarship);

// Save exam schedule for scholarship
router.post('/offers/:id/exam-schedule', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const scholarshipId = req.params.id;
  const { date, time, venue, notes } = req.body;
  const sponsorUid = req.session.user.uid;

  try {
    const scholarshipRef = doc(db, 'scholarships', scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== sponsorUid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update scholarship with exam schedule
    await updateDoc(scholarshipRef, {
      examSchedule: {
        date,
        time,
        venue,
        notes: notes || '',
        updatedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Exam schedule saved for scholarship ${scholarshipId}`);

    res.json({ success: true, message: 'Exam schedule saved successfully' });
  } catch (error) {
    console.error('Error saving exam schedule:', error);
    res.status(500).json({ error: 'Failed to save exam schedule' });
  }
});

// Request to close scholarship (sponsor requests admin to close)
router.post('/offers/:id/request-close', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const scholarshipId = req.params.id;
  const { reason } = req.body;
  const sponsorUid = req.session.user.uid;

  try {
    const scholarshipRef = doc(db, 'scholarships', scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== sponsorUid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update scholarship with close request
    await updateDoc(scholarshipRef, {
      closeRequested: true,
      closeRequestReason: reason,
      closeRequestedAt: new Date().toISOString()
    });

    // Notify admin about close request
    await createNotification(
      'admin',
      'close_request',
      'Scholarship Close Request',
      `Sponsor requested to close "${scholarship.scholarshipName}". Reason: ${reason}`,
      scholarshipId
    );

    res.json({ success: true, message: 'Close request submitted' });
  } catch (error) {
    console.error('Error requesting close:', error);
    res.status(500).json({ error: 'Failed to submit close request' });
  }
});

// Resubmit rejected scholarship for review
router.post('/offers/:id/resubmit', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const scholarshipId = req.params.id;
  const sponsorUid = req.session.user.uid;

  try {
    const scholarshipRef = doc(db, 'scholarships', scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    // Check ownership
    if (scholarship.sponsorUid !== sponsorUid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Only rejected scholarships can be resubmitted
    if (scholarship.status !== 'Rejected') {
      return res.status(400).json({ error: 'Only rejected scholarships can be resubmitted' });
    }

    // Update status to Pending
    await updateDoc(scholarshipRef, {
      status: 'Pending',
      rejectionReason: null,
      resubmittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Notify admin about resubmission
    await createNotification(
      'admin',
      'scholarship_resubmit',
      'Scholarship Resubmitted for Review',
      `"${scholarship.scholarshipName}" by ${scholarship.organizationName} has been resubmitted for review.`,
      scholarshipId
    );

    res.json({ success: true, message: 'Scholarship resubmitted for review' });
  } catch (error) {
    console.error('Error resubmitting scholarship:', error);
    res.status(500).json({ error: 'Failed to resubmit scholarship' });
  }
});

// Sponsor Dashboard with real data
router.get('/dashboard', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.redirect('/login');
  }

  const sponsorUid = req.session.user.uid;

  try {
    // Get sponsor's scholarships
    const scholarshipsRef = collection(db, 'scholarships');
    const scholarshipQuery = query(scholarshipsRef, where('sponsorUid', '==', sponsorUid));
    const scholarshipSnapshot = await getDocs(scholarshipQuery);

    let scholarshipStats = {
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      totalSlots: 0,
      filledSlots: 0
    };

    const scholarshipIds = [];
    scholarshipSnapshot.forEach(doc => {
      const data = doc.data();
      scholarshipIds.push(doc.id);
      scholarshipStats.total++;
      if (data.status === 'Open') scholarshipStats.open++;
      else if (data.status === 'Pending') scholarshipStats.pending++;
      else if (data.status === 'Closed') scholarshipStats.closed++;
      scholarshipStats.totalSlots += data.slotsAvailable || 0;
      scholarshipStats.filledSlots += data.slotsFilled || 0;
    });

    // Get applications for sponsor's scholarships
    let applicationStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    if (scholarshipIds.length > 0) {
      const applicationsRef = collection(db, 'applications');
      const applicationsSnapshot = await getDocs(applicationsRef);

      applicationsSnapshot.forEach(doc => {
        const app = doc.data();
        if (scholarshipIds.includes(app.scholarshipId)) {
          applicationStats.total++;
          if (app.status === 'pending' || app.status === 'under_review') applicationStats.pending++;
          else if (app.status === 'approved') applicationStats.approved++;
          else if (app.status === 'rejected') applicationStats.rejected++;
        }
      });
    }

    // Get unread notifications
    const unreadNotifications = await getUnreadCount(sponsorUid);

    res.render('sponsor/sponsor_dashboard', {
      email: req.session.user.email,
      fullName: req.session.user.fullName || "",
      scholarshipStats,
      applicationStats,
      unreadNotifications
    });

  } catch (error) {
    console.error('Error loading sponsor dashboard:', error);
    res.render('sponsor/sponsor_dashboard', {
      email: req.session.user.email,
      fullName: req.session.user.fullName || "",
      scholarshipStats: { total: 0, open: 0, pending: 0, closed: 0, totalSlots: 0, filledSlots: 0 },
      applicationStats: { total: 0, pending: 0, approved: 0, rejected: 0 },
      unreadNotifications: 0
    });
  }
});

// Notifications for sponsor
router.get('/notifications', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.redirect('/login');
  }
  try {
    const notifications = await getUserNotifications(req.session.user.uid);
    res.render('sponsor/notifications', {
      email: req.session.user.email,
      notifications
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).send('Error loading notifications');
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await markAsRead(req.params.id, req.session.user.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const count = await markAllAsRead(req.session.user.uid);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// API endpoint for sidebar counts
router.get('/api/counts', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'sponsor') {
    return res.json({ unreadNotifications: 0 });
  }
  try {
    const unreadNotifications = await getUnreadCount(req.session.user.uid);
    res.json({ unreadNotifications });
  } catch (error) {
    res.json({ unreadNotifications: 0 });
  }
});

module.exports = router;