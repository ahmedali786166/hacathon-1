// auth.js — MaintainIQ authentication controller
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ────────────────────────────────────────────────────────────────────────────
// Theme bootstrap (shared with dashboard)
// ────────────────────────────────────────────────────────────────────────────
const THEME_KEY = "miq-theme"
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");

const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ────────────────────────────────────────────────────────────────────────────
// Toast helper (lightweight, duplicated from app.js to keep modules independent)
// ────────────────────────────────────────────────────────────────────────────
function toast(title, msg, type = "info") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icons = { success: "✓", error: "!", info: "i" };
  el.innerHTML = `
    <div class="toast-icon">${icons[type] || "i"}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`;
  stack.appendChild(el);
  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 260);
  };
  el.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, 4200);
}

// ────────────────────────────────────────────────────────────────────────────
// UI refs
// ────────────────────────────────────────────────────────────────────────────
const form = document.getElementById("authForm");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const submitLabel = document.getElementById("submitLabel");
const authTitle = document.getElementById("authTitle");
const authSub = document.getElementById("authSub");
const switchMode = document.getElementById("switchMode");
const switchText = document.getElementById("switchText");
const authError = document.getElementById("authError");
const submitBtn = document.getElementById("authSubmit");

let isSignup = false;

function setMode(signup) {
  isSignup = signup;
  nameField.style.display = signup ? "flex" : "none";
  nameInput.required = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  authTitle.textContent = signup ? "Create your account" : "Welcome back";
  authSub.textContent = signup
    ? "Join the MaintainIQ maintenance operations team."
    : "Sign in to access the maintenance control panel.";
  submitLabel.textContent = signup ? "Create account" : "Sign in";
  switchText.textContent = signup ? "Already have an account?" : "New to MaintainIQ?";
  switchMode.textContent = signup ? "Sign in instead" : "Create an account";
  hideError();
}

switchMode.addEventListener("click", () => setMode(!isSignup));

function showError(msg) {
  authError.textContent = msg;
  authError.classList.add("show");
}
function hideError() {
  authError.classList.remove("show");
}
emailInput.addEventListener("input", hideError);
passwordInput.addEventListener("input", hideError);

function setLoading(loading) {
  if (loading) {
    submitBtn.disabled = true;
    submitLabel.innerHTML = '<span class="spinner"></span>';
  } else {
    submitBtn.disabled = false;
    submitLabel.textContent = isSignup ? "Create account" : "Sign in";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Submit handler
// ────────────────────────────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;
  setLoading(true);
  try {
    if (isSignup) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      toast("Account created", "Welcome to MaintainIQ.", "success");
      // onAuthStateChanged will redirect; fall through just in case
      redirectWhenReady(cred.user);
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      toast("Signed in", "Redirecting to control panel…", "success");
      redirectWhenReady(cred.user);
    }
  } catch (err) {
    const map = {
      "auth/invalid-email": "That email address looks invalid.",
      "auth/user-not-found": "No account found for that email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/email-already-in-use": "An account already exists for this email.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Try again shortly.",
      "auth/network-request-failed": "Network error. Check your connection.",
    };
    showError(map[err.code] || err.message || "Authentication failed.");
    setLoading(false);
  }
});

function redirectWhenReady(user) {
  // Give the toast a beat, then go to dashboard
  setTimeout(() => {
    window.location.href = "dashboard.html";
  }, 350);
}

// ────────────────────────────────────────────────────────────────────────────
// Auth state gate — if already signed in, skip straight to dashboard
// ────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Already authenticated — redirect away from the auth page
    window.location.replace("dashboard.html");
  }
});
