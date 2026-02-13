/**
 * Firebase Configuration - SINGLE SOURCE OF TRUTH
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
  apiKey: "AIzaSyB_OXB7ZayMsFNlm_111acbBw2woyc6m8M",
  authDomain: "appointments-transvortex.firebaseapp.com",
  projectId: "appointments-transvortex",
  storageBucket: "appointments-transvortex.firebasestorage.app",
  messagingSenderId: "426663884080",
  appId: "1:426663884080:web:8bdbfe1915e3bab89d44f5"
};

/**
 * Admin User IDs - Four administrators
 */
export const ADMIN_UIDS = [
  "VhjWQiYKVGUrDVuOQUSJHA15Blk2", // Admin 1
  "9tcBBsCcdqOWHc06otNpHq8XAxW2", // Admin 2
  "FdZgEWNvKTUeDZuwGzKIxvAuECy2", // Admin 3
  "7wY8ayldIygdA9wbJspCoOgZteo1"  // Admin 4
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
    throw new Error("Firebase config not set. Please update src/firebase/firebase-config.js");
  }
  
  if (firebaseConfig.projectId !== "appointments-transvortex") {
    throw new Error(`Invalid project ID: ${firebaseConfig.projectId}`);
  }
  
  return true;
}
