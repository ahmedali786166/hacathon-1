// app.js — MaintainIQ control panel + public asset view controller
import {
  auth,
  db,
  COLLECTIONS,
  STATUS_FLOW,
  PRIORITY_LEVELS,
} from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ────────────────────────────────────────────────────────────────────────────
// Technicians roster
// ────────────────────────────────────────────────────────────────────────────
const TECHNICIANS = ["Alex Rivera", "Priya Nair", "Marcus Webb", "Sofia Andersson"];

// ────────────────────────────────────────────────────────────────────────────
// Theme
// ────────────────────────────────────────────────────────────────────────────
const THEME_KEY = "miq-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");
function bindThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Toasts
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
      <div class="toast-title">${escapeHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ""}
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
// Modal system
// ────────────────────────────────────────────────────────────────────────────
const modalRoot = document.getElementById("modalRoot");
function openModal({ title, body, footer, size }) {
  closeModal(true);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" ${size ? `style="max-width:${size}px"` : ""}>
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(title)}</div>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>`;
  overlay.querySelector(".modal-body").appendChild(body);
  if (footer) overlay.querySelector(".modal-footer").appendChild(footer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  modalRoot.appendChild(overlay);
  return overlay;
}
function closeModal(immediate) {
  const overlay = modalRoot.querySelector(".modal-overlay");
  if (!overlay) return;
  if (immediate) { overlay.remove(); return; }
  overlay.classList.add("leaving");
  overlay.querySelector(".modal")?.classList.add("leaving");
  setTimeout(() => overlay.remove(), 200);
}
function confirmDialog({ title, message, confirmText = "Confirm", danger = true }) {
  return new Promise((resolve) => {
    const body = document.createElement("p");
    body.className = "muted";
    body.textContent = message;
    const footer = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.className = "btn btn-ghost"; cancel.textContent = "Cancel";
    const confirm = document.createElement("button");
    confirm.className = danger ? "btn btn-danger" : "btn btn-primary";
    confirm.textContent = confirmText;
    footer.append(cancel, confirm);
    const overlay = openModal({ title, body, footer });
    cancel.addEventListener("click", () => { closeModal(); resolve(false); });
    confirm.addEventListener("click", () => { closeModal(); resolve(true); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) resolve(false); });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function fmtDate(ts) {
  if (!ts) return "—";
  let d;
  if (ts.toDate) d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(ts) {
  if (!ts) return "just now";
  let d;
  if (ts.toDate) d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function statusBadge(status) {
  const cls = status === "Reported" ? "reported" : status === "In Progress" ? "progress" : "resolved";
  return `<span class="badge badge-${cls}">${escapeHtml(status)}</span>`;
}
function priorityBadge(p) {
  const cls = p === "High" ? "high" : p === "Medium" ? "medium" : "low";
  return `<span class="badge badge-${cls}">${escapeHtml(p)}</span>`;
}
function priorityDot(p) {
  const cls = p === "High" ? "high" : p === "Medium" ? "medium" : "low";
  return `<span class="issue-priority-dot ${cls}"></span>`;
}
function initials(name) {
  return (name || "?").split(/[\s@.]+/).filter(Boolean).slice(0,2).map(p => p[0].toUpperCase()).join("");
}

// ────────────────────────────────────────────────────────────────────────────
// Route detection
// ────────────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const PUBLIC_ASSET_ID = params.get("assetId");

if (PUBLIC_ASSET_ID) {
  bindThemeToggle();
  initPublicView(PUBLIC_ASSET_ID);
} else {
  bindThemeToggle();
  initAdmin();
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ASSET VIEW
// ════════════════════════════════════════════════════════════════════════════
function initPublicView(assetId) {
  document.getElementById("loadingScreen")?.remove();
  document.title = `MaintainIQ — Asset ${assetId}`;

  const wrap = document.createElement("div");
  wrap.className = "public-wrap";
  wrap.innerHTML = `
    <div class="public-header">
      <div class="brand" style="justify-content:center;margin-bottom:16px">
        <div class="brand-mark">M</div>
        <div class="brand-name">Maintain<span>IQ</span></div>
      </div>
      <p class="subtle" style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase">Public asset status</p>
    </div>
    <div id="publicAssetCard"></div>
    <div class="panel glass">
      <div class="panel-header"><h2>Service history log</h2></div>
      <div id="publicHistory"></div>
    </div>
    <div class="panel glass">
      <div class="panel-header"><h2>Report a new issue</h2></div>
      <p class="muted" style="font-size:0.85rem">Anyone can report an issue for this asset. No login required.</p>
      <form id="publicReportForm" style="display:flex;flex-direction:column;gap:16px;margin-top:8px">
        <div class="field">
          <label for="rTitle">Issue title</label>
          <input class="input" id="rTitle" required placeholder="e.g. Conveyor belt slipping" />
        </div>
        <div class="field">
          <label for="rDesc">Description</label>
          <textarea class="textarea" id="rDesc" required placeholder="Describe what you observed…"></textarea>
        </div>
        <div class="field">
          <label for="rPriority">Urgency priority</label>
          <select class="select" id="rPriority">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div class="field">
          <label for="rReporter">Your name (optional)</label>
          <input class="input" id="rReporter" placeholder="Anonymous" />
        </div>
        <button class="btn btn-primary" type="submit">Submit issue report</button>
      </form>
    </div>
    <p class="subtle" style="text-align:center;font-size:0.78rem;margin-top:8px">
      Powered by MaintainIQ · Asset ID <span class="mono">${escapeHtml(assetId)}</span>
    </p>`;
  document.body.appendChild(wrap);

  const assetRef = doc(db, COLLECTIONS.ASSETS, assetId);
  onSnapshot(assetRef, (snap) => {
    const card = document.getElementById("publicAssetCard");
    if (!snap.exists()) {
      card.innerHTML = `
        <div class="public-asset-card glass-strong">
          <div class="empty">
            <h3>Asset not found</h3>
            <p>This asset may have been removed or the link is invalid.</p>
          </div>
        </div>`;
      return;
    }
    const a = snap.data();
    card.innerHTML = `
      <div class="public-asset-card glass-strong">
        <div class="asset-id-row">
          <span class="badge badge-neutral mono">ID ${escapeHtml(assetId)}</span>
          ${statusBadge(a.status || "Operational")}
        </div>
        <div class="asset-name">${escapeHtml(a.name || "Unnamed asset")}</div>
        <div class="asset-loc">${escapeHtml(a.location || "—")} · ${escapeHtml(a.type || "Asset")}</div>
      </div>`;
  });

  const issuesRef = collection(db, COLLECTIONS.ISSUES);
  const q = query(issuesRef, where("assetId", "==", assetId));
  onSnapshot(q, (snap) => {
    const list = document.getElementById("publicHistory");
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
        return tb - ta;
      });
    if (!items.length) {
      list.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <h3>No service history yet</h3>
          <p>This asset has a clean record. Report the first issue below.</p>
        </div>`;
      return;
    }
    list.innerHTML = `<div class="history-list">${items.map(it => `
      <div class="history-item">
        <div class="history-rail"><div class="history-dot ${it.status === "Reported" ? "reported" : it.status === "In Progress" ? "progress" : "resolved"}"></div></div>
        <div class="history-body">
          <div class="history-title">${escapeHtml(it.title)}</div>
          <div class="history-meta">${priorityBadge(it.priority)} · ${statusBadge(it.status)} · ${fmtDate(it.createdAt)}${it.assignee ? ` · Assigned to ${escapeHtml(it.assignee)}` : ""}</div>
          ${it.description ? `<div class="history-evidence">${escapeHtml(it.description)}</div>` : ""}
          ${it.evidence ? `<div class="history-evidence"><strong>Evidence:</strong> ${escapeHtml(it.evidence)}</div>` : ""}
          ${it.imageUrl ? `<div class="history-evidence"><strong>Evidence image:</strong> <a href="${escapeHtml(it.imageUrl)}" target="_blank" rel="noopener" class="mono" style="color:var(--primary-500)">${escapeHtml(it.imageUrl)}</a></div>` : ""}
        </div>
      </div>`).join("")}</div>`;
  });

  document.getElementById("publicReportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("rTitle").value.trim();
    const description = document.getElementById("rDesc").value.trim();
    const priority = document.getElementById("rPriority").value;
    const reporterName = document.getElementById("rReporter").value.trim() || "Anonymous";
    if (!title || !description) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting…';
    try {
      await addDoc(collection(db, COLLECTIONS.ISSUES), {
        assetId,
        title,
        description,
        priority,
        status: "Reported",
        reporterName,
        assignee: "",
        evidence: "",
        imageUrl: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast("Issue reported", "Thank you. The maintenance team has been notified.", "success");
      e.target.reset();
      document.getElementById("rPriority").value = "Medium";
    } catch (err) {
      toast("Submission failed", err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "Submit issue report";
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN CONTROL PANEL
// ════════════════════════════════════════════════════════════════════════════
function initAdmin() {
  const dash = document.getElementById("dash");
  const loadingScreen = document.getElementById("loadingScreen");

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("index.html");
      return;
    }
    loadingScreen?.remove();
    dash.classList.remove("hidden");
    renderUser(user);
    startStreams();
  });

  bindSidebar();
  bindSignOut();
  bindNewAsset();
  bindTriageFilter();
  bindCopyPublicLink();
  document.querySelectorAll("[data-goto]").forEach(b => {
    b.addEventListener("click", () => switchView(b.dataset.goto));
  });
}

const state = {
  issues: [],
  assets: [],
  user: null,
  triageFilter: "Reported",
};

function renderUser(user) {
  state.user = user;
  const name = user.displayName || user.email.split("@")[0];
  document.getElementById("userName").textContent = name;
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("userAvatar").textContent = initials(name);
}

function bindSignOut() {
  document.getElementById("signOutBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You will be returned to the sign-in screen.",
      confirmText: "Sign out",
      danger: false,
    });
    if (!ok) return;
    await signOut(auth);
    window.location.replace("index.html");
  });
}

function bindSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  document.getElementById("menuBtn").addEventListener("click", () => {
    sidebar.classList.add("open"); backdrop.classList.add("show");
  });
  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("open"); backdrop.classList.remove("show");
  });
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => {
      switchView(item.dataset.view);
      sidebar.classList.remove("open"); backdrop.classList.remove("show");
    });
  });
}
const VIEW_TITLES = {
  overview: "Overview",
  triage: "Active Triage",
  assets: "Asset Registry",
  ai: "AI Recommendations",
};
function switchView(name) {
  document.querySelectorAll(".nav-item[data-view]").forEach(n =>
    n.classList.toggle("active", n.dataset.view === name));
  document.querySelectorAll(".view").forEach(v =>
    v.classList.toggle("active", v.id === `view-${name}`));
  document.getElementById("viewTitle").textContent = VIEW_TITLES[name] || name;
  if (name === "ai") renderAI(true);
  if (name === "overview") renderAI(false);
}

function startStreams() {
  onSnapshot(collection(db, COLLECTIONS.ISSUES), (snap) => {
    state.issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  onSnapshot(collection(db, COLLECTIONS.ASSETS), (snap) => {
    state.assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
}

function renderAll() {
  renderStats();
  renderRecent();
  renderTriage();
  renderAssets();
  renderAI(false);
  updateNavCount();
}

function updateNavCount() {
  const n = state.issues.filter(i => i.status === "Reported").length;
  document.getElementById("navReportedCount").textContent = n;
}

function renderStats() {
  const grid = document.getElementById("statsGrid");
  const reported = state.issues.filter(i => i.status === "Reported").length;
  const inProgress = state.issues.filter(i => i.status === "In Progress").length;
  const resolved = state.issues.filter(i => i.status === "Resolved").length;
  const assets = state.assets.length;
  const cards = [
    { label: "Tracked assets", value: assets, cls: "blue", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>` },
    { label: "Reported", value: reported, cls: "amber", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` },
    { label: "In progress", value: inProgress, cls: "blue", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
    { label: "Resolved", value: resolved, cls: "green", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` },
  ];
  grid.innerHTML = cards.map(c => `
    <div class="stat-card glass">
      <div class="stat-icon ${c.cls}">${c.icon}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>`).join("");
}

function renderRecent() {
  const list = document.getElementById("recentList");
  const recent = [...state.issues].sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
    const tb = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  }).slice(0, 5);
  if (!recent.length) {
    list.innerHTML = emptyState("No activity yet", "Reported issues will appear here in real time.");
    return;
  }
  list.innerHTML = recent.map(issueRow).join("");
  list.querySelectorAll("[data-open]").forEach(el =>
    el.addEventListener("click", () => openIssue(el.dataset.open)));
}

function bindTriageFilter() {
  document.getElementById("triageFilter").addEventListener("change", (e) => {
    state.triageFilter = e.target.value;
    renderTriage();
  });
}
function renderTriage() {
  const list = document.getElementById("triageList");
  let items = state.issues;
  if (state.triageFilter !== "all") items = items.filter(i => i.status === state.triageFilter);
  items = [...items].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
  if (!items.length) {
    list.innerHTML = emptyState("Nothing to triage", "No issues match this filter right now.");
    return;
  }
  list.innerHTML = items.map(issueRow).join("");
  list.querySelectorAll("[data-open]").forEach(el =>
    el.addEventListener("click", () => openIssue(el.dataset.open)));
}

function issueRow(it) {
  const asset = state.assets.find(a => a.id === it.assetId);
  return `
    <div class="issue-card" data-open="${it.id}">
      ${priorityDot(it.priority)}
      <div class="issue-main">
        <div class="issue-title">${escapeHtml(it.title)}</div>
        <div class="issue-meta">${escapeHtml(asset?.name || it.assetId)} · ${statusBadge(it.status)} ${priorityBadge(it.priority)} · ${timeAgo(it.createdAt)}</div>
      </div>
      <div class="issue-assignee">${it.assignee ? `Assigned: ${escapeHtml(it.assignee)}` : '<span class="subtle">Unassigned</span>'}</div>
      <div class="issue-actions">
        <button class="btn btn-ghost btn-sm" data-stop data-open="${it.id}">Manage</button>
      </div>
    </div>`;
}

function emptyState(title, msg) {
  return `
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(msg)}</p>
    </div>`;
}

function openIssue(id) {
  const it = state.issues.find(i => i.id === id);
  if (!it) return;
  const asset = state.assets.find(a => a.id === it.assetId);

  const body = document.createElement("div");
  body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "16px";
  body.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      ${statusBadge(it.status)} ${priorityBadge(it.priority)}
      <span class="badge badge-neutral mono">Asset: ${escapeHtml(asset?.name || it.assetId)}</span>
    </div>
    <div class="field">
      <label>Issue title</label>
      <input class="input" id="mTitle" value="${escapeHtml(it.title)}" />
    </div>
    <div class="field">
      <label>Description</label>
      <textarea class="textarea" id="mDesc">${escapeHtml(it.description || "")}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field">
        <label>Status</label>
        <select class="select" id="mStatus">
          ${STATUS_FLOW.map(s => `<option ${s === it.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Priority</label>
        <select class="select" id="mPriority">
          ${PRIORITY_LEVELS.map(p => `<option ${p === it.priority ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field">
      <label>Assign to technician</label>
      <select class="select" id="mAssignee">
        <option value="">— Unassigned —</option>
        ${TECHNICIANS.map(t => `<option ${t === it.assignee ? "selected" : ""}>${t}</option>`).join("")}
        ${state.user?.email ? `<option ${state.user.email === it.assignee ? "selected" : ""}>${escapeHtml(state.user.email)}</option>` : ""}
      </select>
    </div>
    <div class="field">
      <label>Completion evidence (text)</label>
      <textarea class="textarea" id="mEvidence" placeholder="Describe the work performed, parts replaced, root cause…">${escapeHtml(it.evidence || "")}</textarea>
    </div>
    <div class="field">
      <label>Evidence image (Upload)</label>
      <input type="file" class="input" id="mImageFile" accept="image/*" style="padding: 8px;" />
      <input type="hidden" id="mImageBase64" value="${escapeHtml(it.imageUrl || "")}" />
    </div>
    <img id="mImagePreview" src="${escapeHtml(it.imageUrl || "")}" alt="evidence" style="border-radius:10px;border:1px solid var(--border);max-height:200px;object-fit:cover; display: ${it.imageUrl ? 'block' : 'none'};" onerror="this.style.display='none'"/>
    <div class="muted" style="font-size:0.78rem">
      Reported by ${escapeHtml(it.reporterName || "Anonymous")} · ${fmtDate(it.createdAt)}<br/>
      Last updated ${fmtDate(it.updatedAt)}
    </div>`;

  const footer = document.createElement("div");
  footer.style.justifyContent = "space-between";
  footer.innerHTML = `
    <button class="btn btn-danger btn-sm" id="mDelete">Delete</button>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Save changes</button>
    </div>`;

  const overlay = openModal({ title: "Manage issue", body, footer, size: 580 });
  const fileInput = overlay.querySelector("#mImageFile");
  const base64Input = overlay.querySelector("#mImageBase64");
  const preview = overlay.querySelector("#mImagePreview");
  
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        base64Input.value = evt.target.result;
        preview.src = evt.target.result;
        preview.style.display = "block";
      };
      reader.readAsDataURL(file);
    }
  });

  overlay.querySelector("#mCancel").addEventListener("click", closeModal);
  overlay.querySelector("#mSave").addEventListener("click", () => saveIssue(id));
  overlay.querySelector("#mDelete").addEventListener("click", () => deleteIssue(id));
}

async function saveIssue(id) {
  const data = {
    title: document.getElementById("mTitle").value.trim(),
    description: document.getElementById("mDesc").value.trim(),
    status: document.getElementById("mStatus").value,
    priority: document.getElementById("mPriority").value,
    assignee: document.getElementById("mAssignee").value,
    evidence: document.getElementById("mEvidence").value.trim(),
    imageUrl: document.getElementById("mImageBase64").value,
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, COLLECTIONS.ISSUES, id), data);
    toast("Issue updated", "Changes saved successfully.", "success");
    closeModal();
  } catch (err) {
    toast("Update failed", err.message, "error");
  }
}

async function deleteIssue(id) {
  const ok = await confirmDialog({
    title: "Delete this issue?",
    message: "This permanently removes the issue and its history.",
    confirmText: "Delete permanently",
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, COLLECTIONS.ISSUES, id));
    toast("Issue deleted", "The record has been purged.", "success");
    closeModal();
  } catch (err) {
    toast("Delete failed", err.message, "error");
  }
}

function bindNewAsset() {
  document.getElementById("newAssetBtn").addEventListener("click", openNewAsset);
}
function renderAssets() {
  const list = document.getElementById("assetsList");
  if (!state.assets.length) {
    list.innerHTML = emptyState("No assets yet", "Create your first asset to start tracking maintenance.");
    return;
  }
  list.innerHTML = state.assets.map(a => {
    const issueCount = state.issues.filter(i => i.assetId === a.id).length;
    const unresolved = state.issues.filter(i => i.assetId === a.id && i.status !== "Resolved").length;
    return `
      <div class="issue-card" data-asset="${a.id}" style="cursor:pointer">
        <span class="issue-priority-dot low"></span>
        <div class="issue-main">
          <div class="issue-title">${escapeHtml(a.name || "Unnamed")}</div>
          <div class="issue-meta">${escapeHtml(a.location || "—")} · ${escapeHtml(a.type || "Asset")} · ${issueCount} issues (${unresolved} open)</div>
        </div>
        <div class="issue-assignee"><span class="badge badge-neutral mono">${escapeHtml(a.id)}</span></div>
        <div class="issue-actions">
          <button class="btn btn-ghost btn-sm" data-qr="${a.id}">QR Code</button>
          <button class="btn btn-ghost btn-sm" data-copy="${a.id}">Public link</button>
        </div>
      </div>`;
  }).join("");
  list.querySelectorAll("[data-asset]").forEach(el =>
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-copy]") || e.target.closest("[data-qr]")) return;
      openAssetIssues(el.dataset.asset);
    }));
  list.querySelectorAll("[data-copy]").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); copyPublicLink(el.dataset.copy); }));
  list.querySelectorAll("[data-qr]").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); showQRCodeModal(el.dataset.qr); }));
}

