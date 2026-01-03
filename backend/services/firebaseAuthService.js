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
    } catch (verificationError) {
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

    return user;
  } catch (error) {
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
      // User exists in Auth but not in Firestore - check if there's a linked Google account
      const { collection, query, where, getDocs, updateDoc } = require("firebase/firestore");
      const usersRef = collection(db, "users");
      const emailQuery = query(usersRef, where("email", "==", email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        // Found existing Firestore document with this email (Google account)
        const existingDoc = emailSnapshot.docs[0];
        const existingData = existingDoc.data();
        const existingUid = existingDoc.id;


        // Update existing document to support both methods
        await updateDoc(doc(db, "users", existingUid), {
          emailPasswordUid: user.uid,
          authProvider: "both"
        });

        // Create reference document for email/password UID
        await setDoc(doc(db, "users", user.uid), {
          linkedTo: existingUid,
          email: email,
          role: existingData.role,
          fullName: existingData.fullName || "",
          createdAt: existingData.createdAt,
          hasCompletedAssessment: existingData.hasCompletedAssessment || false,
          emailVerified: true,
          authProvider: "email",
          isLinkedAccount: true
        });


        return {
          user,
          role: existingData.role,
          userData: existingData
        };
      }

      // Truly new user - create the document
      userData = {
        uid: user.uid,
        email: user.email,
        role: defaultRole,
        fullName: "",
        createdAt: new Date().toISOString(),
        hasCompletedAssessment: false,
        authProvider: "email"
      };

      try {
        await setDoc(doc(db, "users", user.uid), userData);
      } catch (firestoreError) {
        const error = new Error("User data not found and could not be created. Check Firestore rules.");
        error.code = "auth/user-data-not-found";
        throw error;
      }
    } else {
      userData = docSnap.data();

      // Check if this is a linked account reference
      if (userData.linkedTo) {
        const mainDocSnap = await getDoc(doc(db, "users", userData.linkedTo));
        if (mainDocSnap.exists()) {
          const mainUserData = mainDocSnap.data();
          return {
            user,
            role: mainUserData.role,
            userData: mainUserData
          };
        }
      }

      // If this account was created via Google but now logging in with password,
      // update authProvider to "both"
      if (userData.authProvider === "google") {
        const { updateDoc } = require("firebase/firestore");
        await updateDoc(doc(db, "users", user.uid), {
          authProvider: "both"
        });
        userData.authProvider = "both";
      }
    }


    return {
      user,
      role: userData.role,
      userData: userData
    };
  } catch (error) {
    throw error; // Throw original error to preserve error.code
  }
};

const logoutUser = async () => {
  try {
    await signOut(auth);
    return { message: "User logged out successfully" };
  } catch (error) {
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

    return { success: true, uid: user.uid };
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      return { success: true, message: "Admin already exists" };
    }
    throw error;
  }
};

/**
 * Handle Google Sign-In - process user info from frontend
 * Since the frontend already authenticated with Google via Firebase popup,
 * we just need to check/create the Firestore document
 * Supports linking: if email already exists with email/password, link the accounts
 * @param {object} googleUser - User info from frontend (uid, email, displayName)
 * @param {string} role - User role (student or sponsor)
 */
