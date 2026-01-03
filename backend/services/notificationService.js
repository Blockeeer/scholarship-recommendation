/**
 * Notification Service
 * Handles in-app notifications for users
 */

const { db } = require("../config/firebaseConfig");
const {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc
} = require("firebase/firestore");

/**
 * Create a new notification
 * @param {string} userId - Target user's UID
 * @param {string} type - Notification type (application_update, scholarship_update, system, etc.)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} relatedId - Related document ID (optional)
 * @returns {Promise<string>} - New notification ID
 */
async function createNotification(userId, type, title, message, relatedId = null) {
  try {
    const notificationData = {
      userId,
      type,
      title,
      message,
      relatedId,
      read: false,
      createdAt: new Date().toISOString()
    };

    const notificationsRef = collection(db, "notifications");
    const newNotifRef = await addDoc(notificationsRef, notificationData);

    return newNotifRef.id;
  } catch (error) {
    throw error;
  }
}

/**
 * Get notifications for a user
 * @param {string} userId - User's UID
 * @param {number} limitCount - Maximum notifications to return
 * @returns {Promise<array>} - Array of notifications
 */
async function getUserNotifications(userId, limitCount = 50) {
  try {
    const notificationsRef = collection(db, "notifications");
    // Use only where clause to avoid composite index requirement
    const q = query(
      notificationsRef,
      where("userId", "==", userId)
    );

    const snapshot = await getDocs(q);
    const notifications = [];

    snapshot.forEach(doc => {
      notifications.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt in JavaScript (descending) and limit
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return notifications.slice(0, limitCount);
  } catch (error) {
    throw error;
  }
}

/**
 * Get unread notification count for a user
 * @param {string} userId - User's UID
 * @returns {Promise<number>} - Unread count
 */
async function getUnreadCount(userId) {
  try {
    const notificationsRef = collection(db, "notifications");
    const q = query(
      notificationsRef,
      where("userId", "==", userId),
      where("read", "==", false)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    return 0;
  }
}

/**
 * Mark a notification as read
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User's UID (for verification)
 * @returns {Promise<boolean>} - Success status
 */
async function markAsRead(notificationId, userId) {
  try {
    const notifRef = doc(db, "notifications", notificationId);
    const notifDoc = await getDoc(notifRef);

    if (!notifDoc.exists()) {
      throw new Error("Notification not found");
    }

    const notification = notifDoc.data();

    // Verify ownership
    if (notification.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await updateDoc(notifRef, { read: true });
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 * @param {string} userId - User's UID
 * @returns {Promise<number>} - Number of notifications marked
 */
async function markAllAsRead(userId) {
  try {
    const notificationsRef = collection(db, "notifications");
    const q = query(
      notificationsRef,
      where("userId", "==", userId),
      where("read", "==", false)
    );

    const snapshot = await getDocs(q);
    let count = 0;

    for (const docSnapshot of snapshot.docs) {
      await updateDoc(doc(db, "notifications", docSnapshot.id), { read: true });
      count++;
    }

    return count;
  } catch (error) {
    throw error;
  }
}

/**
 * Delete a notification
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User's UID (for verification)
 * @returns {Promise<boolean>} - Success status
 */
async function deleteNotification(notificationId, userId) {
  try {
    const notifRef = doc(db, "notifications", notificationId);
    const notifDoc = await getDoc(notifRef);

    if (!notifDoc.exists()) {
      throw new Error("Notification not found");
    }

    const notification = notifDoc.data();

    // Verify ownership
    if (notification.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await deleteDoc(notifRef);
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Send notification to multiple users
 * @param {array} userIds - Array of user UIDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} relatedId - Related document ID (optional)
 * @returns {Promise<number>} - Number of notifications sent
 */
async function sendBulkNotification(userIds, type, title, message, relatedId = null) {
  try {
    let count = 0;
    for (const userId of userIds) {
      await createNotification(userId, type, title, message, relatedId);
      count++;
    }
    return count;
  } catch (error) {
    throw error;
  }
}

/**
 * Send notification to all users with a specific role
 * @param {string} role - User role (student, sponsor, admin)
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<number>} - Number of notifications sent
 */
async function sendNotificationToRole(role, type, title, message) {
  try {
    // Get all users with the specified role
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "==", role));
    const snapshot = await getDocs(q);

    const userIds = [];
    snapshot.forEach(doc => {
      userIds.push(doc.id);
    });

    return await sendBulkNotification(userIds, type, title, message);
  } catch (error) {
    throw error;
  }
}

// Notification type constants
const NotificationTypes = {
  APPLICATION_SUBMITTED: "application_submitted",
  APPLICATION_UPDATE: "application_update",
  APPLICATION_APPROVED: "application_approved",
  APPLICATION_REJECTED: "application_rejected",
  SCHOLARSHIP_UPDATE: "scholarship_update",
  SCHOLARSHIP_NEW: "scholarship_new",
  SCHOLARSHIP_APPROVED: "scholarship_approved",
  SCHOLARSHIP_CLOSING: "scholarship_closing",
  SYSTEM: "system",
  REMINDER: "reminder"
};

module.exports = {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendBulkNotification,
  sendNotificationToRole,
  NotificationTypes
};
