/**
 * Scheduled Tasks Service
 * Handles automatic tasks like closing expired scholarships
 */

const { db } = require('../config/firebaseConfig');
const { collection, getDocs, query, where, updateDoc, doc } = require('firebase/firestore');
const { createNotification } = require('./notificationService');

/**
 * Close expired scholarships
 * Scholarships with endDate in the past and status 'Open' will be closed automatically
 */
async function closeExpiredScholarships() {
  console.log('Running scheduled task: Close expired scholarships...');

  try {
    const scholarshipsRef = collection(db, 'scholarships');
    const q = query(scholarshipsRef, where('status', '==', 'Open'));
    const snapshot = await getDocs(q);

    const now = new Date();
    let closedCount = 0;

    for (const docSnap of snapshot.docs) {
      const scholarship = docSnap.data();
      const endDate = new Date(scholarship.endDate);

      // Check if the scholarship has expired
      if (endDate < now) {
        const scholarshipRef = doc(db, 'scholarships', docSnap.id);

        await updateDoc(scholarshipRef, {
          status: 'Closed',
          closedAt: new Date().toISOString(),
          closedBy: 'system',
          closureReason: 'Application deadline passed',
          updatedAt: new Date().toISOString()
        });

        // Notify sponsor
        await createNotification(
          scholarship.sponsorUid,
          'scholarship_closed',
          'Scholarship Closed Automatically',
          `Your scholarship "${scholarship.scholarshipName}" has been automatically closed because the application deadline has passed.`,
          docSnap.id
        );

        // Notify admin
        await createNotification(
          'admin',
          'scholarship_closed',
          'Scholarship Auto-Closed',
          `"${scholarship.scholarshipName}" by ${scholarship.organizationName} was automatically closed (deadline passed).`,
          docSnap.id
        );

        closedCount++;
        console.log(`Closed scholarship: ${scholarship.scholarshipName} (${docSnap.id})`);
      }
    }

    console.log(`Scheduled task completed: ${closedCount} scholarship(s) closed.`);
    return closedCount;
  } catch (error) {
    console.error('Error in closeExpiredScholarships task:', error);
    throw error;
  }
}

/**
 * Send deadline reminders
 * Notifies sponsors when their scholarships are about to close (1 day, 3 days, 7 days before)
 */
async function sendDeadlineReminders() {
  console.log('Running scheduled task: Send deadline reminders...');

  try {
    const scholarshipsRef = collection(db, 'scholarships');
    const q = query(scholarshipsRef, where('status', '==', 'Open'));
    const snapshot = await getDocs(q);

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    let reminderCount = 0;

    for (const docSnap of snapshot.docs) {
      const scholarship = docSnap.data();
      const endDate = new Date(scholarship.endDate);
      const daysUntilDeadline = Math.ceil((endDate - now) / oneDayMs);

      // Check for reminder thresholds (1 day, 3 days, 7 days)
      const reminderDays = [1, 3, 7];

      if (reminderDays.includes(daysUntilDeadline)) {
        // Check if reminder was already sent for this period
        const reminderKey = `reminder_${daysUntilDeadline}d_sent`;
        if (!scholarship[reminderKey]) {
          // Send reminder to sponsor
          await createNotification(
            scholarship.sponsorUid,
            'deadline_reminder',
            `Deadline Reminder: ${daysUntilDeadline} day(s) left`,
            `Your scholarship "${scholarship.scholarshipName}" will close in ${daysUntilDeadline} day(s). Application deadline: ${endDate.toLocaleDateString()}.`,
            docSnap.id
          );

          // Mark reminder as sent
          const scholarshipRef = doc(db, 'scholarships', docSnap.id);
          await updateDoc(scholarshipRef, {
            [reminderKey]: new Date().toISOString()
          });

          reminderCount++;
          console.log(`Sent ${daysUntilDeadline}-day reminder for: ${scholarship.scholarshipName}`);
        }
      }
    }

    console.log(`Scheduled task completed: ${reminderCount} reminder(s) sent.`);
    return reminderCount;
  } catch (error) {
    console.error('Error in sendDeadlineReminders task:', error);
    throw error;
  }
}

/**
 * Run all scheduled tasks
 * This should be called periodically (e.g., every hour or every day)
 */
async function runAllScheduledTasks() {
  console.log('=== Running All Scheduled Tasks ===');
  console.log('Time:', new Date().toISOString());

  try {
    const closedCount = await closeExpiredScholarships();
    const reminderCount = await sendDeadlineReminders();

    console.log('=== Scheduled Tasks Summary ===');
    console.log(`Scholarships closed: ${closedCount}`);
    console.log(`Reminders sent: ${reminderCount}`);
    console.log('===============================');

    return { closedCount, reminderCount };
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
    throw error;
  }
}

/**
 * Initialize scheduled tasks with interval
 * @param {number} intervalMs - Interval in milliseconds (default: 1 hour)
 */
function initializeScheduledTasks(intervalMs = 60 * 60 * 1000) {
  console.log('Initializing scheduled tasks...');
  console.log(`Tasks will run every ${intervalMs / 60000} minutes`);

  // Run immediately on startup
  runAllScheduledTasks().catch(err => console.error('Initial scheduled task run failed:', err));

  // Set up interval for recurring runs
  setInterval(() => {
    runAllScheduledTasks().catch(err => console.error('Scheduled task run failed:', err));
  }, intervalMs);

  console.log('Scheduled tasks initialized');
}

module.exports = {
  closeExpiredScholarships,
  sendDeadlineReminders,
  runAllScheduledTasks,
  initializeScheduledTasks
};