function openAssetIssues(assetId) {
  const asset = state.assets.find(a => a.id === assetId);
  const items = state.issues.filter(i => i.assetId === assetId)
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const body = document.createElement("div");
  body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "12px";
  if (!items.length) {
    body.innerHTML = emptyState("No issues for this asset", "This asset has a clean record so far.");
  } else {
    body.innerHTML = items.map(it => `
      <div class="issue-card" data-open="${it.id}" style="cursor:pointer">
        ${priorityDot(it.priority)}
        <div class="issue-main">
          <div class="issue-title">${escapeHtml(it.title)}</div>
          <div class="issue-meta">${statusBadge(it.status)} ${priorityBadge(it.priority)} · ${timeAgo(it.createdAt)}${it.assignee ? ` · ${escapeHtml(it.assignee)}` : ""}</div>
        </div>
        <div></div>
        <div></div>
      </div>`).join("");
    body.querySelectorAll("[data-open]").forEach(el =>
      el.addEventListener("click", () => { closeModal(); openIssue(el.dataset.open); }));
  }
  const footer = document.createElement("div");
  footer.innerHTML = `<button class="btn btn-ghost" id="closeAssetIssues">Close</button>`;
  const overlay = openModal({ title: `Issues — ${asset?.name || assetId}`, body, footer, size: 580 });
  footer.querySelector("#closeAssetIssues").addEventListener("click", closeModal);
}

