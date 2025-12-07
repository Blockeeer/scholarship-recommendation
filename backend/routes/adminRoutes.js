/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseConfig');
const { doc, getDoc, collection, getDocs } = require('firebase/firestore');
const {
  showAdminDashboard,
  getPendingScholarships,
  getApprovedScholarships,
  getAllScholarships,
  approveScholarship,
  rejectScholarship,
  getScholarshipDetails,
  getAllUsers,
  toggleUserStatus,
  getAllApplications,
  getSystemAnalytics,
  sendSystemNotification,
  getManageScholarships,
  updateApplicationStatus
} = require('../controllers/adminController');

// Dashboard
router.get('/dashboard', showAdminDashboard);

// Scholarship Management - Main page with tabs
router.get('/scholarships', getManageScholarships);
router.get('/scholarships/:id/details', async (req, res) => {
  // Return JSON for modal view
  try {
    const scholarshipRef = doc(db, 'scholarships', req.params.id);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    res.json({ scholarship: { id: scholarshipDoc.id, ...scholarshipDoc.data() } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load scholarship' });
  }
});
router.post('/scholarships/:id/approve', approveScholarship);
router.post('/scholarships/:id/reject', rejectScholarship);

// Application Management
router.get('/applications', getAllApplications);
router.post('/applications/:id/status', updateApplicationStatus);

// User Management
router.get('/users', getAllUsers);
router.get('/users/:id/details', async (req, res) => {
  // Return JSON for modal view
  try {
    const userRef = doc(db, 'users', req.params.id);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = { id: userDoc.id, ...userDoc.data() };
    let assessment = null;

    if (user.role === 'student') {
      const assessmentRef = doc(db, 'users', req.params.id, 'assessment', 'main');
      const assessmentDoc = await getDoc(assessmentRef);
      if (assessmentDoc.exists()) {
        assessment = assessmentDoc.data();
      }
    }

    res.json({ user, assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load user' });
  }
});
router.post('/users/:id/toggle-status', toggleUserStatus);

// Reports & Analytics
router.get('/reports', getSystemAnalytics);

// Notifications
router.get('/notifications', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }

  try {
    // Get user counts for notification targeting
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    let total = 0;
    let students = 0;
    let sponsors = 0;

    usersSnapshot.forEach(doc => {
      const data = doc.data();
      total++;
      if (data.role === 'student') students++;
      if (data.role === 'sponsor') sponsors++;
    });

    res.render('admin/notifications', {
      email: req.session.user.email,
      stats: { total, students, sponsors }
    });
  } catch (error) {
    console.error('Error loading notifications page:', error);
    res.render('admin/notifications', {
      email: req.session.user.email,
      stats: { total: 0, students: 0, sponsors: 0 }
    });
  }
});
router.post('/notifications/send', sendSystemNotification);

module.exports = router;
