"use strict";

// ─── STATE ────────────────────────────────────────────────
const STATE = {
  mode: null, // "manager" | "staff"
  staffId: null,
  staffPin: null,
  staffName: null,
  staffStatus: null,
  managerPin: null,
  currentWeekStart: null,
  config: { hours: {}, dayNames: [], roles: [] },
};

// ─── UTILS ────────────────────────────────────────────────
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast"; }, 3000);
}

function showModal(html) {
  document.getElementById("modal-box").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekStartToDate(ws) {
  return new Date(ws + "T00:00:00");
}

function addWeeks(ws, n) {
  const d = weekStartToDate(ws);
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(ws) {
  const start = weekStartToDate(ws);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: "short", day: "numeric" };
  return start.toLocaleDateString("en-US", opts) + " – " + end.toLocaleDateString("en-US", opts);
}

function formatCurrency(n) {
  return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function roleBadge(role) {
  if (!role) return "";
  const key = role.toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge badge-${key}">${role}</span>`;
}

function statusBadge(s) {
  return `<span class="badge badge-${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
}

function dayShort(dayIdx) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIdx] || "";
}

function managerHeaders() {
  return { "Content-Type": "application/json", managerpin: STATE.managerPin };
}

function staffHeaders() {
  return { "Content-Type": "application/json", staffid: STATE.staffId, staffpin: STATE.staffPin };
}

async function api(method, url, body, headers) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ─── SCREENS ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── INIT ─────────────────────────────────────────────────
async function init() {
  const cfg = await api("GET", "/api/config");
  STATE.config = cfg;
  STATE.currentWeekStart = getWeekStart(new Date());
  renderLoginScreen();
  showScreen("screen-login");
}

// ─── LOGIN SCREEN ──────────────────────────────────────────
function renderLoginScreen() {
  const el = document.getElementById("screen-login");
  el.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <h1>THE PIZZA<span>BOX</span> NY</h1>
        <p>Bleecker Street · Greenwich Village</p>
      </div>
      <div class="tab-row">
        <button class="tab-btn active" id="tab-staff-btn" onclick="switchLoginTab('staff')">Staff</button>
        <button class="tab-btn" id="tab-manager-btn" onclick="switchLoginTab('manager')">Manager</button>
      </div>

      <!-- STAFF FORM -->
      <div id="staff-login-section">
        <div id="form-staff-login" class="login-form">
          <div class="form-group">
            <label class="form-label">Your Name</label>
            <input class="form-input" id="sl-name" placeholder="First Last" />
          </div>
          <div class="form-group">
            <label class="form-label">4-Digit PIN</label>
            <input class="form-input" id="sl-pin" type="password" maxlength="4" inputmode="numeric" placeholder="••••" />
          </div>
          <button class="btn btn-primary" onclick="staffLogin()">Sign In</button>
          <div class="login-footer">
            No account? <button class="link-btn" onclick="switchToSignup()">Create one</button>
          </div>
        </div>

        <div id="form-staff-signup" class="login-form hidden">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input class="form-input" id="su-name" placeholder="First Last" />
          </div>
          <div class="form-group">
            <label class="form-label">Choose a 4-Digit PIN</label>
            <input class="form-input" id="su-pin" type="password" maxlength="4" inputmode="numeric" placeholder="••••" />
          </div>
          <div class="form-group">
            <label class="form-label">Availability (select days you can work)</label>
            <div class="avail-grid" id="avail-grid"></div>
          </div>
          <button class="btn btn-primary" onclick="staffSignup()">Create Account</button>
          <div class="login-footer">
            Have an account? <button class="link-btn" onclick="switchToLogin()">Sign in</button>
          </div>
        </div>
      </div>

      <!-- MANAGER FORM -->
      <div id="manager-login-section" class="hidden">
        <div class="login-form">
          <div class="form-group">
            <label class="form-label">Manager PIN</label>
            <input class="form-input" id="ml-pin" type="password" maxlength="6" inputmode="numeric" placeholder="••••" />
          </div>
          <button class="btn btn-primary" onclick="managerLogin()">Sign In as Manager</button>
        </div>
      </div>
    </div>
  `;
  renderAvailGrid();
  document.getElementById("sl-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") staffLogin(); });
  document.getElementById("ml-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") managerLogin(); });
}