function openNewAsset() {
  const body = document.createElement("div");
  body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "16px";
  body.innerHTML = `
    <div class="field"><label>Asset name</label><input class="input" id="aName" placeholder="e.g. Conveyor Belt #7" /></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Type</label><input class="input" id="aType" placeholder="e.g. Conveyor" /></div>
      <div class="field"><label>Location</label><input class="input" id="aLoc" placeholder="e.g. Plant B — Line 3" /></div>
    </div>`;
  const footer = document.createElement("div");
  footer.innerHTML = `<button class="btn btn-ghost" id="aCancel">Cancel</button><button class="btn btn-primary" id="aCreate">Create asset</button>`;
  const overlay = openModal({ title: "New asset", body, footer, size: 480 });
  footer.querySelector("#aCancel").addEventListener("click", closeModal);
  footer.querySelector("#aCreate").addEventListener("click", async () => {
    const name = document.getElementById("aName").value.trim();
    if (!name) { toast("Name required", "Please enter an asset name.", "error"); return; }
    const type = document.getElementById("aType").value.trim();
    const location = document.getElementById("aLoc").value.trim();
    try {
      const ref = await addDoc(collection(db, COLLECTIONS.ASSETS), {
        name, type, location, status: "Operational", createdAt: serverTimestamp(),
      });
      toast("Asset created", `${name} is now tracked.`, "success");
      closeModal();
      copyPublicLink(ref.id, true);
    } catch (err) {
      toast("Creation failed", err.message, "error");
    }
  });
}

