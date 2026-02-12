/**
 * Firebase Configuration - SINGLE SOURCE OF TRUTH
 * 
 * This file is imported by both:
 * - src/invoice.js (ES module)
 * - src/core/app.js (ES module)
 * - And referenced by script.js for non-module access
 * 
 * ⚠️ SETUP INSTRUCTIONS:
 * 1. Go to: https://console.firebase.google.com/project/appointments-transvortex
 * 2. Click ⚙️ Project Settings (top-left)
 * 3. Scroll to "Your apps" → find "Web" app
 * 4. Click "</> Code" to copy the firebaseConfig object
 * 5. Replace the YOUR_* values below with your actual project config
 * 6. Ensure projectId is: "appointments-transvortex"
 * 7. Test by opening index.html or invoice.html and checking browser console
 */

export const firebaseConfig = {
  apiKey: "AIzaSyDHBcoZWlAitqA29JC7jviABaiOjE6PcuY",
  authDomain: "appoiments-transvortex.firebaseapp.com",
  projectId: "appoiments-transvortex",
  storageBucket: "appoiments-transvortex.firebasestorage.app",
  messagingSenderId: "48926669789",
  appId: "1:48926669789:web:f45caa8df57667d28b5434"
};

/**
 * Admin User IDs - Three administrators
 * Update these with actual admin UIDs from Firebase Console
 */
export const ADMIN_UIDS = [
  "VhjWQiYKVGUrDVuOQUSJHA15Blk2", // Admin 1
  "9tcBBsCcdqOWHc06otNpHq8XAxW2", // Admin 2
  "FdZgEWNvKTUeDZuwGzKIxvAuECy2"  // Admin 3
];

/**
 * Validate Firebase configuration
 * @throws {Error} If configuration is invalid
 */
export function validateFirebaseConfig() {
  if (
    firebaseConfig.apiKey === "YOUR_API_KEY_HERE" ||
    !firebaseConfig.apiKey.startsWith("AIzaSy")
  ) {
    console.error("❌ FIREBASE CONFIG NOT SET!");
    console.error("Please update src/config/firebase.config.js with your project credentials.");
    console.error("Instructions are at the top of the file.");
    throw new Error("Invalid Firebase configuration");
  }

  if (firebaseConfig.projectId !== "appointments-transvortex") {
    console.warn("⚠️ WARNING: Using different Firebase project:", firebaseConfig.projectId);
  }

  console.log("✅ Firebase configuration validated for project:", firebaseConfig.projectId);
}