function renderAvailGrid() {
  const grid = document.getElementById("avail-grid");
  if (!grid) return;
  const dayNames = STATE.config.dayNames;
  const hours = STATE.config.hours;
  grid.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const closed = !hours[i === 0 ? 0 : i]; // hours key 0=Mon
    const idx = i; // 0=Mon
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avail-btn" + (closed ? " closed" : "");
    btn.textContent = (dayNames[i] || "").slice(0, 3).toUpperCase();
    btn.dataset.day = i;
    if (!closed) {
      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
      });
    }
    grid.appendChild(btn);
  }
}

window._loginTab = "staff";
function switchLoginTab(tab) {
  window._loginTab = tab;
  document.getElementById("tab-staff-btn").classList.toggle("active", tab === "staff");
  document.getElementById("tab-manager-btn").classList.toggle("active", tab === "manager");
  document.getElementById("staff-login-section").classList.toggle("hidden", tab !== "staff");
  document.getElementById("manager-login-section").classList.toggle("hidden", tab !== "manager");
}

function switchToSignup() {
  document.getElementById("form-staff-login").classList.add("hidden");
  document.getElementById("form-staff-signup").classList.remove("hidden");
}
function switchToLogin() {
  document.getElementById("form-staff-signup").classList.add("hidden");
  document.getElementById("form-staff-login").classList.remove("hidden");
}

