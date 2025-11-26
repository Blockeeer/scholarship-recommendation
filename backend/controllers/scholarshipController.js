const { db } = require("../config/firebaseConfig");
const { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc } = require("firebase/firestore");

// Show form to add scholarship offer
function showAddScholarshipForm(req, res) {
  console.log("📝 Showing add scholarship form");
  
  if (!req.session.user || req.session.user.role !== "sponsor") {
    console.log("❌ Unauthorized access");
    return res.redirect("/login");
  }

  res.render("sponsor/add_scholarship", {
    layout: "layouts/sponsor_layout",
    email: req.session.user.email
  });
}

// Submit new scholarship offer
async function addScholarshipOffer(req, res) {
  console.log("📤 Adding new scholarship offer");
  console.log("📦 Request body:", req.body);

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const sponsorUid = req.session.user.uid;
  const sponsorEmail = req.session.user.email;

  const {
    scholarshipName,
    organizationName,
    scholarshipType,
    minGPA,
    eligibleCourses,
    eligibleYearLevels,
    incomeLimit,
    requiredSkills,
    requiredDocuments,
    slotsAvailable,
    startDate,
    endDate,
    status
  } = req.body;

  // Validate required fields
  if (!scholarshipName || !organizationName || !scholarshipType || !minGPA || !slotsAvailable || !startDate || !endDate) {
    return res.status(400).send("Please fill in all required fields");
  }

  try {
    // Get sponsor's full name from users collection
    const sponsorDocRef = doc(db, "users", sponsorUid);
    const sponsorDoc = await getDoc(sponsorDocRef);
    const sponsorData = sponsorDoc.exists() ? sponsorDoc.data() : {};

    // Create scholarship data
    const scholarshipData = {
      // Scholarship Information
      scholarshipName: scholarshipName.trim(),
      organizationName: organizationName.trim(),
      scholarshipType: scholarshipType.trim(),
      
      // Qualification Criteria
      minGPA: parseFloat(minGPA),
      eligibleCourses: eligibleCourses ? eligibleCourses.split(',').map(c => c.trim()) : [],
      eligibleYearLevels: eligibleYearLevels ? eligibleYearLevels.split(',').map(y => y.trim()) : [],
      incomeLimit: incomeLimit ? incomeLimit.trim() : "",
      requiredSkills: requiredSkills ? requiredSkills.split(',').map(s => s.trim()) : [],
      
      // Document Requirements
      requiredDocuments: requiredDocuments ? requiredDocuments.split(',').map(d => d.trim()) : [],
      
      // Scholarship Capacity
      slotsAvailable: parseInt(slotsAvailable),
      slotsFilled: 0,
      
      // Duration
      startDate: startDate,
      endDate: endDate,
      
      // Status
      status: status || "Open",
      
      // Sponsor Information
      sponsorUid: sponsorUid,
      sponsorEmail: sponsorEmail,
      sponsorName: sponsorData.fullName || organizationName,
      
      // Metadata
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log("💾 Saving scholarship to Firestore...");
    
    // Add to scholarships collection
    const scholarshipsRef = collection(db, "scholarships");
    const docRef = await addDoc(scholarshipsRef, scholarshipData);

    console.log("✅ Scholarship added with ID:", docRef.id);
    
    return res.redirect("/sponsor/offers");
  } catch (err) {
    console.error("❌ Error adding scholarship:", err);
    res.status(500).send("Error adding scholarship: " + err.message);
  }
}

// View all scholarship offers by sponsor
async function viewScholarshipOffers(req, res) {
  console.log("👀 Viewing scholarship offers");

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const sponsorUid = req.session.user.uid;

  try {
    // Query scholarships by sponsor UID
    const scholarshipsRef = collection(db, "scholarships");
    const q = query(scholarshipsRef, where("sponsorUid", "==", sponsorUid));
    const querySnapshot = await getDocs(q);

    const scholarships = [];
    querySnapshot.forEach((doc) => {
      scholarships.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log("✅ Found", scholarships.length, "scholarships");

    res.render("sponsor/view_offers", {
      layout: "layouts/sponsor_layout",
      email: req.session.user.email,
      scholarships: scholarships
    });
  } catch (err) {
    console.error("❌ Error fetching scholarships:", err);
    res.status(500).send("Error loading scholarships");
  }
}

// View single scholarship details
async function viewScholarshipDetails(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check if this sponsor owns this scholarship
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    res.render("sponsor/scholarship_details", {
      layout: "layouts/sponsor_layout",
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    console.error("❌ Error fetching scholarship:", err);
    res.status(500).send("Error loading scholarship");
  }
}

// Update scholarship status (Open/Closed)
async function updateScholarshipStatus(req, res) {
  const scholarshipId = req.params.id;
  const { status } = req.body;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Update status
    await updateDoc(scholarshipRef, {
      status: status,
      updatedAt: new Date().toISOString()
    });

    console.log("✅ Scholarship status updated to:", status);
    res.redirect("/sponsor/offers");
  } catch (err) {
    console.error("❌ Error updating scholarship:", err);
    res.status(500).send("Error updating scholarship");
  }
}

// Delete scholarship
async function deleteScholarship(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    await deleteDoc(scholarshipRef);

    console.log("✅ Scholarship deleted");
    res.redirect("/sponsor/offers");
  } catch (err) {
    console.error("❌ Error deleting scholarship:", err);
    res.status(500).send("Error deleting scholarship");
  }
}

// Show edit scholarship form
async function showEditScholarshipForm(req, res) {
  const scholarshipId = req.params.id;

  console.log("📝 Showing edit scholarship form for ID:", scholarshipId);

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    res.render("sponsor/edit_scholarship", {
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    console.error("❌ Error loading scholarship for edit:", err);
    res.status(500).send("Error loading scholarship");
  }
}

// Update scholarship (full update)
async function updateScholarship(req, res) {
  const scholarshipId = req.params.id;

  console.log("📤 Updating scholarship:", scholarshipId);
  console.log("📦 Request body:", req.body);

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  const {
    scholarshipName,
    organizationName,
    scholarshipType,
    minGPA,
    eligibleCourses,
    eligibleYearLevels,
    incomeLimit,
    requiredSkills,
    requiredDocuments,
    slotsAvailable,
    startDate,
    endDate,
    status
  } = req.body;

  // Validate required fields
  if (!scholarshipName || !organizationName || !scholarshipType || !minGPA || !slotsAvailable || !startDate || !endDate) {
    return res.status(400).send("Please fill in all required fields");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const existingData = scholarshipDoc.data();

    // Check ownership
    if (existingData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // Create updated scholarship data
    const updatedScholarshipData = {
      // Scholarship Information
      scholarshipName: scholarshipName.trim(),
      organizationName: organizationName.trim(),
      scholarshipType: scholarshipType.trim(),

      // Qualification Criteria
      minGPA: parseFloat(minGPA),
      eligibleCourses: eligibleCourses ? eligibleCourses.split(',').map(c => c.trim()) : [],
      eligibleYearLevels: eligibleYearLevels ? eligibleYearLevels.split(',').map(y => y.trim()) : [],
      incomeLimit: incomeLimit ? incomeLimit.trim() : "",
      requiredSkills: requiredSkills ? requiredSkills.split(',').map(s => s.trim()) : [],

      // Document Requirements
      requiredDocuments: requiredDocuments ? requiredDocuments.split(',').map(d => d.trim()) : [],

      // Scholarship Capacity
      slotsAvailable: parseInt(slotsAvailable),
      // Keep existing slotsFilled
      slotsFilled: existingData.slotsFilled || 0,

      // Duration
      startDate: startDate,
      endDate: endDate,

      // Status
      status: status || "Open",

      // Metadata
      updatedAt: new Date().toISOString()
    };

    console.log("💾 Updating scholarship in Firestore...");

    // Update the document
    await updateDoc(scholarshipRef, updatedScholarshipData);

    console.log("✅ Scholarship updated successfully");

    return res.redirect("/sponsor/offers");
  } catch (err) {
    console.error("❌ Error updating scholarship:", err);
    res.status(500).send("Error updating scholarship: " + err.message);
  }
}

// View applications for a scholarship
async function viewScholarshipApplications(req, res) {
  const scholarshipId = req.params.id;

  if (!req.session.user || req.session.user.role !== "sponsor") {
    return res.redirect("/login");
  }

  try {
    const scholarshipRef = doc(db, "scholarships", scholarshipId);
    const scholarshipDoc = await getDoc(scholarshipRef);

    if (!scholarshipDoc.exists()) {
      return res.status(404).send("Scholarship not found");
    }

    const scholarshipData = scholarshipDoc.data();

    // Check ownership
    if (scholarshipData.sponsorUid !== req.session.user.uid) {
      return res.status(403).send("Unauthorized");
    }

    // TODO: Fetch actual applications from database
    // For now, render with sample data (the UI will show hardcoded samples)

    res.render("sponsor/applications_list", {
      email: req.session.user.email,
      scholarship: { id: scholarshipDoc.id, ...scholarshipData }
    });
  } catch (err) {
    console.error("❌ Error loading applications:", err);
    res.status(500).send("Error loading applications");
  }
}

module.exports = {
  showAddScholarshipForm,
  addScholarshipOffer,
  viewScholarshipOffers,
  viewScholarshipDetails,
  updateScholarshipStatus,
  deleteScholarship,
  showEditScholarshipForm,
  updateScholarship,
  viewScholarshipApplications
};