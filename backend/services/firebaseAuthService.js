const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential
} = require("firebase/auth");
const { auth, db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc } = require("firebase/firestore");

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

const registerUser = async (email, password, role, additionalData = {}) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Send email verification
    try {
      await sendEmailVerification(user);
      console.log("📧 Verification email sent to:", email);
    } catch (verificationError) {
      console.error("⚠️ Failed to send verification email:", verificationError);
      // Continue with registration even if verification email fails
    }

    // Save user data in Firestore using UID as document ID
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: email,
      role: role,
      fullName: additionalData.fullName || "",
      createdAt: new Date().toISOString(),
      hasCompletedAssessment: false,
      emailVerified: false
    });

    console.log("✅ User registered with UID:", user.uid);
    return user;
  } catch (error) {
    console.error("❌ Registration error:", error);
    throw error; // Throw original error to preserve error.code
  }
};

const loginUser = async (email, password, defaultRole = "student") => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user data from Firestore using UID
    const docSnap = await getDoc(doc(db, "users", user.uid));

    let userData;
    if (!docSnap.exists()) {
      // User exists in Auth but not in Firestore - create the document
      console.log("⚠️ User document missing in Firestore, creating now...");
      userData = {
        uid: user.uid,
        email: user.email,
        role: defaultRole,
        fullName: "",
        createdAt: new Date().toISOString(),
        hasCompletedAssessment: false
      };

      try {
        await setDoc(doc(db, "users", user.uid), userData);
        console.log("✅ Created missing user document in Firestore");
      } catch (firestoreError) {
        console.error("❌ Failed to create user document:", firestoreError);
        const error = new Error("User data not found and could not be created. Check Firestore rules.");
        error.code = "auth/user-data-not-found";
        throw error;
      }
    } else {
      userData = docSnap.data();
    }

    console.log("✅ User logged in - UID:", user.uid, "Role:", userData.role);

    return {
      user,
      role: userData.role,
      userData: userData
    };
  } catch (error) {
    console.error("❌ Login error:", error);
    throw error; // Throw original error to preserve error.code
  }
};

const logoutUser = async () => {
  try {
    await signOut(auth);
    console.log("✅ User logged out");
    return { message: "User logged out successfully" };
  } catch (error) {
    console.error("❌ Logout error:", error);
    throw error; // Throw original error to preserve error.code
  }
};

// Initialize admin account (one-time setup)
const initializeAdmin = async () => {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123";

  try {
    // Try to create admin in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    const user = userCredential.user;

    // Save admin data in Firestore
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: adminEmail,
      role: "admin",
      fullName: "System Administrator",
      createdAt: new Date().toISOString(),
      hasCompletedAssessment: true
    });

    console.log("✅ Admin account created successfully with UID:", user.uid);
    return { success: true, uid: user.uid };
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      console.log("ℹ️ Admin account already exists");
      return { success: true, message: "Admin already exists" };
    }
    console.error("❌ Failed to create admin:", error);
    throw error;
  }
};

/**
 * Handle Google Sign-In with ID token from frontend
 * @param {string} idToken - Google ID token from frontend OAuth
 * @param {string} role - User role (student or sponsor)
 * @param {string} fullName - User's full name from Google profile
 */
const signInWithGoogle = async (idToken, role = "student", fullName = "") => {
  try {
    // Create credential from ID token
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    // Check if user already exists in Firestore
    const docSnap = await getDoc(doc(db, "users", user.uid));

    if (!docSnap.exists()) {
      // New user - create document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        role: role,
        fullName: fullName || user.displayName || "",
        createdAt: new Date().toISOString(),
        hasCompletedAssessment: false,
        emailVerified: true, // Google accounts are already verified
        authProvider: "google"
      });
      console.log("✅ New Google user registered with UID:", user.uid);

      return {
        user,
        role: role,
        userData: {
          uid: user.uid,
          email: user.email,
          role: role,
          fullName: fullName || user.displayName || "",
          emailVerified: true
        },
        isNewUser: true
      };
    } else {
      // Existing user - return their data
      const userData = docSnap.data();
      console.log("✅ Existing Google user logged in - UID:", user.uid);

      return {
        user,
        role: userData.role,
        userData: userData,
        isNewUser: false
      };
    }
  } catch (error) {
    console.error("❌ Google sign-in error:", error);
    throw error;
  }
};

/**
 * Send password reset email
 * @param {string} email - User's email address
 */
const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
    console.log("📧 Password reset email sent to:", email);
    return { success: true, message: "Password reset email sent" };
  } catch (error) {
    console.error("❌ Password reset error:", error);
    throw error;
  }
};

/**
 * Resend verification email to current user
 */
const resendVerificationEmail = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No user is currently signed in");
    }

    await sendEmailVerification(user);
    console.log("📧 Verification email resent to:", user.email);
    return { success: true, message: "Verification email sent" };
  } catch (error) {
    console.error("❌ Resend verification error:", error);
    throw error;
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  initializeAdmin,
  signInWithGoogle,
  resetPassword,
  resendVerificationEmail,
  googleProvider
};