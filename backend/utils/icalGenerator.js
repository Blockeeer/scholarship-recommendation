/**
 * iCal Generator Utility
 * Generates .ics calendar files for scholarship deadlines
 * RFC 5545 compliant format
 */

/**
 * Format date to iCal format (YYYYMMDD)
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatICalDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format date with time to iCal format (YYYYMMDDTHHMMSSZ)
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted datetime string
 */
function formatICalDateTime(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape special characters for iCal text fields
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate a unique identifier for the event
 * @param {string} scholarshipId - Scholarship ID
 * @param {string} type - Event type (deadline, start, etc.)
 * @returns {string} - Unique identifier
 */
function generateUID(scholarshipId, type) {
  return `${scholarshipId}-${type}@scholarship-portal`;
}

/**
 * Generate iCal content for a scholarship deadline
 * @param {object} scholarship - Scholarship data
 * @param {object} options - Optional settings
 * @returns {string} - iCal file content
 */
function generateScholarshipICS(scholarship, options = {}) {
  const {
    includeReminder = true,
    reminderDays = 3
  } = options;

  const now = new Date();
  const endDate = new Date(scholarship.endDate);
  const startDate = new Date(scholarship.startDate);

  // Calculate reminder time (days before deadline)
  const reminderDate = new Date(endDate);
  reminderDate.setDate(reminderDate.getDate() - reminderDays);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scholarship Portal//Deadline Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Scholarship Deadlines',
    '',
    // Main deadline event
    'BEGIN:VEVENT',
    `UID:${generateUID(scholarship.id, 'deadline')}`,
    `DTSTAMP:${formatICalDateTime(now)}`,
    `DTSTART;VALUE=DATE:${formatICalDate(endDate)}`,
    `DTEND;VALUE=DATE:${formatICalDate(endDate)}`,
    `SUMMARY:${escapeICalText(`Deadline: ${scholarship.scholarshipName}`)}`,
    `DESCRIPTION:${escapeICalText(buildDescription(scholarship))}`,
    `LOCATION:${escapeICalText(scholarship.organizationName || 'Online')}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    `URL:${escapeICalText(options.portalUrl || '')}`,
    'CATEGORIES:Scholarship,Deadline'
  ];

  // Add reminder/alarm
  if (includeReminder) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Scholarship deadline in ${reminderDays} days: ${escapeICalText(scholarship.scholarshipName)}`,
      `TRIGGER:-P${reminderDays}D`,
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT');

  // Add application open event if start date is in the future
  if (startDate > now) {
    lines.push(
      '',
      'BEGIN:VEVENT',
      `UID:${generateUID(scholarship.id, 'start')}`,
      `DTSTAMP:${formatICalDateTime(now)}`,
      `DTSTART;VALUE=DATE:${formatICalDate(startDate)}`,
      `DTEND;VALUE=DATE:${formatICalDate(startDate)}`,
      `SUMMARY:${escapeICalText(`Applications Open: ${scholarship.scholarshipName}`)}`,
      `DESCRIPTION:${escapeICalText(`Applications are now open for ${scholarship.scholarshipName} by ${scholarship.organizationName}.`)}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'CATEGORIES:Scholarship,Application Open',
      'END:VEVENT'
    );
  }

  lines.push('', 'END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Build event description from scholarship data
 * @param {object} scholarship - Scholarship data
 * @returns {string} - Formatted description
 */
function buildDescription(scholarship) {
  const parts = [
    `Scholarship: ${scholarship.scholarshipName}`,
    `Organization: ${scholarship.organizationName}`,
    `Type: ${scholarship.scholarshipType}`,
    '',
    'Requirements:',
    `- Minimum GPA: ${scholarship.minGPA || 'Not specified'}`,
  ];

  if (scholarship.eligibleCourses && scholarship.eligibleCourses.length > 0) {
    parts.push(`- Eligible Courses: ${scholarship.eligibleCourses.join(', ')}`);
  }

  if (scholarship.eligibleYearLevels && scholarship.eligibleYearLevels.length > 0) {
    parts.push(`- Year Levels: ${scholarship.eligibleYearLevels.join(', ')}`);
  }

  if (scholarship.slotsAvailable) {
    const remaining = scholarship.slotsAvailable - (scholarship.slotsFilled || 0);
    parts.push(`- Slots: ${remaining} remaining of ${scholarship.slotsAvailable}`);
  }

  parts.push('', 'Apply at the Scholarship Portal before the deadline!');

  return parts.join('\n');
}

/**
 * Generate iCal for multiple scholarships (e.g., all saved/bookmarked)
 * @param {array} scholarships - Array of scholarship data
 * @param {object} options - Optional settings
 * @returns {string} - iCal file content
 */
function generateMultipleScholarshipsICS(scholarships, options = {}) {
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scholarship Portal//Deadline Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:My Scholarship Deadlines'
  ];

  scholarships.forEach(scholarship => {
    const endDate = new Date(scholarship.endDate);

    lines.push(
      '',
      'BEGIN:VEVENT',
      `UID:${generateUID(scholarship.id, 'deadline')}`,
      `DTSTAMP:${formatICalDateTime(now)}`,
      `DTSTART;VALUE=DATE:${formatICalDate(endDate)}`,
      `DTEND;VALUE=DATE:${formatICalDate(endDate)}`,
      `SUMMARY:${escapeICalText(`Deadline: ${scholarship.scholarshipName}`)}`,
      `DESCRIPTION:${escapeICalText(buildDescription(scholarship))}`,
      `LOCATION:${escapeICalText(scholarship.organizationName || 'Online')}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'CATEGORIES:Scholarship,Deadline',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Scholarship deadline approaching: ${escapeICalText(scholarship.scholarshipName)}`,
      'TRIGGER:-P3D',
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lines.push('', 'END:VCALENDAR');

  return lines.join('\r\n');
}

module.exports = {
  generateScholarshipICS,
  generateMultipleScholarshipsICS,
  formatICalDate,
  formatICalDateTime
};
