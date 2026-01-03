const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireStudent, requireAuth } = require('../middleware/auth');
const { csrfMultipart } = require('../middleware/csrf');
const { showAssessmentForm, submitAssessment } = require('../controllers/assessmentController');
const {
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
  getProfile,
  updateProfile,
  uploadAvatar,
  downloadScholarshipCalendar
} = require('../controllers/studentController');
const {
  createApplication,
  withdrawApplication,
  getDraftApplication,
  deleteDraftApplication
} = require('../controllers/applicationController');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg and .pdf files are allowed!'));
    }
  }
});

// Assessment routes - require auth (user logged in but might not have completed assessment yet)
router.get('/assessment', requireAuth, showAssessmentForm);
router.post('/assessment', requireAuth, upload.fields([
  { name: 'grades', maxCount: 1 },
  { name: 'coe', maxCount: 1 },
  { name: 'schoolId', maxCount: 1 },
  { name: 'otherDocuments', maxCount: 5 }
]), csrfMultipart, submitAssessment);

// Student dashboard route - require student role
router.get('/student_dashboard', requireStudent, showStudentDashboard);
router.get('/dashboard', requireStudent, showStudentDashboard);

// Profile - require student role
router.get('/profile', requireStudent, getProfile);
router.post('/profile/update', requireStudent, updateProfile);

// Configure multer for avatar uploads (images only, 5MB limit)
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

router.post('/profile/avatar', requireStudent, avatarUpload.single('profilePicture'), csrfMultipart, uploadAvatar);

// Scholarship search and browse - require student role
router.get('/scholarships', requireStudent, searchScholarships);
router.get('/scholarships/:id', requireStudent, viewScholarshipDetails);
router.get('/scholarships/:id/apply', requireStudent, showApplyForm);
router.get('/scholarships/:id/calendar', requireStudent, downloadScholarshipCalendar);

// Applications - require student role
router.post('/scholarships/:id/apply', requireStudent, createApplication);
router.get('/scholarships/:scholarshipId/draft', requireStudent, getDraftApplication);
router.get('/applications', requireStudent, getMyApplications);
router.get('/applications/:id', requireStudent, viewApplicationDetails);
router.post('/applications/:id/withdraw', requireStudent, withdrawApplication);
router.delete('/applications/:id/draft', requireStudent, deleteDraftApplication);

// Recommendations (GPT-powered) - require student role
router.get('/recommendations', requireStudent, getRecommendations);
router.post('/recommendations/generate', requireStudent, generateAndSaveRecommendations);

// Notifications - require student role
router.get('/notifications', requireStudent, getNotifications);
router.post('/notifications/:id/read', requireStudent, markNotificationRead);
router.post('/notifications/read-all', requireStudent, markAllNotificationsRead);

module.exports = router;