async function staffLogin() {
  const name = document.getElementById("sl-name").value.trim();
  const pin = document.getElementById("sl-pin").value.trim();
  if (!name || !pin) return toast("Name and PIN required", "error");
  try {
    const data = await api("POST", "/api/staff/login", { name, pin });
    STATE.staffId = data.id;
    STATE.staffPin = pin;
    STATE.staffName = data.name;
    STATE.staffStatus = data.status;
    if (data.status === "pending") {
      renderPendingScreen();
      showScreen("screen-pending");
    } else {
      renderStaffScreen();
      showScreen("screen-staff");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

async function staffSignup() {
  const name = document.getElementById("su-name").value.trim();
  const pin = document.getElementById("su-pin").value.trim();
  if (!name || !pin || !/^\d{4}$/.test(pin)) {
    return toast("Name and 4-digit numeric PIN required", "error");
  }
  const selected = [];
  document.querySelectorAll(".avail-btn.selected").forEach((b) => {
    selected.push(parseInt(b.dataset.day, 10));
  });
  try {
    await api("POST", "/api/staff/signup", { name, pin, availability: selected });
    toast("Account created! Awaiting manager approval.", "success");
    STATE.staffId = null; // will be set on login
    // Log them in right away
    const data = await api("POST", "/api/staff/login", { name, pin });
    STATE.staffId = data.id;
    STATE.staffPin = pin;
    STATE.staffName = data.name;
    STATE.staffStatus = data.status;
    renderPendingScreen();
    showScreen("screen-pending");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function managerLogin() {
  const pin = document.getElementById("ml-pin").value.trim();
  if (!pin) return toast("PIN required", "error");
  try {
    const data = await api("POST", "/api/manager/login", { pin });
    STATE.managerPin = pin;
    STATE.mode = "manager";
    renderManagerScreen();
    showScreen("screen-manager");
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── PENDING SCREEN ────────────────────────────────────────
function renderPendingScreen() {
  document.getElementById("screen-pending").innerHTML = `
    <div class="pending-card">
      <div class="pending-icon">⏳</div>
      <h2>Hang tight, ${STATE.staffName || ""}!</h2>
      <p>Your account is pending manager approval. You'll be able to log in once Max reviews your request.</p>
      <button class="btn btn-secondary btn-sm" onclick="checkPendingStatus()">Check Status</button>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Back to Login</button>
    </div>
  `;
}

async function checkPendingStatus() {
  try {
    const data = await api("GET", "/api/staff/status", null, staffHeaders());
    if (data.status === "approved") {
      STATE.staffStatus = "approved";
      renderStaffScreen();
      showScreen("screen-staff");
      toast("You're approved! Welcome aboard.", "success");
    } else {
      toast("Still pending — check back soon.", "");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── LOGOUT ───────────────────────────────────────────────
function logout() {
  STATE.mode = null;
  STATE.staffId = null;
  STATE.staffPin = null;
  STATE.staffName = null;
  STATE.staffStatus = null;
  STATE.managerPin = null;
  renderLoginScreen();
  showScreen("screen-login");
}

// ─── STAFF SCREEN ──────────────────────────────────────────
function renderStaffScreen() {
  const el = document.getElementById("screen-staff");
  el.innerHTML = `
    <div class="main-layout">
      <div class="topbar">
        <div class="topbar-logo">THE PIZZA<span>BOX</span> NY</div>
        <div class="topbar-right">
          <span class="topbar-user">${STATE.staffName || ""}</span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </div>
      <div class="main-content">
        <div class="nav-tabs">
          <button class="nav-tab active" onclick="staffTab('schedule', this)">My Schedule</button>
          <button class="nav-tab" onclick="staffTab('swaps', this)">Swap Requests</button>
        </div>
        <div id="staff-tab-schedule" class="tab-panel active"></div>
        <div id="staff-tab-swaps" class="tab-panel"></div>
      </div>
    </div>
  `;
  loadStaffSchedule();
  loadStaffSwaps();
}

function staffTab(name, btn) {
  document.querySelectorAll("#screen-staff .tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#screen-staff .nav-tab").forEach((b) => b.classList.remove("active"));
  document.getElementById("staff-tab-" + name).classList.add("active");
  btn.classList.add("active");
}

async function loadStaffSchedule() {
  const panel = document.getElementById("staff-tab-schedule");
  if (!panel) return;
  panel.innerHTML = weekNavHTML("staff") + `<div id="staff-shifts-content"></div>`;
  await renderStaffShifts();
}

function weekNavHTML(mode) {
  return `
    <div class="week-nav">
      <button class="week-nav-btn" onclick="changeWeek(-1, '${mode}')">&#8592;</button>
      <span class="week-nav-label" id="week-label-${mode}">${formatWeekLabel(STATE.currentWeekStart)}</span>
      <button class="week-nav-btn" onclick="changeWeek(1, '${mode}')">&#8594;</button>
    </div>
  `;
}

function changeWeek(dir, mode) {
  STATE.currentWeekStart = addWeeks(STATE.currentWeekStart, dir);
  document.getElementById("week-label-" + mode).textContent = formatWeekLabel(STATE.currentWeekStart);
  if (mode === "staff") renderStaffShifts();
  if (mode === "manager-sched") renderManagerSchedule();
  if (mode === "manager-labor") renderLaborPanel();
}

async function renderStaffShifts() {
  const container = document.getElementById("staff-shifts-content");
  if (!container) return;
  try {
    const data = await api("GET", `/api/staff/schedule/${STATE.currentWeekStart}`, null, staffHeaders());
    if (!data.shifts || data.shifts.length === 0) {
      container.innerHTML = `<div class="no-shifts">No shifts scheduled this week.</div>`;
      return;
    }
    const sorted = [...data.shifts].sort((a, b) => a.day - b.day);
    container.innerHTML = `
      <div class="my-shifts-list">
        ${sorted.map((s) => `
          <div class="my-shift-card">
            <div>
              <div class="my-shift-day">${STATE.config.dayNames[s.day] || ""}</div>
              <div class="my-shift-role">${s.role || ""}</div>
            </div>
            <div style="text-align:right">
              <div class="my-shift-time">${s.startTime} – ${s.endTime}</div>
              <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="requestSwap('${s.id}','${STATE.currentWeekStart}')">Request Swap</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="no-shifts">Could not load schedule.</div>`;
  }
}

async function requestSwap(shiftId, weekStart) {
  showModal(`
    <h3>Request Shift Swap</h3>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input class="form-input" id="swap-note" placeholder="e.g. Have a family event" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitSwap('${shiftId}','${weekStart}')">Submit Request</button>
      </div>
    </div>
  `);
}

async function submitSwap(shiftId, weekStart) {
  const note = document.getElementById("swap-note").value;
  try {
    await api("POST", "/api/swaps", { shiftId, weekStart, note }, staffHeaders());
    toast("Swap request submitted!", "success");
    closeModal();
    loadStaffSwaps();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadStaffSwaps() {
  const panel = document.getElementById("staff-tab-swaps");
  if (!panel) return;
  try {
    const swaps = await api("GET", "/api/swaps/mine", null, staffHeaders());
    if (!swaps.length) {
      panel.innerHTML = `
        <div class="section-header"><div class="section-title">Swap Requests</div></div>
        <div class="empty-state"><div class="empty-icon">🔄</div>No swap requests yet.</div>
      `;
      return;
    }
    panel.innerHTML = `
      <div class="section-header"><div class="section-title">Swap Requests</div></div>
      <div class="card">
        ${swaps.map((sw) => `
          <div class="swap-row">
            <div class="swap-info">
              <h4>Week of ${formatWeekLabel(sw.weekStart)}</h4>
              <p>${sw.note || "No note"} · ${sw.createdAt ? new Date(sw.createdAt).toLocaleDateString() : ""}</p>
            </div>
            ${statusBadge(sw.status)}
          </div>
        `).join("")}
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<div class="empty-state">Could not load swaps.</div>`;
  }
}

// ─── MANAGER SCREEN ────────────────────────────────────────
function renderManagerScreen() {
  const el = document.getElementById("screen-manager");
  el.innerHTML = `
    <div class="main-layout">
      <div class="topbar">
        <div class="topbar-logo">THE PIZZA<span>BOX</span> NY</div>
        <div class="topbar-right">
          <span class="topbar-user">Max · Manager</span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </div>
      <div class="main-content">
        <div class="nav-tabs">
          <button class="nav-tab active" onclick="managerTab('staff', this)">Staff</button>
          <button class="nav-tab" onclick="managerTab('schedule', this)">Schedule</button>
          <button class="nav-tab" onclick="managerTab('labor', this)">Labor Cost</button>
          <button class="nav-tab" onclick="managerTab('swaps', this)">Swap Requests</button>
        </div>
        <div id="manager-tab-staff" class="tab-panel active"></div>
        <div id="manager-tab-schedule" class="tab-panel"></div>
        <div id="manager-tab-labor" class="tab-panel"></div>
        <div id="manager-tab-swaps" class="tab-panel"></div>
      </div>
    </div>
  `;
  loadManagerStaff();
  loadManagerSwaps();
}

function managerTab(name, btn) {
  document.querySelectorAll("#screen-manager .tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#screen-manager .nav-tab").forEach((b) => b.classList.remove("active"));
  document.getElementById("manager-tab-" + name).classList.add("active");
  btn.classList.add("active");
  if (name === "schedule") loadManagerSchedulePanel();
  if (name === "labor") loadLaborPanel();
  if (name === "swaps") loadManagerSwaps();
}

// ─── MANAGER: STAFF ────────────────────────────────────────
async function loadManagerStaff() {
  const panel = document.getElementById("manager-tab-staff");
  if (!panel) return;
  try {
    const staff = await api("GET", "/api/manager/staff", null, managerHeaders());
    const pending = staff.filter((s) => s.status === "pending");
    const approved = staff.filter((s) => s.status === "approved");

    let html = `<div class="section-header"><div class="section-title">Staff Management</div></div>`;

    if (pending.length) {
      html += `
        <div class="section-sub" style="margin-bottom:12px;font-size:13px;color:var(--amber);font-family:var(--mono)">
          ${pending.length} pending approval
        </div>
        <div class="card" style="margin-bottom:20px">
          <table class="staff-table">
            <thead><tr>
              <th>Name</th><th>Availability</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${pending.map((s) => `
                <tr>
                  <td>${s.name}</td>
                  <td><div class="avail-dots">${renderAvailDots(s.availability)}</div></td>
                  <td>
                    <button class="btn btn-green btn-sm" onclick="openApproveModal('${s.id}','${s.name}')">Approve</button>
                    <button class="btn btn-danger btn-sm" style="margin-left:6px" onclick="rejectStaff('${s.id}')">Reject</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    if (approved.length) {
      html += `
        <div class="card">
          <table class="staff-table">
            <thead><tr>
              <th>Name</th><th>Role</th><th>Rate</th><th>Availability</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${approved.map((s) => `
                <tr>
                  <td style="font-weight:600">${s.name}</td>
                  <td>${roleBadge(s.role)}</td>
                  <td style="font-family:var(--mono);font-size:13px">${s.rate ? "$" + s.rate.toFixed(2) + "/hr" : "—"}</td>
                  <td><div class="avail-dots">${renderAvailDots(s.availability)}</div></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="openEditModal('${s.id}','${s.name}','${s.role}',${s.rate})">Edit</button>
                    <button class="btn btn-danger btn-sm" style="margin-left:6px" onclick="removeStaff('${s.id}')">Remove</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    if (!staff.length) {
      html += `<div class="empty-state"><div class="empty-icon">👥</div>No staff yet.</div>`;
    }

    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="empty-state">Could not load staff.</div>`;
  }
}

function renderAvailDots(avail) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const hours = STATE.config.hours;
  return days.map((d, i) => {
    const closed = !hours[i === 0 ? 0 : i];
    const on = Array.isArray(avail) && avail.includes(i);
    const cls = closed ? "avail-dot closed-day" : (on ? "avail-dot on" : "avail-dot off");
    return `<span class="${cls}" title="${STATE.config.dayNames[i] || ""}">${d}</span>`;
  }).join("");
}

function openApproveModal(id, name) {
  const roles = STATE.config.roles;
  showModal(`
    <h3>Approve ${name}</h3>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="approve-role">
          <option value="">Select role…</option>
          ${roles.map((r) => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Hourly Rate ($)</label>
        <input class="form-input" id="approve-rate" type="number" min="0" step="0.25" placeholder="e.g. 18.00" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-green" onclick="approveStaff('${id}')">Approve</button>
      </div>
    </div>
  `);
}

async function approveStaff(id) {
  const role = document.getElementById("approve-role").value;
  const rate = document.getElementById("approve-rate").value;
  try {
    await api("POST", `/api/manager/staff/${id}/approve`, { role, rate }, managerHeaders());
    toast("Staff approved!", "success");
    closeModal();
    loadManagerStaff();
  } catch (e) {
    toast(e.message, "error");
  }
}

function openEditModal(id, name, role, rate) {
  const roles = STATE.config.roles;
  showModal(`
    <h3>Edit ${name}</h3>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="edit-role">
          ${roles.map((r) => `<option value="${r}" ${r === role ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Hourly Rate ($)</label>
        <input class="form-input" id="edit-rate" type="number" min="0" step="0.25" value="${rate || ""}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveStaffEdit('${id}')">Save</button>
      </div>
    </div>
  `);
}

async function saveStaffEdit(id) {
  const role = document.getElementById("edit-role").value;
  const rate = document.getElementById("edit-rate").value;
  try {
    await api("PATCH", `/api/manager/staff/${id}`, { role, rate }, managerHeaders());
    toast("Saved!", "success");
    closeModal();
    loadManagerStaff();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function rejectStaff(id) {
  if (!confirm("Reject this applicant?")) return;
  try {
    await api("DELETE", `/api/manager/staff/${id}`, null, managerHeaders());
    toast("Removed.", "");
    loadManagerStaff();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function removeStaff(id) {
  if (!confirm("Remove this staff member?")) return;
  try {
    await api("DELETE", `/api/manager/staff/${id}`, null, managerHeaders());
    toast("Removed.", "");
    loadManagerStaff();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── MANAGER: SCHEDULE ─────────────────────────────────────
function loadManagerSchedulePanel() {
  const panel = document.getElementById("manager-tab-schedule");
  if (!panel) return;
  panel.innerHTML = weekNavHTML("manager-sched") + `<div id="manager-sched-content"></div>`;
  renderManagerSchedule();
}

async function renderManagerSchedule() {
  const container = document.getElementById("manager-sched-content");
  if (!container) return;

  try {
    const [staffList, weekData] = await Promise.all([
      api("GET", "/api/manager/staff", null, managerHeaders()),
      api("GET", `/api/manager/schedule/${STATE.currentWeekStart}`, null, managerHeaders()),
    ]);

    const approved = staffList.filter((s) => s.status === "approved");
    const shifts = weekData.shifts || [];
    const hours = STATE.config.hours;
    const dayNames = STATE.config.dayNames;

    // Build a lookup: staffId -> day -> shifts[]
    const shiftMap = {};
    for (const sh of shifts) {
      if (!shiftMap[sh.staffId]) shiftMap[sh.staffId] = {};
      if (!shiftMap[sh.staffId][sh.day]) shiftMap[sh.staffId][sh.day] = [];
      shiftMap[sh.staffId][sh.day].push(sh);
    }

    let html = `
      <div class="schedule-grid">
        <table class="schedule-table">
          <thead><tr>
            <th>Staff</th>
            ${dayNames.map((d, i) => {
              const closed = i === 0 || !hours[i];
              return `<th class="${closed ? "closed-col" : "day-header"}">${d.slice(0,3).toUpperCase()}${closed ? "<br><span style='font-size:9px;color:var(--red-dim)'>CLOSED</span>" : ""}</th>`;
            }).join("")}
          </tr></thead>
          <tbody>
    `;

    if (!approved.length) {
      html += `<tr><td colspan="8" class="no-shifts">No approved staff yet.</td></tr>`;
    } else {
      for (const member of approved) {
        html += `<tr><td class="name-cell">${member.name}<br><span style="font-size:11px;color:var(--text-dim);font-family:var(--mono)">${member.role || ""}</span></td>`;
        for (let d = 0; d < 7; d++) {
          const closed = d === 0 || !hours[d];
          if (closed) {
            html += `<td class="closed-cell"></td>`;
          } else {
            const dayShifts = (shiftMap[member.id] || {})[d] || [];
            html += `<td>`;
            for (const sh of dayShifts) {
              html += `<div class="shift-block" onclick="openEditShiftModal('${sh.id}','${member.id}',${d},'${sh.startTime}','${sh.endTime}','${sh.role || ""}')">
                <div class="shift-time">${sh.startTime}–${sh.endTime}</div>
                <div class="shift-role">${sh.role || ""}</div>
              </div>`;
            }
            html += `<button class="shift-add-btn" onclick="openAddShiftModal('${member.id}',${d})">+</button>`;
            html += `</td>`;
          }
        }
        html += `</tr>`;
      }
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Could not load schedule.</div>`;
  }
}

function openAddShiftModal(staffId, day) {
  const dayName = STATE.config.dayNames[day] || "";
  const hours = STATE.config.hours;
  const h = hours[day];
  const roles = STATE.config.roles;
  showModal(`
    <h3>Add Shift — ${dayName}</h3>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Start Time</label>
        <input class="form-input" id="shift-start" type="time" value="${h ? h.open : "11:00"}" />
      </div>
      <div class="form-group">
        <label class="form-label">End Time</label>
        <input class="form-input" id="shift-end" type="time" value="${h ? (h.close === "24:00" ? "23:59" : h.close) : "22:00"}" />
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="shift-role">
          ${roles.map((r) => `<option>${r}</option>`).join("")}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveNewShift('${staffId}',${day})">Add Shift</button>
      </div>
    </div>
  `);
}

async function saveNewShift(staffId, day) {
  const start = document.getElementById("shift-start").value;
  const end = document.getElementById("shift-end").value;
  const role = document.getElementById("shift-role").value;
  if (!start || !end) return toast("Start and end time required", "error");
  try {
    const weekData = await api("GET", `/api/manager/schedule/${STATE.currentWeekStart}`, null, managerHeaders());
    const shifts = weekData.shifts || [];
    shifts.push({ staffId, day: parseInt(day, 10), startTime: start, endTime: end, role });
    await api("POST", `/api/manager/schedule/${STATE.currentWeekStart}`, { shifts }, managerHeaders());
    toast("Shift added!", "success");
    closeModal();
    renderManagerSchedule();
  } catch (e) {
    toast(e.message, "error");
  }
}

function openEditShiftModal(shiftId, staffId, day, start, end, role) {
  const dayName = STATE.config.dayNames[day] || "";
  const roles = STATE.config.roles;
  showModal(`
    <h3>Edit Shift — ${dayName}</h3>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Start Time</label>
        <input class="form-input" id="shift-start" type="time" value="${start}" />
      </div>
      <div class="form-group">
        <label class="form-label">End Time</label>
        <input class="form-input" id="shift-end" type="time" value="${end}" />
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="shift-role">
          ${roles.map((r) => `<option ${r === role ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" style="flex:0.6" onclick="deleteShift('${shiftId}')">Delete</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="updateShift('${shiftId}')">Save</button>
      </div>
    </div>
  `);
}

async function updateShift(shiftId) {
  const start = document.getElementById("shift-start").value;
  const end = document.getElementById("shift-end").value;
  const role = document.getElementById("shift-role").value;
  try {
    const weekData = await api("GET", `/api/manager/schedule/${STATE.currentWeekStart}`, null, managerHeaders());
    const shifts = weekData.shifts || [];
    const idx = shifts.findIndex((s) => s.id === shiftId);
    if (idx !== -1) {
      shifts[idx].startTime = start;
      shifts[idx].endTime = end;
      shifts[idx].role = role;
    }
    await api("POST", `/api/manager/schedule/${STATE.currentWeekStart}`, { shifts }, managerHeaders());
    toast("Shift updated!", "success");
    closeModal();
    renderManagerSchedule();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteShift(shiftId) {
  if (!confirm("Delete this shift?")) return;
  try {
    const weekData = await api("GET", `/api/manager/schedule/${STATE.currentWeekStart}`, null, managerHeaders());
    const shifts = (weekData.shifts || []).filter((s) => s.id !== shiftId);
    await api("POST", `/api/manager/schedule/${STATE.currentWeekStart}`, { shifts }, managerHeaders());
    toast("Shift removed.", "");
    closeModal();
    renderManagerSchedule();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── MANAGER: LABOR COST ────────────────────────────────────
function loadLaborPanel() {
  const panel = document.getElementById("manager-tab-labor");
  if (!panel) return;
  panel.innerHTML = weekNavHTML("manager-labor") + `<div id="labor-content"></div>`;
  renderLaborPanel();
}

async function renderLaborPanel() {
  const container = document.getElementById("labor-content");
  if (!container) return;
  try {
    const data = await api("GET", `/api/manager/labor/${STATE.currentWeekStart}`, null, managerHeaders());
    const laborPctClass = data.laborPct !== null ? (data.laborPct > 35 ? "warn" : "ok") : "";
    container.innerHTML = `
      <div class="labor-stats">
        <div class="labor-stat">
          <div class="labor-stat-label">Total Labor Cost</div>
          <div class="labor-stat-value">${formatCurrency(data.totalLaborCost)}</div>
        </div>
        <div class="labor-stat">
          <div class="labor-stat-label">Total Hours</div>
          <div class="labor-stat-value">${data.totalHours}h</div>
        </div>
        <div class="labor-stat">
          <div class="labor-stat-label">Projected Sales</div>
          <div class="labor-stat-value">${data.sales ? formatCurrency(data.sales) : "—"}</div>
        </div>
        <div class="labor-stat">
          <div class="labor-stat-label">Labor %</div>
          <div class="labor-stat-value ${laborPctClass}">${data.laborPct !== null ? data.laborPct + "%" : "—"}</div>
        </div>
      </div>
      <div class="card">
        <div class="section-header" style="margin-bottom:14px">
          <div>
            <div style="font-weight:600;font-size:14px">Manual Sales Input</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Enter projected or actual sales for the week</div>
          </div>
        </div>
        <div class="inline-row">
          <div class="form-group">
            <label class="form-label">Weekly Sales ($)</label>
            <input class="form-input" id="sales-input" type="number" min="0" step="100" value="${data.sales || ""}" placeholder="e.g. 18000" />
          </div>
          <button class="btn btn-amber" style="margin-bottom:0;align-self:flex-end" onclick="saveSales()">Save</button>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Could not load labor data.</div>`;
  }
}

async function saveSales() {
  const val = document.getElementById("sales-input").value;
  try {
    await api("POST", `/api/manager/sales/${STATE.currentWeekStart}`, { sales: val }, managerHeaders());
    toast("Sales saved!", "success");
    renderLaborPanel();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── MANAGER: SWAPS ────────────────────────────────────────
async function loadManagerSwaps() {
  const panel = document.getElementById("manager-tab-swaps");
  if (!panel) return;
  try {
    const swaps = await api("GET", "/api/manager/swaps", null, managerHeaders());
    const pending = swaps.filter((s) => s.status === "pending");
    const resolved = swaps.filter((s) => s.status !== "pending");

    let html = `<div class="section-header"><div class="section-title">Swap Requests</div></div>`;

    if (pending.length) {
      html += `<div class="section-sub" style="margin-bottom:12px;font-size:13px;color:var(--amber);font-family:var(--mono)">${pending.length} pending</div>
      <div class="card" style="margin-bottom:20px">
        ${pending.map((sw) => `
          <div class="swap-row">
            <div class="swap-info">
              <h4>${sw.requesterName}</h4>
              <p>Week of ${formatWeekLabel(sw.weekStart)}${sw.note ? " · " + sw.note : ""}</p>
            </div>
            <div class="swap-actions">
              <button class="btn btn-green btn-sm" onclick="resolveSwap('${sw.id}','approve')">Approve</button>
              <button class="btn btn-danger btn-sm" onclick="resolveSwap('${sw.id}','deny')">Deny</button>
            </div>
          </div>
        `).join("")}
      </div>`;
    }

    if (resolved.length) {
      html += `<div class="card">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:12px;font-family:var(--mono)">Resolved</div>
        ${resolved.slice(0, 20).map((sw) => `
          <div class="swap-row">
            <div class="swap-info">
              <h4>${sw.requesterName}</h4>
              <p>Week of ${formatWeekLabel(sw.weekStart)}</p>
            </div>
            ${statusBadge(sw.status)}
          </div>
        `).join("")}
      </div>`;
    }

    if (!swaps.length) {
      html += `<div class="empty-state"><div class="empty-icon">🔄</div>No swap requests.</div>`;
    }

    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="empty-state">Could not load swap requests.</div>`;
  }
}

async function resolveSwap(id, action) {
  try {
    await api("POST", `/api/manager/swaps/${id}`, { action }, managerHeaders());
    toast(action === "approve" ? "Swap approved — shift removed." : "Swap denied.", action === "approve" ? "success" : "");
    loadManagerSwaps();
    // Refresh schedule in background
    if (document.getElementById("manager-tab-schedule").classList.contains("active")) {
      renderManagerSchedule();
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── BOOT ─────────────────────────────────────────────────
init();
