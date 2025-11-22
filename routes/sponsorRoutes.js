const express = require('express');
const router = express.Router();
const {
  showAddScholarshipForm,
  addScholarshipOffer,
  viewScholarshipOffers,
  viewScholarshipDetails,
  updateScholarshipStatus,
  deleteScholarship
} = require('../controllers/scholarshipController');

// Show form to add scholarship
router.get('/add-offer', showAddScholarshipForm);

// Submit new scholarship
router.post('/add-offer', addScholarshipOffer);

// View all scholarship offers
router.get('/offers', viewScholarshipOffers);

// View single scholarship details
router.get('/offers/:id', viewScholarshipDetails);

// Update scholarship status
router.post('/offers/:id/status', updateScholarshipStatus);

// Delete scholarship
router.post('/offers/:id/delete', deleteScholarship);

module.exports = router;