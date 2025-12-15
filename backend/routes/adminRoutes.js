/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');
const { db } = require('../config/firebaseConfig');
const { doc, getDoc, collection, getDocs, query, where, updateDoc, setDoc } = require('firebase/firestore');

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
  showAdminDashboard,
  approveScholarship,
  rejectScholarship,
  getAllUsers,
  toggleUserStatus,
  getAllApplications,
  sendSystemNotification,
  getManageScholarships,
  updateApplicationStatus
} = require('../controllers/adminController');
const { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead, createNotification } = require('../services/notificationService');

// Apply requireAdmin middleware to all routes
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', showAdminDashboard);

// Pending Scholarships Page
router.get('/pending-scholarships', async (req, res) => {
  try {
    const scholarshipsRef = collection(db, 'scholarships');
    const q = query(scholarshipsRef, where('status', '==', 'Pending'));
    const snapshot = await getDocs(q);

    const scholarships = [];
    snapshot.forEach(doc => {
      scholarships.push({ id: doc.id, ...doc.data() });
    });

    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('admin/pending_scholarships', {
      email: req.session.user.email,
      scholarships
    });
  } catch (error) {
    console.error('Error loading pending scholarships:', error);
    res.status(500).send('Error loading scholarships');
  }
});

// Approved/Active Scholarships Page
router.get('/approved-scholarships', async (req, res) => {
  try {
    const scholarshipsRef = collection(db, 'scholarships');
    const snapshot = await getDocs(scholarshipsRef);

    const scholarships = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.status === 'Open' || data.status === 'Closed') {
        const now = new Date();
        const deadline = new Date(data.endDate);
        const isExpired = now > deadline;
        const isFull = (data.slotsFilled || 0) >= data.slotsAvailable;

        scholarships.push({
          id: doc.id,
          ...data,
          isExpired,
          isFull
        });
      }
    });

    scholarships.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get application counts
    const applicationsRef = collection(db, 'applications');
    const appSnapshot = await getDocs(applicationsRef);
    const appCounts = {};

    appSnapshot.forEach(doc => {
      const app = doc.data();
      if (!appCounts[app.scholarshipId]) {
        appCounts[app.scholarshipId] = { total: 0, accepted: 0, notified: 0, pending: 0, notSelected: 0 };
      }
      appCounts[app.scholarshipId].total++;
      if (app.status === 'accepted') appCounts[app.scholarshipId].accepted++;
      if (app.status === 'notified') appCounts[app.scholarshipId].notified++;
      if (app.status === 'pending' || app.status === 'under_review') appCounts[app.scholarshipId].pending++;
      if (app.status === 'not_selected') appCounts[app.scholarshipId].notSelected++;
    });

    scholarships.forEach(s => {
      s.applicationCounts = appCounts[s.id] || { total: 0, accepted: 0, notified: 0, pending: 0, notSelected: 0 };
    });

    res.render('admin/approved_scholarships', {
      email: req.session.user.email,
      scholarships
    });
  } catch (error) {
    console.error('Error loading approved scholarships:', error);
    res.status(500).send('Error loading scholarships');
  }
});

// Scholarship Management - Main page with tabs
router.get('/scholarships', getManageScholarships);