function computeAI() {
  return state.assets.map(a => {
    const issues = state.issues.filter(i => i.assetId === a.id);
    const total = issues.length;
    const unresolved = issues.filter(i => i.status !== "Resolved").length;
    return { asset: a, total, unresolved, flag: total > 3 };
  }).filter(r => r.flag);
}

function renderAI(full) {
  const flagged = computeAI();
  const target = full ? document.getElementById("aiFull") : document.getElementById("aiPreview");
  const panel = document.getElementById("aiPreviewPanel");
  if (!target) return;
  if (!flagged.length) {
    if (full) {
      target.innerHTML = `
        <div class="panel glass">
          <div class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <h3>All clear</h3>
            <p>No assets exceed the failure-frequency threshold yet.</p>
          </div>
        </div>`;
    } else if (panel) {
      panel.style.display = "none";
    }
    return;
  }
  const html = flagged.map(r => {
    const a = r.asset;
    return `
      <div class="ai-card">
        <div class="ai-head">
          <div class="ai-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="ai-title">Proactive Warning</div>
        </div>
        <div class="ai-msg">
          <span class="ai-asset-name">${escapeHtml(a.name || a.id)}</span> has recorded
          <span class="ai-count">${r.total}</span> historical breakdowns. Urgent replacement/overhaul advised.
        </div>
      </div>`;
  }).join("");
  if (full) target.innerHTML = html;
  else { target.innerHTML = html; if (panel) panel.style.display = "flex"; }
}

