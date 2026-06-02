"use strict";

const S = {
  mode: null, pin: null, memberId: null, memberName: null,
  memberRoles: [], setupComplete: false, managerPin: null,
  weekStart: null, config: { dayNames: [], roles: [], dayHours: {} },
  availData: {}, availActiveDay: null,
};

function $(id) { return document.getElementById(id); }

function toast(msg, type = "") {
  const c = $("toast-container");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
}

function showModal(html) { $("modal-box").innerHTML = html; $("modal-overlay").classList.remove("hidden"); }
function closeModal() { $("modal-overlay").classList.add("hidden"); }
$("modal-overlay").addEventListener("click", (e) => { if (e.target === $("modal-overlay")) closeModal(); });

async function api(method, url, body, headers = {}) {
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function mgrH() { return { managerpin: S.managerPin }; }
function staffH() { return { staffpin: S.pin }; }

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
function addWeeks(ws, n) {
  const d = new Date(ws + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
function fmtWeek(ws) {
  const s = new Date(ws + "T00:00:00"), e = new Date(s);
  e.setDate(e.getDate() + 6);
  const o = { month: "short", day: "numeric" };
  return s.toLocaleDateString("en-US", o) + " – " + e.toLocaleDateString("en-US", o);
}
function fmtMoney(n) { return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function fmtHour(h) {
  if (h >= 24) h -= 24;
  return (h > 12 ? h - 12 : h === 0 ? 12 : h) + (h >= 12 ? "pm" : "am");
}
function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function roleBadge(role) {
  if (!role) return "";
  const k = role.toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge badge-${k}">${role}</span>`;
}
function rolesBadges(roles) {
  return (roles || []).map(roleBadge).join(" ");
}

// Role colour map for timeline
const ROLE_COLORS = {
  "FOH": "#5bb8f5",
  "BOH": "#c084fc",
  "FOH Assist": "#67e8d7",
  "BOH Assist": "#f9a8d4",
};
function roleColor(role) { return ROLE_COLORS[role] || "#8a8370"; }

// ── INIT ──
async function init() {
  S.config = await api("GET", "/api/config");
  S.weekStart = getWeekStart(new Date());
  renderPinScreen();
}

// ══════════════════════════════════════════════════════════
// PIN SCREEN
// ══════════════════════════════════════════════════════════
function renderPinScreen() {
  $("app").innerHTML = `
    <div class="pin-screen">
      <div class="pin-logo">THE PIZZA<em>BOX</em> NY</div>
      <div class="pin-subtitle">BLEECKER STREET · GREENWICH VILLAGE</div>
      <div class="pin-card">
        <div class="pin-dots">
          <div class="pin-dot" id="pd0"></div><div class="pin-dot" id="pd1"></div>
          <div class="pin-dot" id="pd2"></div><div class="pin-dot" id="pd3"></div>
        </div>
        <div class="pin-grid" id="pin-grid"></div>
        <div class="pin-error" id="pin-error"></div>
      </div>
      <div class="pin-manager-btn">
        <button class="pin-manager-link" onclick="showManagerPinEntry()">Manager Login</button>
      </div>
    </div>`;
  buildPinGrid("pin-grid", onStaffPinDigit, onStaffPinDel);
  window._pinBuf = "";
}

function buildPinGrid(gridId, onDigit, onDel) {
  const grid = $(gridId);
  ["1","2","3","4","5","6","7","8","9","","0","⌫"].forEach((k) => {
    const btn = document.createElement("button");
    btn.className = "pin-key" + (k === "" ? " empty" : k === "⌫" ? " del" : "");
    btn.textContent = k;
    if (k !== "") btn.addEventListener("click", () => k === "⌫" ? onDel() : onDigit(k));
    grid.appendChild(btn);
  });
}

function onStaffPinDigit(d) {
  if (window._pinBuf.length >= 4) return;
  window._pinBuf += d;
  updatePinDots(window._pinBuf.length);
  if (window._pinBuf.length === 4) setTimeout(submitStaffPin, 120);
}
function onStaffPinDel() {
  window._pinBuf = window._pinBuf.slice(0, -1);
  updatePinDots(window._pinBuf.length);
  $("pin-error").textContent = "";
}
function updatePinDots(n) {
  for (let i = 0; i < 4; i++) { const d = $("pd" + i); if (d) d.classList.toggle("filled", i < n); }
}

async function submitStaffPin() {
  try {
    const data = await api("POST", "/api/staff/login", { pin: window._pinBuf });
    S.pin = window._pinBuf;
    S.memberId = data.id;
    S.memberName = data.name;
    S.memberRoles = data.roles || [];
    S.setupComplete = data.setupComplete;
    S.mode = "staff";
    if (!S.setupComplete) renderAvailScreen(true);
    else renderStaffScreen();
  } catch (e) {
    $("pin-error").textContent = "Invalid PIN. Try again.";
    window._pinBuf = "";
    updatePinDots(0);
  }
}

function showManagerPinEntry() {
  showModal(`
    <h3>Manager Login</h3>
    <div class="form-stack">
      <div class="form-group">
        <label class="form-label">Manager PIN</label>
        <input class="form-input" id="mgr-pin-input" type="password" inputmode="numeric" maxlength="6" placeholder="Enter PIN" autofocus />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitManagerPin()">Sign In</button>
      </div>
    </div>`);
  setTimeout(() => { const el = $("mgr-pin-input"); if (el) { el.focus(); el.addEventListener("keydown", (e) => { if (e.key === "Enter") submitManagerPin(); }); } }, 50);
}

async function submitManagerPin() {
  const pin = $("mgr-pin-input") ? $("mgr-pin-input").value : "";
  try {
    await api("POST", "/api/manager/login", { pin });
    S.managerPin = pin; S.mode = "manager";
    closeModal(); renderManagerScreen();
  } catch (e) { toast("Invalid PIN", "error"); }
}

// ══════════════════════════════════════════════════════════
// AVAILABILITY SCREEN
// ══════════════════════════════════════════════════════════
function renderAvailScreen(isFirst) {
  S.availData = {}; S.availActiveDay = null;
  $("app").innerHTML = `
    <div class="avail-screen">
      <div class="avail-header">
        <h1>${isFirst ? "WELCOME, " + (S.memberName || "").toUpperCase() : "UPDATE AVAILABILITY"}</h1>
        <p>${isFirst ? "Select the hours you're available to work each week." : "Tap a day to update your available hours."}</p>
      </div>
      <div class="avail-card">
        <div class="avail-days-row" id="avail-days-row"></div>
        <div id="avail-hours-panel"></div>
        <button class="btn btn-primary btn-full btn-lg" style="margin-top:8px" onclick="saveAvailability(${isFirst})">
          ${isFirst ? "Save & Continue →" : "Save Availability"}
        </button>
        ${!isFirst ? `<button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="renderStaffScreen()">Cancel</button>` : ""}
      </div>
    </div>`;
  buildAvailDays();
}

function buildAvailDays() {
  const row = $("avail-days-row"); if (!row) return;
  row.innerHTML = "";
  S.config.dayNames.forEach((name, i) => {
    const dh = S.config.dayHours[i];
    const closed = !dh;
    const hasHours = S.availData[i] && S.availData[i].length > 0;
    const btn = document.createElement("button");
    btn.className = "avail-day-btn" + (closed ? " closed" : "") + (hasHours ? " has-hours" : "") + (S.availActiveDay === i ? " active" : "");
    btn.textContent = name.slice(0, 3).toUpperCase();
    btn.dataset.day = i;
    if (!closed) btn.addEventListener("click", () => { S.availActiveDay = S.availActiveDay === i ? null : i; buildAvailDays(); renderHoursPanel(); });
    row.appendChild(btn);
  });
  renderHoursPanel();
}

function renderHoursPanel() {
  const panel = $("avail-hours-panel"); if (!panel) return;
  const i = S.availActiveDay;
  if (i === null || i === undefined) { panel.innerHTML = ""; return; }
  const dh = S.config.dayHours[i];
  if (!dh) { panel.innerHTML = `<div class="avail-closed-msg">Closed this day.</div>`; return; }
  const selected = S.availData[i] || [];
  const hours = [];
  for (let h = dh.open; h < dh.close; h++) hours.push(h);
  panel.innerHTML = `
    <div class="avail-hours-panel">
      <div class="avail-hours-label">${S.config.dayNames[i]} — select available hours</div>
      <div class="avail-hours-grid">
        ${hours.map((h) => `<button class="avail-hour-btn${selected.includes(h) ? " selected" : ""}" onclick="toggleHour(${i},${h})">${fmtHour(h)}–${fmtHour(h+1)}</button>`).join("")}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="selectAllHours(${i})">All Day</button>
        <button class="btn btn-ghost btn-sm" onclick="clearDayHours(${i})">Clear</button>
      </div>
    </div>`;
}

function toggleHour(day, hour) {
  if (!S.availData[day]) S.availData[day] = [];
  const idx = S.availData[day].indexOf(hour);
  if (idx === -1) S.availData[day].push(hour); else S.availData[day].splice(idx, 1);
  buildAvailDays();
}
function selectAllHours(day) {
  const dh = S.config.dayHours[day]; if (!dh) return;
  S.availData[day] = [];
  for (let h = dh.open; h < dh.close; h++) S.availData[day].push(h);
  buildAvailDays();
}
function clearDayHours(day) { S.availData[day] = []; buildAvailDays(); }

async function saveAvailability(isFirst) {
  try {
    await api("POST", isFirst ? "/api/staff/setup" : "/api/staff/availability", { availability: S.availData }, staffH());
    S.setupComplete = true;
    toast("Availability saved!", "success");
    renderStaffScreen();
  } catch (e) { toast(e.message, "error"); }
}

// ══════════════════════════════════════════════════════════
// STAFF SCREEN
// ══════════════════════════════════════════════════════════
function renderStaffScreen() {
  $("app").innerHTML = `
    <div>
      <div class="topbar">
        <div class="topbar-logo">THE PIZZA<em>BOX</em> NY</div>
        <div class="topbar-right">
          <span class="topbar-name">${S.memberName || ""}</span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </div>
      <div class="page">
        <div class="nav-tabs">
          <button class="nav-tab active" onclick="staffTab('schedule',this)">My Schedule</button>
          <button class="nav-tab" onclick="staffTab('swaps',this)">Shift Swaps</button>
          <button class="nav-tab" onclick="staffTab('availability',this)">Availability</button>
        </div>
        <div id="s-tab-schedule" class="tab-panel active"></div>
        <div id="s-tab-swaps" class="tab-panel"></div>
        <div id="s-tab-availability" class="tab-panel"></div>
      </div>
    </div>`;
  loadStaffScheduleTab(); loadStaffSwapsTab(); loadStaffAvailTab();
}

function staffTab(name, btn) {
  document.querySelectorAll("#app .tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#app .nav-tab").forEach((b) => b.classList.remove("active"));
  $("s-tab-" + name).classList.add("active"); btn.classList.add("active");
}

function loadStaffScheduleTab() {
  const p = $("s-tab-schedule"); if (!p) return;
  p.innerHTML = weekNavHTML("s") + `<div id="s-shifts"></div>`;
  renderStaffShifts();
}

async function renderStaffShifts() {
  const el = $("s-shifts"); if (!el) return;
  try {
    const data = await api("GET", `/api/staff/schedule/${S.weekStart}`, null, staffH());
    if (!data.shifts || !data.shifts.length) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">📅</div>No shifts scheduled this week.</div>`; return;
    }
    el.innerHTML = [...data.shifts].sort((a,b) => a.day - b.day).map((sh) => `
      <div class="shift-card">
        <div>
          <div class="shift-card-day">${S.config.dayNames[sh.day] || ""}</div>
          <div class="shift-card-role">${sh.role || ""}</div>
        </div>
        <div style="text-align:right">
          <div class="shift-card-time">${sh.startTime} – ${sh.endTime}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openSwapRequest('${sh.id}','${S.weekStart}')">Put Up for Swap</button>
        </div>
      </div>`).join("");
  } catch (e) { el.innerHTML = `<div class="empty">Could not load schedule.</div>`; }
}

async function loadStaffSwapsTab() {
  const panel = $("s-tab-swaps"); if (!panel) return;
  try {
    const [mine, available] = await Promise.all([
      api("GET", "/api/swaps/mine", null, staffH()),
      api("GET", "/api/swaps/available", null, staffH()),
    ]);
    let html = `<div class="section-header"><div class="section-title">Shift Swaps</div></div>`;
    if (available.length) {
      html += `<div class="list-label">Available to Claim</div>`;
      html += available.map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info">
            <h4>${sw.requesterName}'s ${S.config.dayNames[sw.shiftDay] || ""} shift</h4>
            <p>${sw.shiftStart} – ${sw.shiftEnd} · ${sw.shiftRole}${sw.note ? " · " + sw.note : ""}</p>
          </div>
          <div class="swap-card-actions">${roleBadge(sw.shiftRole)}<button class="btn btn-green btn-sm" onclick="claimSwap('${sw.id}')">I'll Take It</button></div>
        </div>`).join("");
    }
    const pending = mine.filter((s) => s.status === "open" || s.status === "claimed");
    const resolved = mine.filter((s) => s.status === "approved" || s.status === "denied");
    if (pending.length) {
      html += `<div class="list-label" style="margin-top:20px">My Requests</div>`;
      html += pending.map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info">
            <h4>${S.config.dayNames[sw.shiftDay] || ""} · ${sw.shiftStart} – ${sw.shiftEnd}</h4>
            <p>${sw.claimedByName ? "Claimed by " + sw.claimedByName + " · Awaiting manager approval" : "Open — waiting for someone to claim it"}</p>
          </div>
          <span class="badge badge-${sw.status}">${sw.status === "claimed" ? "Pending Confirmation" : "Open"}</span>
        </div>`).join("");
    }
    if (resolved.length) {
      html += `<div class="list-label" style="margin-top:20px">Past Requests</div>`;
      html += resolved.map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info">
            <h4>${S.config.dayNames[sw.shiftDay] || ""} · ${sw.shiftStart} – ${sw.shiftEnd}</h4>
            <p>${sw.claimedByName || "Unclaimed"}</p>
          </div>
          <span class="badge badge-${sw.status}">${sw.status}</span>
        </div>`).join("");
    }
    if (!available.length && !mine.length) html += `<div class="empty"><div class="empty-icon">🔄</div>No swap activity yet.</div>`;
    panel.innerHTML = html;
  } catch (e) { panel.innerHTML = `<div class="empty">Could not load swaps.</div>`; }
}

function openSwapRequest(shiftId, weekStart) {
  showModal(`
    <h3>Put Shift Up for Swap</h3>
    <div class="form-stack">
      <div class="form-group">
        <label class="form-label">Note for coworkers (optional)</label>
        <input class="form-input" id="swap-note" placeholder="e.g. Family event, need coverage" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitSwapRequest('${shiftId}','${weekStart}')">Post Swap</button>
      </div>
    </div>`);
}
async function submitSwapRequest(shiftId, weekStart) {
  const note = $("swap-note") ? $("swap-note").value : "";
  try {
    await api("POST", "/api/swaps", { shiftId, weekStart, note }, staffH());
    toast("Shift posted for swap!", "success"); closeModal(); loadStaffSwapsTab();
  } catch (e) { toast(e.message, "error"); }
}
async function claimSwap(id) {
  try {
    await api("POST", `/api/swaps/${id}/claim`, {}, staffH());
    toast("Claimed! Waiting for manager approval.", "success"); loadStaffSwapsTab();
  } catch (e) { toast(e.message, "error"); }
}

function loadStaffAvailTab() {
  const p = $("s-tab-availability"); if (!p) return;
  p.innerHTML = `
    <div class="section-header"><div class="section-title">My Availability</div></div>
    <div class="card">
      <p style="font-size:14px;color:var(--text-dim);margin-bottom:16px">Update the hours you're available each week.</p>
      <button class="btn btn-primary" onclick="renderAvailScreen(false)">Edit Availability</button>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// WEEK NAV
// ══════════════════════════════════════════════════════════
function weekNavHTML(prefix) {
  return `<div class="week-nav">
    <button class="week-nav-btn" onclick="changeWeek(-1,'${prefix}')">&#8592;</button>
    <span class="week-nav-label" id="wk-label-${prefix}">${fmtWeek(S.weekStart)}</span>
    <button class="week-nav-btn" onclick="changeWeek(1,'${prefix}')">&#8594;</button>
  </div>`;
}
function changeWeek(dir, prefix) {
  S.weekStart = addWeeks(S.weekStart, dir);
  const lbl = $("wk-label-" + prefix); if (lbl) lbl.textContent = fmtWeek(S.weekStart);
  if (prefix === "s") renderStaffShifts();
  if (prefix === "m-sched") renderManagerSchedule();
  if (prefix === "m-labor") renderLaborPanel();
}

// ══════════════════════════════════════════════════════════
// MANAGER SCREEN
// ══════════════════════════════════════════════════════════
function renderManagerScreen() {
  $("app").innerHTML = `
    <div>
      <div class="topbar">
        <div class="topbar-logo">THE PIZZA<em>BOX</em> NY</div>
        <div class="topbar-right">
          <span class="topbar-name">Max · Manager</span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </div>
      <div class="page">
        <div class="nav-tabs">
          <button class="nav-tab active" onclick="mgrTab('staff',this)">Employees</button>
          <button class="nav-tab" onclick="mgrTab('schedule',this)">Schedule</button>
          <button class="nav-tab" onclick="mgrTab('labor',this)">Labor Cost</button>
          <button class="nav-tab" onclick="mgrTab('swaps',this)">Swap Requests</button>
        </div>
        <div id="m-tab-staff" class="tab-panel active"></div>
        <div id="m-tab-schedule" class="tab-panel"></div>
        <div id="m-tab-labor" class="tab-panel"></div>
        <div id="m-tab-swaps" class="tab-panel"></div>
      </div>
    </div>`;
  loadMgrStaff();
}

function mgrTab(name, btn) {
  document.querySelectorAll("#app .tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("#app .nav-tab").forEach((b) => b.classList.remove("active"));
  $("m-tab-" + name).classList.add("active"); btn.classList.add("active");
  if (name === "schedule") loadMgrSchedule();
  if (name === "labor") loadMgrLabor();
  if (name === "swaps") loadMgrSwaps();
}

// ── EMPLOYEES ──
let _pinsVisible = false;

async function loadMgrStaff() {
  const panel = $("m-tab-staff"); if (!panel) return;
  _pinsVisible = false;
  try {
    const staff = await api("GET", "/api/manager/staff", null, mgrH());
    let html = `
      <div class="section-header">
        <div class="section-title">Employees</div>
        <button class="btn btn-primary" onclick="openAddStaffModal()">+ Add Employee</button>
      </div>`;
    if (!staff.length) {
      html += `<div class="empty"><div class="empty-icon">👥</div>No employees yet.</div>`;
    } else {
      html += `<div class="card" style="padding:0;overflow:hidden"><table class="staff-tbl">
        <thead><tr>
          <th>Name</th><th>Roles</th><th>Rate</th>
          <th>PIN <button onclick="togglePins()" id="pin-toggle-btn" class="pin-reveal-btn">SHOW</button></th>
          <th>Setup</th><th></th>
        </tr></thead>
        <tbody>
          ${staff.map((s) => `<tr>
            <td style="font-weight:600">${s.name}</td>
            <td>${rolesBadges(s.roles)}</td>
            <td style="font-family:var(--font-mono);font-size:13px">${s.rate ? "$" + s.rate.toFixed(2) + "/hr" : "—"}</td>
            <td style="font-family:var(--font-mono);font-size:13px;letter-spacing:2px" id="pin-cell-${s.id}">••••</td>
            <td>${s.setupComplete ? `<span style="color:var(--green);font-size:12px;font-family:var(--font-mono)">✓ Done</span>` : `<span style="color:var(--amber);font-size:12px;font-family:var(--font-mono)">Pending</span>`}</td>
            <td><div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="openEditStaffModal('${s.id}')">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="viewStaffAvail('${s.id}','${s.name}')">Avail</button>
              <button class="btn btn-danger btn-sm" onclick="removeStaff('${s.id}')">✕</button>
            </div></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
    }
    panel.innerHTML = html;
  } catch (e) { panel.innerHTML = `<div class="empty">Could not load staff.</div>`; }
}

async function togglePins() {
  _pinsVisible = !_pinsVisible;
  const btn = $("pin-toggle-btn"); if (btn) btn.textContent = _pinsVisible ? "HIDE" : "SHOW";
  const staff = await api("GET", "/api/manager/staff", null, mgrH());
  for (const s of staff) {
    const cell = $("pin-cell-" + s.id); if (!cell) continue;
    if (_pinsVisible) {
      const full = await api("GET", "/api/manager/staff/" + s.id, null, mgrH());
      cell.textContent = full.pin || "••••";
    } else {
      cell.textContent = "••••";
    }
  }
}

function openAddStaffModal() {
  const roles = S.config.roles;
  showModal(`
    <h3>Add Employee</h3>
    <div class="form-stack">
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-input" id="ns-name" placeholder="First Last" />
      </div>
      <div class="form-group">
        <label class="form-label">Roles (select all that apply)</label>
        <div class="role-check-grid" id="ns-roles">
          ${roles.map((r) => `<label class="role-check-label"><input type="checkbox" value="${r}" />${r}</label>`).join("")}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Hourly Rate ($)</label>
          <input class="form-input" id="ns-rate" type="number" min="0" step="0.25" placeholder="e.g. 18.00" />
        </div>
        <div class="form-group">
          <label class="form-label">4-Digit PIN</label>
          <input class="form-input" id="ns-pin" type="text" inputmode="numeric" maxlength="4" placeholder="e.g. 1234" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="addStaff()">Add Employee</button>
      </div>
    </div>`);
}

async function addStaff() {
  const name = $("ns-name").value.trim();
  const rate = $("ns-rate").value;
  const pin = $("ns-pin").value.trim();
  const roles = [...document.querySelectorAll("#ns-roles input:checked")].map((c) => c.value);
  try {
    await api("POST", "/api/manager/staff", { name, roles, rate, pin }, mgrH());
    toast("Employee added!", "success"); closeModal(); loadMgrStaff();
  } catch (e) { toast(e.message, "error"); }
}

async function openEditStaffModal(id) {
  const data = await api("GET", `/api/manager/staff/${id}`, null, mgrH());
  const roles = S.config.roles;
  const currentRoles = data.roles || [];
  showModal(`
    <h3>Edit ${data.name}</h3>
    <div class="form-stack">
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-input" id="es-name" value="${data.name}" />
      </div>
      <div class="form-group">
        <label class="form-label">Roles (select all that apply)</label>
        <div class="role-check-grid" id="es-roles">
          ${roles.map((r) => `<label class="role-check-label"><input type="checkbox" value="${r}" ${currentRoles.includes(r) ? "checked" : ""} />${r}</label>`).join("")}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Hourly Rate ($)</label>
          <input class="form-input" id="es-rate" type="number" min="0" step="0.25" value="${data.rate || ""}" />
        </div>
        <div class="form-group">
          <label class="form-label">New PIN (blank = keep)</label>
          <input class="form-input" id="es-pin" type="text" inputmode="numeric" maxlength="4" placeholder="4 digits" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEditStaff('${id}')">Save</button>
      </div>
    </div>`);
}

async function saveEditStaff(id) {
  const name = $("es-name").value.trim();
  const rate = $("es-rate").value;
  const pin = $("es-pin").value.trim();
  const roles = [...document.querySelectorAll("#es-roles input:checked")].map((c) => c.value);
  const body = { name, roles, rate };
  if (pin) body.pin = pin;
  try {
    await api("PATCH", `/api/manager/staff/${id}`, body, mgrH());
    toast("Saved!", "success"); closeModal(); loadMgrStaff();
  } catch (e) { toast(e.message, "error"); }
}

async function viewStaffAvail(id, name) {
  const data = await api("GET", `/api/manager/staff/${id}`, null, mgrH());
  const avail = data.availability || {};
  const rows = S.config.dayNames.map((day, i) => {
    const dh = S.config.dayHours[i];
    if (!dh) return `<tr><td style="color:var(--text-dim)">${day}</td><td style="color:var(--text-muted);font-size:12px;font-family:var(--font-mono)">Closed</td></tr>`;
    const hours = (avail[i] || []);
    const display = hours.length ? hours.sort((a,b)=>a-b).map(fmtHour).join(", ") : `<span style="color:var(--text-muted)">Not available</span>`;
    return `<tr><td style="font-weight:600;padding:6px 0">${day}</td><td style="font-size:12px;font-family:var(--font-mono);color:var(--text-dim)">${display}</td></tr>`;
  }).join("");
  showModal(`<h3>${name}'s Availability</h3><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table><div class="modal-actions" style="margin-top:20px"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
}

async function removeStaff(id) {
  if (!confirm("Remove this employee?")) return;
  try {
    await api("DELETE", `/api/manager/staff/${id}`, null, mgrH());
    toast("Removed.", ""); loadMgrStaff();
  } catch (e) { toast(e.message, "error"); }
}

// ── SCHEDULE ──
function loadMgrSchedule() {
  const panel = $("m-tab-schedule"); if (!panel) return;
  panel.innerHTML = weekNavHTML("m-sched") + `<div id="m-sched-content"></div>`;
  renderManagerSchedule();
}

async function renderManagerSchedule() {
  const el = $("m-sched-content"); if (!el) return;
  try {
    const [staffList, weekData] = await Promise.all([
      api("GET", "/api/manager/staff", null, mgrH()),
      api("GET", `/api/manager/schedule/${S.weekStart}`, null, mgrH()),
    ]);
    const shifts = weekData.shifts || [];

    // ── Visual timeline ──
    el.innerHTML = renderTimeline(staffList, shifts) + `<div style="margin-top:36px"></div>` + renderScheduleGrid(staffList, shifts);
  } catch (e) { el.innerHTML = `<div class="empty">Could not load schedule.</div>`; }
}

// Timeline: visual horizontal bars per staff per day
function renderTimeline(staffList, shifts) {
  if (!staffList.length) return "";

  // Day range: earliest open to latest close across all open days
  const OPEN_HOUR = 11;
  const CLOSE_HOUR = 24;
  const TOTAL_MINS = (CLOSE_HOUR - OPEN_HOUR) * 60;

  const dayNames = S.config.dayNames;
  const dayHours = S.config.dayHours;
  const openDays = dayNames.map((_, i) => i).filter((i) => i !== 0 && dayHours[i]);

  // Build shift lookup: staffId -> day -> shifts[]
  const shiftMap = {};
  for (const sh of shifts) {
    if (!shiftMap[sh.staffId]) shiftMap[sh.staffId] = {};
    if (!shiftMap[sh.staffId][sh.day]) shiftMap[sh.staffId][sh.day] = [];
    shiftMap[sh.staffId][sh.day].push(sh);
  }

  // Time axis labels every 2 hours
  const timeLabels = [];
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h += 2) {
    const pct = ((h - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR)) * 100;
    timeLabels.push(`<span style="position:absolute;left:${pct}%;transform:translateX(-50%);font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${fmtHour(h)}</span>`);
  }

  let html = `
    <div>
      <div style="font-family:var(--font-display);font-size:22px;letter-spacing:1px;margin-bottom:16px">WEEKLY OVERVIEW</div>
      <div style="overflow-x:auto">
        <div style="min-width:700px">`;

  for (const dayIdx of openDays) {
    const dayShifts = shifts.filter((s) => s.day === dayIdx);
    if (!dayShifts.length) continue;

    html += `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-dim);font-family:var(--font-mono);margin-bottom:8px">
          ${dayNames[dayIdx]}
        </div>
        <div style="position:relative;margin-bottom:6px;height:16px">
          ${timeLabels.join("")}
        </div>`;

    // Group by staff
    const staffWithShifts = staffList.filter((m) => (shiftMap[m.id] || {})[dayIdx]);
    for (const member of staffWithShifts) {
      const memberShifts = (shiftMap[member.id] || {})[dayIdx] || [];
      html += `<div style="display:flex;align-items:center;margin-bottom:5px;gap:10px">
        <div style="width:110px;flex-shrink:0;font-size:12px;font-weight:600;color:var(--text-dim);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${member.name}</div>
        <div style="flex:1;position:relative;height:26px;background:var(--surface2);border-radius:4px;overflow:visible">`;

      for (const sh of memberShifts) {
        const startMins = timeToMins(sh.startTime) - OPEN_HOUR * 60;
        const endMins = timeToMins(sh.endTime) - OPEN_HOUR * 60;
        const leftPct = Math.max(0, (startMins / TOTAL_MINS) * 100);
        const widthPct = Math.min(100 - leftPct, ((endMins - startMins) / TOTAL_MINS) * 100);
        const color = roleColor(sh.role);
        html += `<div title="${sh.role}: ${sh.startTime}–${sh.endTime}" style="
          position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;
          background:${color}22;border:1px solid ${color}88;border-radius:3px;
          display:flex;align-items:center;padding:0 6px;overflow:hidden;cursor:default;
          box-sizing:border-box;">
          <span style="font-size:10px;font-family:var(--font-mono);color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sh.startTime}–${sh.endTime}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  html += `</div></div></div>`;
  return html;
}

// Grid: editable shift grid
function renderScheduleGrid(staffList, shifts) {
  const shiftMap = {};
  for (const sh of shifts) {
    if (!shiftMap[sh.staffId]) shiftMap[sh.staffId] = {};
    if (!shiftMap[sh.staffId][sh.day]) shiftMap[sh.staffId][sh.day] = [];
    shiftMap[sh.staffId][sh.day].push(sh);
  }
  const dayNames = S.config.dayNames;
  const dayHours = S.config.dayHours;
  const dayHeaders = dayNames.map((d, i) => {
    const closed = !dayHours[i];
    return `<th class="${closed ? "closed-th" : ""}">${d.slice(0,3).toUpperCase()}${closed ? `<br><span style="font-size:9px;color:var(--red-dark)">CLOSED</span>` : ""}</th>`;
  }).join("");
  let rows = "";
  if (!staffList.length) {
    rows = `<tr><td colspan="8" class="empty">No employees yet.</td></tr>`;
  } else {
    for (const m of staffList) {
      let cells = "";
      for (let d = 0; d < 7; d++) {
        const closed = !dayHours[d];
        if (closed) { cells += `<td class="closed-td"></td>`; continue; }
        const ds = (shiftMap[m.id] || {})[d] || [];
        cells += `<td>`;
        for (const sh of ds) {
          cells += `<div class="shift-chip" onclick="openEditShift('${sh.id}','${m.id}',${d},'${sh.startTime}','${sh.endTime}','${sh.role || ""}')">
            <div class="sc-time">${sh.startTime}–${sh.endTime}</div>
            <div class="sc-role">${sh.role || ""}</div>
          </div>`;
        }
        cells += `<button class="shift-add" onclick="openAddShift('${m.id}',${d})">+</button></td>`;
      }
      rows += `<tr><td class="name-td">${m.name}<span>${(m.roles || []).join(", ")}</span></td>${cells}</tr>`;
    }
  }
  return `
    <div style="font-family:var(--font-display);font-size:22px;letter-spacing:1px;margin-bottom:16px">EDIT SHIFTS</div>
    <div class="schedule-wrap">
      <table class="sched-table">
        <thead><tr><th>Staff</th>${dayHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openAddShift(staffId, day) {
  const dh = S.config.dayHours[day];
  const roles = S.config.roles;
  const closeVal = dh && dh.close === 24 ? "23:59" : (dh ? String(dh.close).padStart(2,"0") + ":00" : "22:00");
  showModal(`
    <h3>Add Shift — ${S.config.dayNames[day] || ""}</h3>
    <div class="form-stack">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start</label><input class="form-input" id="sh-start" type="time" value="${dh ? String(dh.open).padStart(2,"0") + ":00" : "11:00"}" /></div>
        <div class="form-group"><label class="form-label">End</label><input class="form-input" id="sh-end" type="time" value="${closeVal}" /></div>
      </div>
      <div class="form-group"><label class="form-label">Role</label><select class="form-input" id="sh-role">${roles.map((r) => `<option>${r}</option>`).join("")}</select></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveNewShift('${staffId}',${day})">Add</button>
      </div>
    </div>`);
}
async function saveNewShift(staffId, day) {
  const start = $("sh-start").value, end = $("sh-end").value, role = $("sh-role").value;
  try {
    const weekData = await api("GET", `/api/manager/schedule/${S.weekStart}`, null, mgrH());
    const shifts = weekData.shifts || [];
    shifts.push({ staffId, day: parseInt(day), startTime: start, endTime: end, role });
    await api("POST", `/api/manager/schedule/${S.weekStart}`, { shifts }, mgrH());
    toast("Shift added!", "success"); closeModal(); renderManagerSchedule();
  } catch (e) { toast(e.message, "error"); }
}
function openEditShift(shiftId, staffId, day, start, end, role) {
  const roles = S.config.roles;
  showModal(`
    <h3>Edit Shift — ${S.config.dayNames[day] || ""}</h3>
    <div class="form-stack">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start</label><input class="form-input" id="sh-start" type="time" value="${start}" /></div>
        <div class="form-group"><label class="form-label">End</label><input class="form-input" id="sh-end" type="time" value="${end}" /></div>
      </div>
      <div class="form-group"><label class="form-label">Role</label><select class="form-input" id="sh-role">${roles.map((r) => `<option ${r===role?"selected":""}>${r}</option>`).join("")}</select></div>
      <div class="modal-actions">
        <button class="btn btn-danger" style="flex:.6" onclick="deleteShift('${shiftId}')">Delete</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="updateShift('${shiftId}')">Save</button>
      </div>
    </div>`);
}
async function updateShift(shiftId) {
  const start = $("sh-start").value, end = $("sh-end").value, role = $("sh-role").value;
  try {
    const weekData = await api("GET", `/api/manager/schedule/${S.weekStart}`, null, mgrH());
    const shifts = weekData.shifts || [];
    const idx = shifts.findIndex((s) => s.id === shiftId);
    if (idx !== -1) { shifts[idx].startTime = start; shifts[idx].endTime = end; shifts[idx].role = role; }
    await api("POST", `/api/manager/schedule/${S.weekStart}`, { shifts }, mgrH());
    toast("Updated!", "success"); closeModal(); renderManagerSchedule();
  } catch (e) { toast(e.message, "error"); }
}
async function deleteShift(shiftId) {
  if (!confirm("Delete this shift?")) return;
  try {
    const weekData = await api("GET", `/api/manager/schedule/${S.weekStart}`, null, mgrH());
    const shifts = (weekData.shifts || []).filter((s) => s.id !== shiftId);
    await api("POST", `/api/manager/schedule/${S.weekStart}`, { shifts }, mgrH());
    toast("Deleted.", ""); closeModal(); renderManagerSchedule();
  } catch (e) { toast(e.message, "error"); }
}

// ── LABOR ──
function loadMgrLabor() {
  const panel = $("m-tab-labor"); if (!panel) return;
  panel.innerHTML = weekNavHTML("m-labor") + `<div id="m-labor-content"></div>`;
  renderLaborPanel();
}
async function renderLaborPanel() {
  const el = $("m-labor-content"); if (!el) return;
  try {
    const d = await api("GET", `/api/manager/labor/${S.weekStart}`, null, mgrH());
    const pctClass = d.laborPct !== null ? (d.laborPct > 35 ? "warn" : "ok") : "";
    el.innerHTML = `
      <div class="labor-grid">
        <div class="labor-stat"><div class="labor-stat-label">Labor Cost</div><div class="labor-stat-val">${fmtMoney(d.totalLaborCost)}</div></div>
        <div class="labor-stat"><div class="labor-stat-label">Total Hours</div><div class="labor-stat-val">${d.totalHours}h</div></div>
        <div class="labor-stat"><div class="labor-stat-label">Projected Sales</div><div class="labor-stat-val">${d.sales ? fmtMoney(d.sales) : "—"}</div></div>
        <div class="labor-stat"><div class="labor-stat-label">Labor %</div><div class="labor-stat-val ${pctClass}">${d.laborPct !== null ? d.laborPct + "%" : "—"}</div></div>
      </div>
      <div class="card"><div class="card-title">Weekly Sales</div>
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div class="form-group" style="flex:1"><label class="form-label">Sales ($)</label><input class="form-input" id="sales-val" type="number" min="0" step="100" value="${d.sales || ""}" placeholder="e.g. 18000" /></div>
          <button class="btn btn-amber" onclick="saveSales()">Save</button>
        </div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="empty">Could not load labor data.</div>`; }
}
async function saveSales() {
  const val = $("sales-val").value;
  try { await api("POST", `/api/manager/sales/${S.weekStart}`, { sales: val }, mgrH()); toast("Saved!", "success"); renderLaborPanel(); }
  catch (e) { toast(e.message, "error"); }
}

// ── SWAPS ──
async function loadMgrSwaps() {
  const panel = $("m-tab-swaps"); if (!panel) return;
  try {
    const swaps = await api("GET", "/api/manager/swaps", null, mgrH());
    const pending = swaps.filter((s) => s.status === "claimed");
    const open = swaps.filter((s) => s.status === "open");
    const resolved = swaps.filter((s) => s.status === "approved" || s.status === "denied");
    let html = `<div class="section-header"><div class="section-title">Swap Requests</div></div>`;
    if (pending.length) {
      html += `<div class="list-label" style="color:var(--amber)">${pending.length} need your approval</div>`;
      html += pending.map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info">
            <h4>${sw.requesterName} → ${sw.claimedByName}</h4>
            <p>${S.config.dayNames[sw.shiftDay] || ""} · ${sw.shiftStart}–${sw.shiftEnd} · ${sw.shiftRole}${sw.note ? " · " + sw.note : ""}</p>
          </div>
          <div class="swap-card-actions">
            <button class="btn btn-green btn-sm" onclick="resolveSwap('${sw.id}','approve')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="resolveSwap('${sw.id}','deny')">Deny</button>
          </div>
        </div>`).join("");
    }
    if (open.length) {
      html += `<div class="list-label" style="margin-top:20px">Open (unclaimed)</div>`;
      html += open.map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info"><h4>${sw.requesterName}</h4><p>${S.config.dayNames[sw.shiftDay] || ""} · ${sw.shiftStart}–${sw.shiftEnd} · ${sw.shiftRole}${sw.note ? " · " + sw.note : ""}</p></div>
          <span class="badge badge-open">Open</span>
        </div>`).join("");
    }
    if (resolved.length) {
      html += `<div class="list-label" style="margin-top:20px">Resolved</div>`;
      html += resolved.slice(0, 30).map((sw) => `
        <div class="swap-card">
          <div class="swap-card-info"><h4>${sw.requesterName}${sw.claimedByName ? " → " + sw.claimedByName : ""}</h4><p>${S.config.dayNames[sw.shiftDay] || ""} · ${sw.shiftStart}–${sw.shiftEnd} · ${sw.shiftRole}</p></div>
          <span class="badge badge-${sw.status}">${sw.status}</span>
        </div>`).join("");
    }
    if (!swaps.length) html += `<div class="empty"><div class="empty-icon">🔄</div>No swap requests yet.</div>`;
    panel.innerHTML = html;
  } catch (e) { panel.innerHTML = `<div class="empty">Could not load swaps.</div>`; }
}

async function resolveSwap(id, action) {
  try {
    await api("POST", `/api/manager/swaps/${id}`, { action }, mgrH());
    toast(action === "approve" ? "Swap approved — shift reassigned." : "Swap denied.", action === "approve" ? "success" : "");
    loadMgrSwaps();
    if ($("m-sched-content")) renderManagerSchedule();
  } catch (e) { toast(e.message, "error"); }
}

function logout() {
  Object.assign(S, { mode: null, pin: null, memberId: null, memberName: null, memberRoles: [], setupComplete: false, managerPin: null });
  renderPinScreen();
}

init();
