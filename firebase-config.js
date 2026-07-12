import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ────────────────────────────────────────────────────────────────────────────
// Firebase project configuration
// ────────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyAI0xrA78QSsOylDeLk9L5P9iG4AypJyOk",
  authDomain: "hacathon-d2203.firebaseapp.com",
  projectId: "hacathon-d2203",
  storageBucket: "hacathon-d2203.firebasestorage.app",
  messagingSenderId: "535809400337",
  appId: "1:535809400337:web:bbf01e1caade22300b1bb0",
  measurementId: "G-SXPBHDL0LP"
};

// ────────────────────────────────────────────────────────────────────────────
// Initialize core services
// ────────────────────────────────────────────────────────────────────────────
export const app = initializeApp(firebaseConfig);

// Auth — persist session in localStorage so refresh keeps the user signed in
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("[MaintainIQ] Auth persistence could not be set:", err);
});

// Firestore — try offline-capable cache; fall back to default if unsupported
let db;
try {
  db = initializeFirestore(app, {
    cache: persistentLocalCache(),
  });
} catch (e) {
  db = getFirestore(app);
}
export { db };

// ────────────────────────────────────────────────────────────────────────────
// Firestore collection names
// ────────────────────────────────────────────────────────────────────────────
export const COLLECTIONS = {
  ASSETS: "assets",
  ISSUES: "issues",
  USERS: "users",
};

// ────────────────────────────────────────────────────────────────────────────
// Shared status / priority constants
// ────────────────────────────────────────────────────────────────────────────
export const STATUS_FLOW = ["Reported", "In Progress", "Resolved"];
export const PRIORITY_LEVELS = ["Low", "Medium", "High"];