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

const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user data from Firestore using UID
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (!docSnap.exists()) {
      const error = new Error("User data not found in Firestore");
      error.code = "auth/user-data-not-found";
      throw error;
    }

    const userData = docSnap.data();
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

module.exports = { registerUser, loginUser, logoutUser };