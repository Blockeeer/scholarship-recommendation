/**
 * GPT Matching Service
 * Uses OpenAI GPT API for scholarship matching and applicant ranking
 */

require("dotenv").config();

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const GPT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // Use gpt-4o-mini for cost efficiency

/**
 * Call OpenAI GPT API
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User request/data
 * @returns {Promise<object>} - GPT response
 */
async function callGPTAPI(systemPrompt, userPrompt) {
  if (!OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not configured");
    throw new Error("OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.");
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ GPT API Error:", errorData);
      throw new Error(`GPT API Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error calling GPT API:", error);
    throw error;
  }
}

/**
 * Match student to available scholarships
 * @param {object} studentAssessment - Student's assessment data
 * @param {array} scholarships - Array of available scholarships
 * @returns {Promise<array>} - Array of matches with scores and explanations
 */
async function matchStudentToScholarships(studentAssessment, scholarships) {
  console.log("🤖 Starting GPT matching for student...");

  const systemPrompt = `You are a scholarship matching expert. Your task is to analyze a student's profile and match them with ALL available scholarships.

For each scholarship, evaluate the student's fit based on:
1. GPA requirement match (student GPA vs minimum required)
2. Course/program eligibility (student course vs eligible courses)
3. Year level eligibility (student year vs eligible years)
4. Financial need (student income range vs scholarship income limit)
5. Skills match (student skills vs required skills)
6. Overall scholarship type fit (Merit, Need-based, etc.)

Provide a personalized match score (0-100) and a specific explanation for each scholarship based on THIS student's unique profile.

CRITICAL RULES:
- You MUST evaluate and return ALL scholarships provided - do not skip any
- Each explanation should be personalized to this specific student
- Return your response as a valid JSON array only, with no additional text
- Even low-match scholarships should be included with appropriate scores`;

  const userPrompt = `
Student Profile:
- Full Name: ${studentAssessment.fullName}
- Course: ${studentAssessment.course}
- Year Level: ${studentAssessment.yearLevel}
- GPA: ${studentAssessment.gpa}
- Income Range: ${studentAssessment.incomeRange}
- Skills: ${studentAssessment.skills || "Not specified"}
- Scholarship Type Preference: ${studentAssessment.scholarshipType}
- Extracurricular Involvement: ${studentAssessment.involvement || "Not specified"}

Available Scholarships:
${JSON.stringify(scholarships.map(s => ({
  id: s.id,
  name: s.scholarshipName,
  organization: s.organizationName,
  type: s.scholarshipType,
  minGPA: s.minGPA,
  eligibleCourses: s.eligibleCourses,
  eligibleYearLevels: s.eligibleYearLevels,
  incomeLimit: s.incomeLimit,
  requiredSkills: s.requiredSkills,
  slotsAvailable: s.slotsAvailable - (s.slotsFilled || 0)
})), null, 2)}

Return a JSON array with the following structure for EVERY scholarship provided (do not skip any):
[
  {
    "scholarshipId": "id",
    "scholarshipName": "name",
    "matchScore": 85,
    "eligible": true,
    "matchDetails": {
      "gpaMatch": true,
      "courseMatch": true,
      "yearLevelMatch": true,
      "incomeMatch": true,
      "skillsMatch": true
    },
    "explanation": "Brief explanation of why this is a good/poor match for this specific student",
    "recommendation": "Highly Recommended" | "Recommended" | "Consider" | "Not Recommended"
  }
]

IMPORTANT: You MUST include ALL scholarships in your response, even if they are not a perfect match. Provide a matchScore for each one based on how well the student fits. Sort by matchScore descending.`;

  try {
    const gptResponse = await callGPTAPI(systemPrompt, userPrompt);

    // Parse the JSON response
    let matches;
    try {
      // Try to extract JSON from the response
      const jsonMatch = gptResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        matches = JSON.parse(jsonMatch[0]);
      } else {
        matches = JSON.parse(gptResponse);
      }
    } catch (parseError) {
      console.error("❌ Error parsing GPT response:", parseError);
      console.log("Raw response:", gptResponse);
      // Return fallback basic matching
      return performBasicMatching(studentAssessment, scholarships);
    }

    console.log(`✅ GPT matching complete. Found ${matches.length} matches.`);
    return matches;
  } catch (error) {
    console.error("❌ GPT matching failed, falling back to basic matching:", error);
    return performBasicMatching(studentAssessment, scholarships);
  }
}

/**
 * Rank applicants for a scholarship using GPT
 * @param {array} applications - Array of applications with student data
 * @param {object} scholarship - Scholarship details and criteria
 * @returns {Promise<array>} - Ranked array of applications
 */
async function rankApplicantsForScholarship(applications, scholarship) {
  console.log(`🤖 Starting GPT ranking for ${applications.length} applicants...`);

  if (applications.length === 0) {
    return [];
  }

  const systemPrompt = `You are a scholarship selection expert. Your task is to rank applicants for a scholarship based on their profiles and the scholarship criteria.

Evaluate each applicant based on:
1. Academic performance (GPA)
2. Course relevance
3. Financial need
4. Skills and qualifications
5. Application letter/essay quality
6. Overall fit with scholarship goals

Provide a ranking score (0-100) for each applicant with detailed reasoning.

IMPORTANT: Return your response as a valid JSON array only, with no additional text.`;

  const userPrompt = `
Scholarship Details:
- Name: ${scholarship.scholarshipName}
- Type: ${scholarship.scholarshipType}
- Organization: ${scholarship.organizationName}
- Required GPA: ${scholarship.minGPA}
- Eligible Courses: ${scholarship.eligibleCourses?.join(", ") || "All"}
- Eligible Year Levels: ${scholarship.eligibleYearLevels?.join(", ") || "All"}
- Income Limit: ${scholarship.incomeLimit || "No limit"}
- Required Skills: ${scholarship.requiredSkills?.join(", ") || "None specified"}
- Available Slots: ${scholarship.slotsAvailable - (scholarship.slotsFilled || 0)}

Applicants:
${JSON.stringify(applications.map(app => ({
  applicationId: app.id,
  studentName: app.studentName,
  course: app.course,
  yearLevel: app.yearLevel,
  gpa: app.gpa,
  incomeRange: app.incomeRange,
  skills: app.skills,
  applicationLetter: app.applicationLetter || app.essayReason,
  involvement: app.involvement
})), null, 2)}

Return a JSON array ranked from highest to lowest score:
[
  {
    "applicationId": "id",
    "studentName": "name",
    "rankScore": 95,
    "rank": 1,
    "eligible": true,
    "scoreBreakdown": {
      "academicScore": 90,
      "financialNeedScore": 85,
      "skillsScore": 92,
      "essayScore": 88,
      "overallFitScore": 90
    },
    "strengths": ["High GPA", "Relevant skills"],
    "weaknesses": ["No extracurricular activities"],
    "recommendation": "Highly Recommended for Approval"
  }
]`;

  try {
    const gptResponse = await callGPTAPI(systemPrompt, userPrompt);

    let rankings;
    try {
      const jsonMatch = gptResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rankings = JSON.parse(jsonMatch[0]);
      } else {
        rankings = JSON.parse(gptResponse);
      }
    } catch (parseError) {
      console.error("❌ Error parsing GPT ranking response:", parseError);
      return performBasicRanking(applications, scholarship);
    }

    // Sort by rankScore descending and assign ranks
    rankings.sort((a, b) => b.rankScore - a.rankScore);
    rankings.forEach((r, index) => {
      r.rank = index + 1;
    });

    console.log(`✅ GPT ranking complete.`);
    return rankings;
  } catch (error) {
    console.error("❌ GPT ranking failed, falling back to basic ranking:", error);
    return performBasicRanking(applications, scholarship);
  }
}

/**
 * Generate a detailed recommendation explanation
 * @param {object} student - Student profile
 * @param {object} scholarship - Scholarship details
 * @returns {Promise<string>} - Detailed explanation
 */
async function generateRecommendationExplanation(student, scholarship) {
  const systemPrompt = `You are a helpful scholarship advisor. Provide a clear, encouraging explanation of why a scholarship is or isn't a good fit for a student. Be specific and actionable.`;

  const userPrompt = `
Student: ${student.fullName}
- Course: ${student.course}
- Year: ${student.yearLevel}
- GPA: ${student.gpa}
- Income Range: ${student.incomeRange}
- Skills: ${student.skills || "Not specified"}

Scholarship: ${scholarship.scholarshipName}
- Type: ${scholarship.scholarshipType}
- Required GPA: ${scholarship.minGPA}
- Eligible Courses: ${scholarship.eligibleCourses?.join(", ") || "All"}
- Required Skills: ${scholarship.requiredSkills?.join(", ") || "None"}

Provide a 2-3 sentence explanation of whether this scholarship is a good fit and why.`;

  try {
    const explanation = await callGPTAPI(systemPrompt, userPrompt);
    return explanation;
  } catch (error) {
    console.error("❌ Error generating explanation:", error);
    return "Unable to generate detailed explanation at this time.";
  }
}

/**
 * Fallback: Basic matching without GPT
 * @param {object} studentAssessment - Student data
 * @param {array} scholarships - Available scholarships
 * @returns {array} - Basic matches
 */
function performBasicMatching(studentAssessment, scholarships) {
  console.log("📊 Performing basic matching (fallback)...");

  const matches = [];

  for (const scholarship of scholarships) {
    let matchScore = 50; // Base score
    const matchDetails = {
      gpaMatch: true,
      courseMatch: true,
      yearLevelMatch: true,
      incomeMatch: true,
      skillsMatch: true
    };

    // GPA check
    const studentGPA = parseFloat(studentAssessment.gpa) || 0;
    const minGPA = parseFloat(scholarship.minGPA) || 0;
    if (studentGPA >= minGPA) {
      matchScore += 15;
    } else {
      matchDetails.gpaMatch = false;
      matchScore -= 20;
    }

    // Course check
    if (scholarship.eligibleCourses && scholarship.eligibleCourses.length > 0) {
      const courseMatches = scholarship.eligibleCourses.some(
        course => studentAssessment.course?.toLowerCase().includes(course.toLowerCase()) ||
                  course.toLowerCase().includes(studentAssessment.course?.toLowerCase() || "")
      );
      if (courseMatches) {
        matchScore += 15;
      } else {
        matchDetails.courseMatch = false;
        matchScore -= 15;
      }
    } else {
      matchScore += 10; // All courses eligible
    }

    // Year level check
    if (scholarship.eligibleYearLevels && scholarship.eligibleYearLevels.length > 0) {
      const yearMatches = scholarship.eligibleYearLevels.some(
        year => studentAssessment.yearLevel?.includes(year) || year.includes(studentAssessment.yearLevel || "")
      );
      if (yearMatches) {
        matchScore += 10;
      } else {
        matchDetails.yearLevelMatch = false;
        matchScore -= 10;
      }
    } else {
      matchScore += 5;
    }

    // Scholarship type preference match
    if (studentAssessment.scholarshipType === scholarship.scholarshipType) {
      matchScore += 10;
    }

    // Ensure score is between 0 and 100
    matchScore = Math.max(0, Math.min(100, matchScore));

    // Include ALL scholarships with their match scores
    let recommendation = "Not Recommended";
    if (matchScore >= 80) recommendation = "Highly Recommended";
    else if (matchScore >= 60) recommendation = "Recommended";
    else if (matchScore >= 40) recommendation = "Consider";

    matches.push({
      scholarshipId: scholarship.id,
      scholarshipName: scholarship.scholarshipName,
      matchScore,
      eligible: matchDetails.gpaMatch && matchDetails.courseMatch,
      matchDetails,
      explanation: `Based on your profile, this scholarship has a ${matchScore}% match score.`,
      recommendation
    });
  }

  // Sort by match score
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches;
}

/**
 * Fallback: Basic ranking without GPT
 * @param {array} applications - Applications to rank
 * @param {object} scholarship - Scholarship criteria
 * @returns {array} - Basic rankings
 */
function performBasicRanking(applications, scholarship) {
  console.log("📊 Performing basic ranking (fallback)...");

  const rankings = applications.map(app => {
    let rankScore = 50;

    // GPA score (40% weight)
    const gpa = parseFloat(app.gpa) || 0;
    const minGPA = parseFloat(scholarship.minGPA) || 0;
    if (gpa >= minGPA) {
      rankScore += (gpa / 4.0) * 40; // Assuming 4.0 scale
    }

    // Financial need score (20% weight) - Lower income gets higher score
    const incomeRanges = ["Below ₱10,000", "₱10,000 - ₱20,000", "₱20,000 - ₱30,000", "₱30,000 - ₱50,000", "Above ₱50,000"];
    const incomeIndex = incomeRanges.indexOf(app.incomeRange);
    if (incomeIndex !== -1) {
      rankScore += (5 - incomeIndex) * 4; // Lower income = higher score
    }

    // Ensure score is between 0 and 100
    rankScore = Math.max(0, Math.min(100, Math.round(rankScore)));

    return {
      applicationId: app.id,
      studentName: app.studentName,
      rankScore,
      eligible: gpa >= minGPA,
      scoreBreakdown: {
        academicScore: Math.round((gpa / 4.0) * 100),
        financialNeedScore: incomeIndex !== -1 ? (5 - incomeIndex) * 20 : 50,
        skillsScore: 50,
        essayScore: 50,
        overallFitScore: rankScore
      },
      strengths: gpa >= 3.5 ? ["Strong academic performance"] : [],
      weaknesses: gpa < minGPA ? ["GPA below requirement"] : [],
      recommendation: rankScore >= 70 ? "Recommended for Approval" : "Needs Review"
    };
  });

  // Sort by rank score descending
  rankings.sort((a, b) => b.rankScore - a.rankScore);

  // Assign ranks
  rankings.forEach((r, index) => {
    r.rank = index + 1;
  });

  return rankings;
}

module.exports = {
  callGPTAPI,
  matchStudentToScholarships,
  rankApplicantsForScholarship,
  generateRecommendationExplanation,
  performBasicMatching,
  performBasicRanking
};