function bindCopyPublicLink() {
  document.getElementById("copyPublicLink").addEventListener("click", () => {
    if (!state.assets.length) { toast("No assets", "Create an asset first.", "info"); return; }
    if (state.assets.length === 1) { copyPublicLink(state.assets[0].id); return; }
    const body = document.createElement("div");
    body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "8px";
    body.innerHTML = state.assets.map(a => `
      <button class="btn btn-ghost" data-copy="${a.id}" style="justify-content:flex-start">
        ${escapeHtml(a.name || a.id)} <span class="subtle mono" style="margin-left:auto">${escapeHtml(a.id)}</span>
      </button>`).join("");
    const overlay = openModal({ title: "Copy public link", body, size: 420 });
    body.querySelectorAll("[data-copy]").forEach(b =>
      b.addEventListener("click", () => { copyPublicLink(b.dataset.copy); closeModal(); }));
  });
}

function copyPublicLink(assetId, silent) {
  const url = `${window.location.origin}${window.location.pathname}?assetId=${assetId}`;
  navigator.clipboard.writeText(url).then(() => {
    if (!silent) toast("Link copied", "Public asset link is on your clipboard.", "success");
  }).catch(() => {
    toast("Copy failed", `URL: ${url}`, "info");
  });
}

// CORRECTION: showQRCodeModal uses direct image API completely bypassing any libraries
function showQRCodeModal(assetId) {
  const url = `${window.location.origin}${window.location.pathname}?assetId=${assetId}`;
  const body = document.createElement("div");
  body.style.display = "flex"; body.style.flexDirection = "column"; body.style.alignItems = "center"; body.style.gap = "16px";
  
  // Seedha image tag inject kiya hai, no library needed
  body.innerHTML = `
    <div id="qrCodeContainer" style="padding: 15px; background: white; border-radius: 8px; border: 1px solid var(--border); display: flex; justify-content: center; align-items: center;">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}" alt="QR Code" />
    </div>
    <p class="muted" style="text-align: center; font-size: 0.85rem;">Print and attach this QR to the physical asset.<br/>Scanning it opens the public issue reporter.</p>
  `;
  const footer = document.createElement("div");
  footer.innerHTML = `<button class="btn btn-primary" id="closeQR">Done</button>`;
  const overlay = openModal({ title: `QR Code — ${escapeHtml(assetId)}`, body, footer, size: 350 });
  footer.querySelector("#closeQR").addEventListener("click", closeModal);
}