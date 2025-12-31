const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireSponsor } = require('../middleware/auth');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg files are allowed!'));
    }
  }
});
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

// Apply requireSponsor middleware to all routes
router.use(requireSponsor);

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
  // Already protected by router.use(requireSponsor)

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
  // Already protected by router.use(requireSponsor)
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
  // Already protected by router.use(requireSponsor)
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
  // Already protected by router.use(requireSponsor)
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

    // Use batched queries for scholarshipIds (Firestore 'in' supports max 30 items)
    if (scholarshipIds.length > 0) {
      const applicationsRef = collection(db, 'applications');

      // Process in batches of 30 (Firestore 'in' limit)
      const batchSize = 30;
      for (let i = 0; i < scholarshipIds.length; i += batchSize) {
        const batch = scholarshipIds.slice(i, i + batchSize);
        const appQuery = query(applicationsRef, where('scholarshipId', 'in', batch));
        const batchSnapshot = await getDocs(appQuery);

        batchSnapshot.forEach(doc => {
          const app = doc.data();
          applicationStats.total++;
          if (app.status === 'pending' || app.status === 'under_review') applicationStats.pending++;
          else if (app.status === 'approved') applicationStats.approved++;
          else if (app.status === 'rejected') applicationStats.rejected++;
        });
      }
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
  // Already protected by router.use(requireSponsor)
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
  // Already protected by router.use(requireSponsor)
  try {
    await markAsRead(req.params.id, req.session.user.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  // Already protected by router.use(requireSponsor)
  try {
    const count = await markAllAsRead(req.session.user.uid);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// API endpoint for sidebar counts
router.get('/api/counts', async (req, res) => {
  // Already protected by router.use(requireSponsor)
  try {
    const unreadNotifications = await getUnreadCount(req.session.user.uid);
    res.json({ unreadNotifications });
  } catch (error) {
    res.json({ unreadNotifications: 0 });
  }
});

// Profile page
router.get('/profile', async (req, res) => {
  // Already protected by router.use(requireSponsor)
  const sponsorUid = req.session.user.uid;

  try {
    // Get sponsor's user document
    const userRef = doc(db, 'users', sponsorUid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.exists() ? userDoc.data() : {};

    // Get sponsor's scholarships count
    const scholarshipsRef = collection(db, 'scholarships');
    const scholarshipQuery = query(scholarshipsRef, where('sponsorUid', '==', sponsorUid));
    const scholarshipSnapshot = await getDocs(scholarshipQuery);

    let totalScholarships = scholarshipSnapshot.size;
    let totalApplications = 0;

    // Get scholarship IDs for application count
    const scholarshipIds = [];
    scholarshipSnapshot.forEach(doc => {
      scholarshipIds.push(doc.id);
    });

    // Count applications for sponsor's scholarships using efficient batched queries
    if (scholarshipIds.length > 0) {
      const applicationsRef = collection(db, 'applications');

      // Process in batches of 30 (Firestore 'in' limit)
      const batchSize = 30;
      for (let i = 0; i < scholarshipIds.length; i += batchSize) {
        const batch = scholarshipIds.slice(i, i + batchSize);
        const appQuery = query(applicationsRef, where('scholarshipId', 'in', batch));
        const batchSnapshot = await getDocs(appQuery);
        totalApplications += batchSnapshot.size;
      }
    }

    // Pass Firebase config for credential linking (Google-only users)
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID
    };

    res.render('sponsor/profile', {
      email: req.session.user.email,
      user: {
        fullName: req.session.user.fullName || userData.fullName || '',
        authProvider: userData.authProvider || 'email',
        emailVerified: userData.emailVerified || false,
        createdAt: userData.createdAt || null,
        profilePicture: userData.profilePicture || null
      },
      stats: {
        totalScholarships,
        totalApplications
      },
      firebaseConfig
    });
  } catch (error) {
    console.error('Error loading sponsor profile:', error);
    res.render('sponsor/profile', {
      email: req.session.user.email,
      user: {
        fullName: req.session.user.fullName || '',
        authProvider: 'email',
        emailVerified: false,
        createdAt: null,
        profilePicture: null
      },
      stats: {
        totalScholarships: 0,
        totalApplications: 0
      },
      firebaseConfig: {}
    });
  }
});

// Update profile
router.post('/profile/update', async (req, res) => {
  const sponsorUid = req.session.user.uid;
  const { fullName } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  try {
    const userRef = doc(db, 'users', sponsorUid);
    await updateDoc(userRef, {
      fullName: fullName.trim(),
      updatedAt: new Date().toISOString()
    });

    // Update session
    req.session.user.fullName = fullName.trim();

    console.log('Profile updated for sponsor:', sponsorUid);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar
router.post('/profile/avatar', avatarUpload.single('profilePicture'), async (req, res) => {
  const sponsorUid = req.session.user.uid;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const profilePictureUrl = `/uploads/${req.file.filename}`;

    const userRef = doc(db, 'users', sponsorUid);
    await updateDoc(userRef, {
      profilePicture: profilePictureUrl,
      updatedAt: new Date().toISOString()
    });

    // Update session so sidebar updates immediately
    req.session.user.profilePicture = profilePictureUrl;

    console.log('Profile picture updated for sponsor:', sponsorUid);
    res.json({ success: true, message: 'Profile picture updated', url: profilePictureUrl });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

module.exports = router;