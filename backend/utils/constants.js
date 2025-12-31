/**
 * Application-wide constants for status values, validation rules, and enums
 */

// Application Status Values
const APPLICATION_STATUS = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NOTIFIED: 'notified',
  ACCEPTED: 'accepted',
  NOT_SELECTED: 'not_selected',
  WITHDRAWN: 'withdrawn'
};

// Scholarship Status Values
const SCHOLARSHIP_STATUS = {
  PENDING: 'Pending',
  OPEN: 'Open',
  CLOSED: 'Closed',
  DRAFT: 'Draft'
};

// User Roles
const USER_ROLES = {
  STUDENT: 'student',
  SPONSOR: 'sponsor',
  ADMIN: 'admin'
};

// Authentication Providers
const AUTH_PROVIDERS = {
  EMAIL: 'email',
  GOOGLE: 'google',
  BOTH: 'both'
};

// Scholarship Types
const SCHOLARSHIP_TYPES = [
  'Academic Excellence',
  'Need-Based',
  'Athletic',
  'Community Service',
  'STEM',
  'Arts & Humanities',
  'Leadership',
  'Minority/Diversity',
  'International',
  'Research',
  'Professional Development',
  'Other'
];

// Degree Levels
const DEGREE_LEVELS = [
  'High School',
  'Associate',
  'Bachelor',
  'Master',
  'Doctorate',
  'Professional',
  'Certificate',
  'Any'
];

// Validation Rules
const VALIDATION = {
  GPA: {
    MIN: 0,
    MAX: 4.0
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 128
  },
  NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  INCOME: {
    MIN: 0,
    MAX: 10000000
  },
  SCHOLARSHIP_AMOUNT: {
    MIN: 0,
    MAX: 1000000
  },
  SLOTS: {
    MIN: 1,
    MAX: 10000
  }
};

// File Upload Limits
const FILE_LIMITS = {
  PROFILE_PICTURE: {
    MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg']
  },
  DOCUMENT: {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
  }
};

// Status Display Labels (for UI)
const STATUS_LABELS = {
  [APPLICATION_STATUS.PENDING]: 'Pending',
  [APPLICATION_STATUS.UNDER_REVIEW]: 'Under Review',
  [APPLICATION_STATUS.APPROVED]: 'Approved',
  [APPLICATION_STATUS.REJECTED]: 'Rejected',
  [APPLICATION_STATUS.NOTIFIED]: 'Notified',
  [APPLICATION_STATUS.ACCEPTED]: 'Accepted',
  [APPLICATION_STATUS.NOT_SELECTED]: 'Not Selected',
  [APPLICATION_STATUS.WITHDRAWN]: 'Withdrawn'
};

// Status CSS Classes (for UI styling)
const STATUS_CLASSES = {
  [APPLICATION_STATUS.PENDING]: 'pending',
  [APPLICATION_STATUS.UNDER_REVIEW]: 'under-review',
  [APPLICATION_STATUS.APPROVED]: 'approved',
  [APPLICATION_STATUS.REJECTED]: 'rejected',
  [APPLICATION_STATUS.NOTIFIED]: 'notified',
  [APPLICATION_STATUS.ACCEPTED]: 'approved',
  [APPLICATION_STATUS.NOT_SELECTED]: 'rejected',
  [APPLICATION_STATUS.WITHDRAWN]: 'closed'
};

/**
 * Validate GPA value
 * @param {number} gpa - GPA value to validate
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateGPA(gpa) {
  const numGpa = parseFloat(gpa);
  if (isNaN(numGpa)) {
    return { valid: false, error: 'GPA must be a number' };
  }
  if (numGpa < VALIDATION.GPA.MIN || numGpa > VALIDATION.GPA.MAX) {
    return { valid: false, error: `GPA must be between ${VALIDATION.GPA.MIN} and ${VALIDATION.GPA.MAX}` };
  }
  return { valid: true, error: null };
}

/**
 * Validate date range (start date before end date)
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    return { valid: false, error: 'Invalid start date' };
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid end date' };
  }
  if (start >= end) {
    return { valid: false, error: 'Start date must be before end date' };
  }
  return { valid: true, error: null };
}

/**
 * Validate scholarship amount
 * @param {number} amount
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateScholarshipAmount(amount) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a number' };
  }
  if (numAmount < VALIDATION.SCHOLARSHIP_AMOUNT.MIN) {
    return { valid: false, error: 'Amount cannot be negative' };
  }
  if (numAmount > VALIDATION.SCHOLARSHIP_AMOUNT.MAX) {
    return { valid: false, error: `Amount cannot exceed ${VALIDATION.SCHOLARSHIP_AMOUNT.MAX.toLocaleString()}` };
  }
  return { valid: true, error: null };
}

/**
 * Validate income limit
 * @param {number} income
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateIncome(income) {
  const numIncome = parseFloat(income);
  if (isNaN(numIncome)) {
    return { valid: false, error: 'Income must be a number' };
  }
  if (numIncome < VALIDATION.INCOME.MIN) {
    return { valid: false, error: 'Income cannot be negative' };
  }
  if (numIncome > VALIDATION.INCOME.MAX) {
    return { valid: false, error: `Income cannot exceed ${VALIDATION.INCOME.MAX.toLocaleString()}` };
  }
  return { valid: true, error: null };
}

/**
 * Validate slots/capacity
 * @param {number} slots
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateSlots(slots) {
  const numSlots = parseInt(slots, 10);
  if (isNaN(numSlots)) {
    return { valid: false, error: 'Slots must be a number' };
  }
  if (numSlots < VALIDATION.SLOTS.MIN) {
    return { valid: false, error: `Slots must be at least ${VALIDATION.SLOTS.MIN}` };
  }
  if (numSlots > VALIDATION.SLOTS.MAX) {
    return { valid: false, error: `Slots cannot exceed ${VALIDATION.SLOTS.MAX}` };
  }
  return { valid: true, error: null };
}

/**
 * Check if a status transition is valid
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {boolean}
 */
function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    [APPLICATION_STATUS.PENDING]: [APPLICATION_STATUS.UNDER_REVIEW, APPLICATION_STATUS.WITHDRAWN],
    [APPLICATION_STATUS.UNDER_REVIEW]: [APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.PENDING],
    [APPLICATION_STATUS.APPROVED]: [APPLICATION_STATUS.NOTIFIED],
    [APPLICATION_STATUS.NOTIFIED]: [APPLICATION_STATUS.ACCEPTED, APPLICATION_STATUS.NOT_SELECTED],
    [APPLICATION_STATUS.REJECTED]: [],
    [APPLICATION_STATUS.ACCEPTED]: [],
    [APPLICATION_STATUS.NOT_SELECTED]: [],
    [APPLICATION_STATUS.WITHDRAWN]: []
  };

  const allowed = validTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
}

module.exports = {
  APPLICATION_STATUS,
  SCHOLARSHIP_STATUS,
  USER_ROLES,
  AUTH_PROVIDERS,
  SCHOLARSHIP_TYPES,
  DEGREE_LEVELS,
  VALIDATION,
  FILE_LIMITS,
  STATUS_LABELS,
  STATUS_CLASSES,
  validateGPA,
  validateDateRange,
  validateScholarshipAmount,
  validateIncome,
  validateSlots,
  isValidStatusTransition
};