const signInWithGoogle = async (googleUser, role = "student") => {
  try {
    const { uid, email, displayName } = googleUser;

    if (!uid || !email) {
      throw new Error("Invalid Google user data");
    }

    // Check if user already exists in Firestore by UID
    const docSnap = await getDoc(doc(db, "users", uid));

    if (!docSnap.exists()) {
      // Check if email already exists with different auth method (email/password)
      const { collection, query, where, getDocs } = require("firebase/firestore");
      const usersRef = collection(db, "users");
      const emailQuery = query(usersRef, where("email", "==", email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        // Email exists with different UID (email/password account)
        // Update that existing account to support Google login
        const existingDoc = emailSnapshot.docs[0];
        const existingData = existingDoc.data();
        const existingUid = existingDoc.id;


        // Update existing document to add Google UID reference
        const { updateDoc } = require("firebase/firestore");
        await updateDoc(doc(db, "users", existingUid), {
          googleUid: uid,
          authProvider: "both", // Now supports both methods
          emailVerified: true
        });

        // Also create a reference document for the Google UID pointing to the main account
        await setDoc(doc(db, "users", uid), {
          linkedTo: existingUid,
          email: email,
          role: existingData.role,
          fullName: existingData.fullName || displayName || "",
          createdAt: existingData.createdAt,
          hasCompletedAssessment: existingData.hasCompletedAssessment || false,
          emailVerified: true,
          authProvider: "google",
          isLinkedAccount: true
        });


        return {
          user: googleUser,
          role: existingData.role,
          userData: existingData,
          isNewUser: false
        };
      }

      // Truly new user - create document in Firestore
      const newUserData = {
        uid: uid,
        email: email,
        role: role,
        fullName: displayName || "",
        createdAt: new Date().toISOString(),
        hasCompletedAssessment: false,
        emailVerified: true, // Google accounts are already verified
        authProvider: "google"
      };

      await setDoc(doc(db, "users", uid), newUserData);

      return {
        user: googleUser,
        role: role,
        userData: newUserData,
        isNewUser: true
      };
    } else {
      // Existing user - return their data
      const userData = docSnap.data();

      // Check if this is a linked account reference
      if (userData.linkedTo) {
        const mainDocSnap = await getDoc(doc(db, "users", userData.linkedTo));
        if (mainDocSnap.exists()) {
          const mainUserData = mainDocSnap.data();
          return {
            user: googleUser,
            role: mainUserData.role,
            userData: mainUserData,
            isNewUser: false
          };
        }
      }


      return {
        user: googleUser,
        role: userData.role,
        userData: userData,
        isNewUser: false
      };
    }
  } catch (error) {
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
    return { success: true, message: "Password reset email sent" };
  } catch (error) {
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
    return { success: true, message: "Verification email sent" };
  } catch (error) {
    throw error;
  }
};

/**
 * Update user's auth provider status in Firestore after linking email/password
 * Called after frontend successfully links email/password to Google account
 * @param {string} uid - User's UID
 */
const updateAuthProviderStatus = async (uid) => {
  try {
    const { updateDoc } = require("firebase/firestore");
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error("User document not found");
    }

    await updateDoc(userRef, {
      authProvider: "both",
      updatedAt: new Date().toISOString()
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Set password for a Google-only user
 * Creates a separate email/password account and links it in Firestore
 * @param {string} googleUid - The Google user's UID
 * @param {string} email - User's email
 * @param {string} password - The new password
 */
const setPasswordForGoogleUser = async (googleUid, email, password) => {
  try {
    const { updateDoc } = require("firebase/firestore");

    // Get the Google user's Firestore document
    const googleUserRef = doc(db, "users", googleUid);
    const googleUserDoc = await getDoc(googleUserRef);

    if (!googleUserDoc.exists()) {
      throw new Error("User not found");
    }

    const googleUserData = googleUserDoc.data();

    // Check if already has both providers
    if (googleUserData.authProvider === "both") {
      throw new Error("Password already set for this account");
    }

    // Check if authProvider is google
    if (googleUserData.authProvider !== "google") {
      throw new Error("This feature is only for Google-only accounts");
    }

    // Try to create a new email/password account in Firebase Auth
    let emailPasswordUser;
    let isExistingAccount = false;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      emailPasswordUser = userCredential.user;
    } catch (createError) {
      if (createError.code === "auth/email-already-in-use") {
        // Email already has an account - try to sign in with the provided password
        // This handles the case where user previously created an email/password account
        // or a linked account already exists

        try {
          // Try to sign in with the new password to see if it works
          const signInResult = await signInWithEmailAndPassword(auth, email, password);
          emailPasswordUser = signInResult.user;
          isExistingAccount = true;
        } catch (signInError) {
          // Can't sign in - password doesn't match existing account
          // The user needs to use password reset for the existing account
          throw new Error("An email/password account already exists with a different password. Please use 'Forgot Password' to reset it, or enter the correct existing password.");
        }
      } else {
        throw createError;
      }
    }

    // Update the Google user's document to mark as supporting both methods
    await updateDoc(googleUserRef, {
      authProvider: "both",
      emailPasswordUid: emailPasswordUser.uid,
      updatedAt: new Date().toISOString()
    });

    // Create or update a reference document for the email/password UID
    const emailPasswordUserRef = doc(db, "users", emailPasswordUser.uid);
    const existingEmailDoc = await getDoc(emailPasswordUserRef);

    if (!existingEmailDoc.exists() || !existingEmailDoc.data().linkedTo) {
      // Only create/update if not already properly linked
      await setDoc(emailPasswordUserRef, {
        linkedTo: googleUid,
        email: email,
        role: googleUserData.role,
        fullName: googleUserData.fullName || "",
        createdAt: googleUserData.createdAt,
        hasCompletedAssessment: googleUserData.hasCompletedAssessment || false,
        emailVerified: true,
        authProvider: "email",
        isLinkedAccount: true
      }, { merge: true });
    }


    return { success: true, message: "Password set successfully" };
  } catch (error) {
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
  updateAuthProviderStatus,
  setPasswordForGoogleUser,
  googleProvider
};