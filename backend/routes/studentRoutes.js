const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { showAssessmentForm, submitAssessment } = require('../controllers/assessmentController');
const {
  showStudentDashboard,
  searchScholarships,
  viewScholarshipDetails,
  showApplyForm,
  getRecommendations,
  getMyApplications,
  viewApplicationDetails,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProfile
} = require('../controllers/studentController');
const {
  createApplication,
  withdrawApplication
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

// Show assessment form
router.get('/assessment', showAssessmentForm);

// Submit assessment with file uploads
router.post('/assessment', upload.fields([
  { name: 'grades', maxCount: 1 },
  { name: 'coe', maxCount: 1 },
  { name: 'schoolId', maxCount: 1 },
  { name: 'otherDocuments', maxCount: 5 }
]), submitAssessment);

// Student dashboard route
router.get('/student_dashboard', showStudentDashboard);
router.get('/dashboard', showStudentDashboard);

// Profile
router.get('/profile', getProfile);

// Scholarship search and browse
router.get('/scholarships', searchScholarships);
router.get('/scholarships/:id', viewScholarshipDetails);
router.get('/scholarships/:id/apply', showApplyForm);

// Applications
router.post('/scholarships/:id/apply', createApplication);
router.get('/applications', getMyApplications);
router.get('/applications/:id', viewApplicationDetails);
router.post('/applications/:id/withdraw', withdrawApplication);

// Recommendations (GPT-powered)
router.get('/recommendations', getRecommendations);

// Notifications
router.get('/notifications', getNotifications);
router.post('/notifications/:id/read', markNotificationRead);
router.post('/notifications/read-all', markAllNotificationsRead);

module.exports = router;