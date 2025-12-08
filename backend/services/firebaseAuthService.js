const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const { auth, db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc } = require("firebase/firestore");

const registerUser = async (email, password, role, additionalData = {}) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Save user data in Firestore using UID as document ID
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: email,
      role: role,
      fullName: additionalData.fullName || "",
      createdAt: new Date().toISOString(),
      hasCompletedAssessment: false
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

module.exports = { registerUser, loginUser, logoutUser, initializeAdmin };