// Get scholarship details (JSON)
router.get('/scholarships/:id/details', async (req, res) => {
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

// Approve scholarship
router.post('/scholarships/:id/approve', approveScholarship);

// Reject scholarship
router.post('/scholarships/:id/reject', rejectScholarship);

// Close scholarship (admin)
router.post('/scholarships/:id/close', async (req, res) => {
  try {
    const scholarshipRef = doc(db, 'scholarships', req.params.id);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    await updateDoc(scholarshipRef, {
      status: 'Closed',
      closedAt: new Date().toISOString(),
      closedBy: 'admin',
      updatedAt: new Date().toISOString()
    });

    // Notify sponsor
    await createNotification(
      scholarship.sponsorUid,
      'scholarship_update',
      'Scholarship Closed by Admin',
      `Your scholarship "${scholarship.scholarshipName}" has been closed by the administrator.`,
      req.params.id
    );

    res.json({ success: true, message: 'Scholarship closed' });
  } catch (error) {
    console.error('Error closing scholarship:', error);
    res.status(500).json({ error: 'Failed to close scholarship' });
  }
});

// Reopen scholarship (admin)
router.post('/scholarships/:id/reopen', async (req, res) => {
  try {
    const scholarshipRef = doc(db, 'scholarships', req.params.id);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    await updateDoc(scholarshipRef, {
      status: 'Open',
      reopenedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Notify sponsor
    await createNotification(
      scholarship.sponsorUid,
      'scholarship_update',
      'Scholarship Reopened',
      `Your scholarship "${scholarship.scholarshipName}" has been reopened by the administrator.`,
      req.params.id
    );

    res.json({ success: true, message: 'Scholarship reopened' });
  } catch (error) {
    console.error('Error reopening scholarship:', error);
    res.status(500).json({ error: 'Failed to reopen scholarship' });
  }
});

// View applications for a scholarship (admin)
router.get('/scholarships/:id/applications', async (req, res) => {
  try {
    const scholarshipRef = doc(db, 'scholarships', req.params.id);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send('Scholarship not found');
    }

    const scholarship = { id: scholarshipDoc.id, ...scholarshipDoc.data() };

    // Get applications
    const applicationsRef = collection(db, 'applications');
    const q = query(applicationsRef, where('scholarshipId', '==', req.params.id));
    const appSnapshot = await getDocs(q);

    const applications = [];
    appSnapshot.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    // Sort by AI score if available
    applications.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));

    res.render('admin/scholarship_applications', {
      email: req.session.user.email,
      scholarship,
      applications
    });
  } catch (error) {
    console.error('Error loading applications:', error);
    res.status(500).send('Error loading applications');
  }
});

// Approve student application (fills slot)
router.post('/applications/:id/approve-slot', async (req, res) => {
  try {
    const applicationRef = doc(db, 'applications', req.params.id);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = applicationDoc.data();

    // Get scholarship to check slots
    const scholarshipRef = doc(db, 'scholarships', application.scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    // Check if slots available
    if ((scholarship.slotsFilled || 0) >= scholarship.slotsAvailable) {
      return res.status(400).json({ error: 'No slots available' });
    }

    // Update application
    await updateDoc(applicationRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: 'admin',
      updatedAt: new Date().toISOString()
    });

    // Update scholarship slots
    await updateDoc(scholarshipRef, {
      slotsFilled: (scholarship.slotsFilled || 0) + 1,
      updatedAt: new Date().toISOString()
    });

    // Notify student
    await createNotification(
      application.studentUid,
      'application_approved',
      'Application Approved!',
      `Congratulations! Your application for "${application.scholarshipName || scholarship.scholarshipName}" has been approved.`,
      req.params.id
    );

    // Notify sponsor
    await createNotification(
      scholarship.sponsorUid,
      'application_update',
      'Application Approved',
      `An application for "${scholarship.scholarshipName}" has been approved. Slots: ${(scholarship.slotsFilled || 0) + 1}/${scholarship.slotsAvailable}`,
      application.scholarshipId
    );

    res.json({ success: true, message: 'Application approved and slot filled' });
  } catch (error) {
    console.error('Error approving application:', error);
    res.status(500).json({ error: 'Failed to approve application' });
  }
});

// Application Management
router.get('/applications', getAllApplications);
router.post('/applications/:id/status', updateApplicationStatus);

// Notify student of acceptance (changes status from 'accepted' to 'notified')
router.post('/applications/:id/notify', async (req, res) => {
  try {
    const applicationRef = doc(db, 'applications', req.params.id);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = applicationDoc.data();

    // Only accepted applications can be notified
    if (application.status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted applications can be notified' });
    }

    // Update application status to notified
    await updateDoc(applicationRef, {
      status: 'notified',
      notifiedAt: new Date().toISOString(),
      notifiedBy: req.session.user.email,
      updatedAt: new Date().toISOString()
    });

    // Update scholarship slots
    const scholarshipRef = doc(db, 'scholarships', application.scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (scholarshipDoc.exists()) {
      const scholarship = scholarshipDoc.data();
      await updateDoc(scholarshipRef, {
        slotsFilled: (scholarship.slotsFilled || 0) + 1,
        updatedAt: new Date().toISOString()
      });

      // Notify student
      await createNotification(
        application.studentUid,
        'application_approved',
        'Congratulations! You\'ve Been Selected!',
        `Great news! You have been selected for the scholarship "${application.scholarshipName || scholarship.scholarshipName}". Check your applications for more details.`,
        req.params.id
      );

      // Notify sponsor
      await createNotification(
        scholarship.sponsorUid,
        'application_update',
        'Student Notified',
        `A student has been officially notified of their selection for "${scholarship.scholarshipName}". Slots: ${(scholarship.slotsFilled || 0) + 1}/${scholarship.slotsAvailable}`,
        application.scholarshipId
      );
    }

    res.json({ success: true, message: 'Student has been notified' });
  } catch (error) {
    console.error('Error notifying student:', error);
    res.status(500).json({ error: 'Failed to notify student' });
  }
});

// Mark application as not selected
router.post('/applications/:id/not-selected', async (req, res) => {
  try {
    const applicationRef = doc(db, 'applications', req.params.id);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = applicationDoc.data();

    // Cannot mark already notified applications as not selected
    if (application.status === 'notified') {
      return res.status(400).json({ error: 'Cannot mark notified applications as not selected' });
    }

    // Update application status
    await updateDoc(applicationRef, {
      status: 'not_selected',
      notSelectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Get scholarship name for notification
    const scholarshipRef = doc(db, 'scholarships', application.scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);
    const scholarshipName = scholarshipDoc.exists()
      ? scholarshipDoc.data().scholarshipName
      : application.scholarshipName;

    // Notify student
    await createNotification(
      application.studentUid,
      'application_not_selected',
      'Application Update',
      `Unfortunately, you were not selected for the scholarship "${scholarshipName}". Don't give up - keep applying to other scholarships!`,
      req.params.id
    );

    res.json({ success: true, message: 'Application marked as not selected' });
  } catch (error) {
    console.error('Error marking not selected:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// Send exam details to all notified students
router.post('/scholarships/:id/send-exam-details', async (req, res) => {
  try {
    const scholarshipId = req.params.id;

    // Get scholarship
    const scholarshipRef = doc(db, 'scholarships', scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    if (!scholarship.examSchedule) {
      return res.status(400).json({ error: 'No exam schedule set for this scholarship' });
    }

    // Get all notified applications for this scholarship
    const applicationsRef = collection(db, 'applications');
    const q = query(applicationsRef, where('scholarshipId', '==', scholarshipId));
    const appSnapshot = await getDocs(q);

    const notificationPromises = [];
    let count = 0;

    appSnapshot.forEach(docSnap => {
      const app = docSnap.data();
      if (app.status === 'notified') {
        const examDate = new Date(scholarship.examSchedule.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        let message = `Exam Details for "${scholarship.scholarshipName}":\n\n` +
          `📅 Date: ${examDate}\n` +
          `🕐 Time: ${scholarship.examSchedule.time}\n` +
          `📍 Venue: ${scholarship.examSchedule.venue}`;

        if (scholarship.examSchedule.notes) {
          message += `\n\n📝 Notes: ${scholarship.examSchedule.notes}`;
        }

        notificationPromises.push(
          createNotification(
            app.studentUid,
            'exam_schedule',
            'Exam Schedule - ' + scholarship.scholarshipName,
            message,
            scholarshipId
          )
        );
        count++;
      }
    });

    await Promise.all(notificationPromises);

    console.log(`✅ Sent exam details to ${count} students for scholarship ${scholarshipId}`);

    res.json({ success: true, count, message: `Exam details sent to ${count} student(s)` });
  } catch (error) {
    console.error('Error sending exam details:', error);
    res.status(500).json({ error: 'Failed to send exam details' });
  }
});

// Mark all remaining applications as not selected for a scholarship
router.post('/scholarships/:id/mark-remaining-not-selected', async (req, res) => {
  try {
    const scholarshipId = req.params.id;

    // Get scholarship
    const scholarshipRef = doc(db, 'scholarships', scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    const scholarship = scholarshipDoc.data();

    // Get all applications for this scholarship that are not notified or already not_selected
    const applicationsRef = collection(db, 'applications');
    const q = query(applicationsRef, where('scholarshipId', '==', scholarshipId));
    const appSnapshot = await getDocs(q);

    let count = 0;
    const updatePromises = [];
    const notificationPromises = [];

    appSnapshot.forEach(docSnap => {
      const app = docSnap.data();
      if (app.status !== 'notified' && app.status !== 'not_selected') {
        // Update application
        updatePromises.push(
          updateDoc(doc(db, 'applications', docSnap.id), {
            status: 'not_selected',
            notSelectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        );

        // Send notification to student
        notificationPromises.push(
          createNotification(
            app.studentUid,
            'application_not_selected',
            'Application Update',
            `Unfortunately, you were not selected for the scholarship "${scholarship.scholarshipName}". Don't give up - keep applying to other scholarships!`,
            docSnap.id
          )
        );

        count++;
      }
    });

    await Promise.all(updatePromises);
    await Promise.all(notificationPromises);

    res.json({ success: true, count, message: `${count} applicant(s) marked as not selected` });
  } catch (error) {
    console.error('Error marking remaining not selected:', error);
    res.status(500).json({ error: 'Failed to update applications' });
  }
});

// User Management
router.get('/users', getAllUsers);
router.get('/users/:id/details', async (req, res) => {
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

// Reports
router.get('/reports', async (req, res) => {
  try {
    const usersRef = collection(db, 'users');
    const scholarshipsRef = collection(db, 'scholarships');
    const applicationsRef = collection(db, 'applications');

    const usersSnapshot = await getDocs(usersRef);
    const scholarshipsSnapshot = await getDocs(scholarshipsRef);
    const applicationsSnapshot = await getDocs(applicationsRef);

    const users = [];
    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

    const scholarships = [];
    scholarshipsSnapshot.forEach(doc => scholarships.push({ id: doc.id, ...doc.data() }));

    const applications = [];
    applicationsSnapshot.forEach(doc => applications.push({ id: doc.id, ...doc.data() }));

    // Calculate slots
    const totalSlots = scholarships.reduce((sum, s) => sum + (s.slotsAvailable || 0), 0);
    const filledSlots = scholarships.reduce((sum, s) => sum + (s.slotsFilled || 0), 0);

    // Calculate new users this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = users.filter(u => {
      const created = u.createdAt ? new Date(u.createdAt) : null;
      return created && created >= startOfMonth;
    }).length;

    // Calculate scholarship types
    const scholarshipTypes = {};
    scholarships.forEach(s => {
      const type = s.scholarshipType || 'Other';
      scholarshipTypes[type] = (scholarshipTypes[type] || 0) + 1;
    });

    // Calculate approval rate
    const totalDecided = applications.filter(a =>
      a.status === 'notified' || a.status === 'not_selected'
    ).length;
    const approvalRate = totalDecided > 0
      ? Math.round((applications.filter(a => a.status === 'notified').length / totalDecided) * 100)
      : 0;

    const analytics = {
      users: {
        total: users.length,
        students: users.filter(u => u.role === 'student').length,
        sponsors: users.filter(u => u.role === 'sponsor').length,
        admins: users.filter(u => u.role === 'admin').length,
        newThisMonth
      },
      scholarships: {
        total: scholarships.length,
        open: scholarships.filter(s => s.status === 'Open').length,
        closed: scholarships.filter(s => s.status === 'Closed').length,
        pending: scholarships.filter(s => s.status === 'Pending').length,
        totalSlots,
        filledSlots
      },
      applications: {
        total: applications.length,
        accepted: applications.filter(a => a.status === 'accepted').length,
        notified: applications.filter(a => a.status === 'notified').length,
        pending: applications.filter(a => a.status === 'pending' || a.status === 'under_review').length,
        notSelected: applications.filter(a => a.status === 'not_selected').length,
        approvalRate
      },
      scholarshipTypes
    };

    res.render('admin/reports', {
      email: req.session.user.email,
      analytics,
      applications,
      scholarships
    });
  } catch (error) {
    console.error('Error loading reports:', error);
    res.status(500).send('Error loading reports');
  }
});

// Notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await getUserNotifications('admin');
    const unreadCount = await getUnreadCount('admin');

    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    let total = 0, students = 0, sponsors = 0;
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      total++;
      if (data.role === 'student') students++;
      if (data.role === 'sponsor') sponsors++;
    });

    res.render('admin/notifications', {
      email: req.session.user.email,
      notifications,
      unreadCount,
      stats: { total, students, sponsors }
    });
  } catch (error) {
    console.error('Error loading notifications:', error);
    res.render('admin/notifications', {
      email: req.session.user.email,
      notifications: [],
      unreadCount: 0,
      stats: { total: 0, students: 0, sponsors: 0 }
    });
  }
});

router.post('/notifications/send', sendSystemNotification);

router.post('/notifications/:id/read', async (req, res) => {
  try {
    await markAsRead(req.params.id, 'admin');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    const count = await markAllAsRead('admin');
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// API endpoint for sidebar counts
router.get('/api/counts', async (req, res) => {
  try {
    // Get pending scholarships count
    const scholarshipsRef = collection(db, 'scholarships');
    const pendingQuery = query(scholarshipsRef, where('status', '==', 'Pending'));
    const pendingSnapshot = await getDocs(pendingQuery);
    const pendingScholarships = pendingSnapshot.size;

    // Get unread notifications count
    const unreadNotifications = await getUnreadCount('admin');

    res.json({
      pendingScholarships,
      unreadNotifications
    });
  } catch (error) {
    console.error('Error getting counts:', error);
    res.json({ pendingScholarships: 0, unreadNotifications: 0 });
  }
});

// Admin Profile page
router.get('/profile', async (req, res) => {
  try {
    // Get platform statistics
    const usersRef = collection(db, 'users');
    const scholarshipsRef = collection(db, 'scholarships');
    const applicationsRef = collection(db, 'applications');

    const [usersSnapshot, scholarshipsSnapshot, applicationsSnapshot] = await Promise.all([
      getDocs(usersRef),
      getDocs(scholarshipsRef),
      getDocs(applicationsRef)
    ]);

    const stats = {
      totalUsers: usersSnapshot.size,
      totalScholarships: scholarshipsSnapshot.size,
      totalApplications: applicationsSnapshot.size,
      students: 0,
      sponsors: 0
    };

    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.role === 'student') stats.students++;
      if (data.role === 'sponsor') stats.sponsors++;
    });

    // Get admin user info
    const adminRef = doc(db, 'users', req.session.user.uid);
    const adminDoc = await getDoc(adminRef);
    const adminData = adminDoc.exists() ? adminDoc.data() : {};

    res.render('admin/profile', {
      email: req.session.user.email,
      user: {
        fullName: req.session.user.fullName || adminData.fullName || 'System Administrator',
        createdAt: adminData.createdAt || null,
        profilePicture: adminData.profilePicture || null
      },
      stats
    });
  } catch (error) {
    console.error('Error loading admin profile:', error);
    res.render('admin/profile', {
      email: req.session.user.email,
      user: {
        fullName: 'System Administrator',
        createdAt: null,
        profilePicture: null
      },
      stats: {
        totalUsers: 0,
        totalScholarships: 0,
        totalApplications: 0,
        students: 0,
        sponsors: 0
      }
    });
  }
});

// Update admin profile
router.post('/profile/update', async (req, res) => {
  const adminUid = req.session.user.uid;
  const { fullName } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  try {
    const userRef = doc(db, 'users', adminUid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      await updateDoc(userRef, {
        fullName: fullName.trim(),
        updatedAt: new Date().toISOString()
      });
    } else {
      // Create doc if doesn't exist (for hardcoded admin)
      await setDoc(userRef, {
        uid: adminUid,
        email: req.session.user.email,
        role: 'admin',
        fullName: fullName.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Update session
    req.session.user.fullName = fullName.trim();

    console.log('Profile updated for admin:', adminUid);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating admin profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload admin avatar
router.post('/profile/avatar', avatarUpload.single('profilePicture'), async (req, res) => {
  const adminUid = req.session.user.uid;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const profilePictureUrl = `/uploads/${req.file.filename}`;

    const userRef = doc(db, 'users', adminUid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      await updateDoc(userRef, {
        profilePicture: profilePictureUrl,
        updatedAt: new Date().toISOString()
      });
    } else {
      // Create doc if doesn't exist (for hardcoded admin)
      await setDoc(userRef, {
        uid: adminUid,
        email: req.session.user.email,
        role: 'admin',
        fullName: 'System Administrator',
        profilePicture: profilePictureUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Update session so sidebar updates immediately
    req.session.user.profilePicture = profilePictureUrl;

    console.log('Profile picture updated for admin:', adminUid);
    res.json({ success: true, message: 'Profile picture updated', url: profilePictureUrl });
  } catch (error) {
    console.error('Error uploading admin avatar:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

module.exports = router;
