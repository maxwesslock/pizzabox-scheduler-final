"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "db.json");
const MANAGER_PIN = process.env.MANAGER_PIN || "0000";
const MANAGER_NAME = "Max";

// ─── CONSTANTS ────────────────────────────────────────────
const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const ROLES = ["FOH","BOH","FOH Assist","BOH Assist"];

// Hours per day: null = closed. open/close in 24h "HH:MM", close "24:00" = midnight
const DAY_HOURS = {
  0: null,                             // Monday — closed
  1: { open: 11, close: 22 },         // Tuesday
  2: { open: 11, close: 22 },         // Wednesday
  3: { open: 11, close: 22 },         // Thursday
  4: { open: 11, close: 24 },         // Friday
  5: { open: 11, close: 24 },         // Saturday
  6: { open: 11, close: 21 },         // Sunday
};

// ─── DB ───────────────────────────────────────────────────
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (e) {
    return { staff: [], schedules: [], swapRequests: [], salesData: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function db() {
  const d = readDB();
  if (!d.staff) d.staff = [];
  if (!d.schedules) d.schedules = [];
  if (!d.swapRequests) d.swapRequests = [];
  if (!d.salesData) d.salesData = [];
  return d;
}

// ─── MIDDLEWARE ───────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── AUTH GUARDS ──────────────────────────────────────────
function mgr(req, res, next) {
  if (req.headers.managerpin !== MANAGER_PIN) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function staff(req, res, next) {
  const { staffpin } = req.headers;
  if (!staffpin) return res.status(401).json({ error: "Unauthorized" });
  const data = db();
  const member = data.staff.find((s) => s.pin === staffpin);
  if (!member) return res.status(401).json({ error: "Invalid PIN" });
  req.member = member;
  next();
}

function staffSetup(req, res, next) {
  // Allows staff who haven't completed setup yet (for the setup endpoint itself)
  const { staffpin } = req.headers;
  if (!staffpin) return res.status(401).json({ error: "Unauthorized" });
  const data = db();
  const member = data.staff.find((s) => s.pin === staffpin);
  if (!member) return res.status(401).json({ error: "Invalid PIN" });
  req.member = member;
  next();
}

// ─── CONFIG ───────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  res.json({ dayNames: DAY_NAMES, roles: ROLES, dayHours: DAY_HOURS });
});

// ─── MANAGER AUTH ─────────────────────────────────────────
app.post("/api/manager/login", (req, res) => {
  if (req.body.pin !== MANAGER_PIN) return res.status(401).json({ error: "Invalid PIN" });
  res.json({ success: true, name: MANAGER_NAME });
});

// ─── STAFF AUTH ───────────────────────────────────────────
// PIN login — returns member info
app.post("/api/staff/login", (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN required" });
  const data = db();
  const member = data.staff.find((s) => s.pin === pin);
  if (!member) return res.status(401).json({ error: "Invalid PIN" });
  res.json({
    id: member.id,
    name: member.name,
    role: member.role,
    setupComplete: member.setupComplete || false,
  });
});

// Staff completes setup (availability)
app.post("/api/staff/setup", staffSetup, (req, res) => {
  const { availability } = req.body;
  if (!availability || typeof availability !== "object") {
    return res.status(400).json({ error: "Availability required" });
  }
  const data = db();
  const idx = data.staff.findIndex((s) => s.id === req.member.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.staff[idx].availability = availability;
  data.staff[idx].setupComplete = true;
  writeDB(data);
  res.json({ success: true });
});

// Staff update availability
app.patch("/api/staff/availability", staff, (req, res) => {
  const { availability } = req.body;
  if (!availability || typeof availability !== "object") {
    return res.status(400).json({ error: "Availability required" });
  }
  const data = db();
  const idx = data.staff.findIndex((s) => s.id === req.member.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.staff[idx].availability = availability;
  writeDB(data);
  res.json({ success: true });
});

// ─── MANAGER: STAFF CRUD ──────────────────────────────────
app.get("/api/manager/staff", mgr, (req, res) => {
  const data = db();
  res.json(data.staff.map((s) => ({ ...s, pin: "****" })));
});

app.post("/api/manager/staff", mgr, (req, res) => {
  const { name, pin, role, rate } = req.body;
  if (!name || !pin || !/^\d{4}$/.test(pin) || !role || !ROLES.includes(role)) {
    return res.status(400).json({ error: "name, 4-digit pin, and valid role required" });
  }
  const data = db();
  if (data.staff.find((s) => s.pin === pin)) {
    return res.status(400).json({ error: "PIN already in use" });
  }
  if (data.staff.find((s) => s.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "Name already in use" });
  }
  const member = {
    id: uuidv4(),
    name,
    pin,
    role,
    rate: rate ? parseFloat(rate) : null,
    availability: {},
    setupComplete: false,
    createdAt: new Date().toISOString(),
  };
  data.staff.push(member);
  writeDB(data);
  res.json({ success: true, id: member.id });
});

app.patch("/api/manager/staff/:id", mgr, (req, res) => {
  const { name, pin, role, rate } = req.body;
  const data = db();
  const idx = data.staff.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (name) data.staff[idx].name = name;
  if (pin) {
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4 digits" });
    const conflict = data.staff.find((s) => s.pin === pin && s.id !== req.params.id);
    if (conflict) return res.status(400).json({ error: "PIN already in use" });
    data.staff[idx].pin = pin;
  }
  if (role && ROLES.includes(role)) data.staff[idx].role = role;
  if (rate !== undefined) data.staff[idx].rate = parseFloat(rate);
  writeDB(data);
  res.json({ success: true });
});

app.delete("/api/manager/staff/:id", mgr, (req, res) => {
  const data = db();
  data.staff = data.staff.filter((s) => s.id !== req.params.id);
  data.schedules = data.schedules.map((w) => {
    w.shifts = (w.shifts || []).filter((sh) => sh.staffId !== req.params.id);
    return w;
  });
  writeDB(data);
  res.json({ success: true });
});

// Manager view a staff member's full profile (including availability)
app.get("/api/manager/staff/:id", mgr, (req, res) => {
  const data = db();
  const member = data.staff.find((s) => s.id === req.params.id);
  if (!member) return res.status(404).json({ error: "Not found" });
  res.json({ ...member, pin: "****" });
});

// ─── SCHEDULE ─────────────────────────────────────────────
app.get("/api/manager/schedule/:weekStart", mgr, (req, res) => {
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === req.params.weekStart);
  res.json(week || { weekStart: req.params.weekStart, shifts: [] });
});

app.post("/api/manager/schedule/:weekStart", mgr, (req, res) => {
  const { shifts } = req.body;
  if (!Array.isArray(shifts)) return res.status(400).json({ error: "shifts array required" });
  const data = db();
  const idx = data.schedules.findIndex((w) => w.weekStart === req.params.weekStart);
  const weekData = {
    weekStart: req.params.weekStart,
    shifts: shifts.map((s) => ({
      id: s.id || uuidv4(),
      staffId: s.staffId,
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      role: s.role,
    })),
    updatedAt: new Date().toISOString(),
  };
  if (idx === -1) data.schedules.push(weekData);
  else data.schedules[idx] = weekData;
  writeDB(data);
  res.json({ success: true });
});

// Staff: get own schedule for week
app.get("/api/staff/schedule/:weekStart", staff, (req, res) => {
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === req.params.weekStart);
  const shifts = week ? week.shifts.filter((s) => s.staffId === req.member.id) : [];
  res.json({ weekStart: req.params.weekStart, shifts });
});

// ─── LABOR ────────────────────────────────────────────────
app.get("/api/manager/labor/:weekStart", mgr, (req, res) => {
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === req.params.weekStart);
  const salesEntry = data.salesData.find((s) => s.weekStart === req.params.weekStart);
  const sales = salesEntry ? salesEntry.sales : null;

  let totalCost = 0;
  let totalHours = 0;
  if (week && week.shifts) {
    for (const sh of week.shifts) {
      const member = data.staff.find((s) => s.id === sh.staffId);
      if (!member || !member.rate) continue;
      const h = timeToHours(sh.startTime, sh.endTime);
      totalHours += h;
      totalCost += h * member.rate;
    }
  }
  const laborPct = sales && sales > 0 ? (totalCost / sales) * 100 : null;
  res.json({
    totalLaborCost: round2(totalCost),
    totalHours: round2(totalHours),
    laborPct: laborPct !== null ? round1(laborPct) : null,
    sales,
  });
});

app.post("/api/manager/sales/:weekStart", mgr, (req, res) => {
  const { sales } = req.body;
  if (isNaN(parseFloat(sales))) return res.status(400).json({ error: "Valid sales required" });
  const data = db();
  const idx = data.salesData.findIndex((s) => s.weekStart === req.params.weekStart);
  const entry = { weekStart: req.params.weekStart, sales: parseFloat(sales) };
  if (idx === -1) data.salesData.push(entry);
  else data.salesData[idx] = entry;
  writeDB(data);
  res.json({ success: true });
});

// ─── SWAP REQUESTS ────────────────────────────────────────
// Staff: create swap request
app.post("/api/swaps", staff, (req, res) => {
  const { shiftId, weekStart, note } = req.body;
  if (!shiftId || !weekStart) return res.status(400).json({ error: "shiftId and weekStart required" });
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === weekStart);
  if (!week) return res.status(404).json({ error: "Week not found" });
  const shift = week.shifts.find((s) => s.id === shiftId);
  if (!shift) return res.status(404).json({ error: "Shift not found" });
  if (shift.staffId !== req.member.id) return res.status(403).json({ error: "Not your shift" });
  // Check no existing pending swap for this shift
  const existing = data.swapRequests.find((s) => s.shiftId === shiftId && s.status === "open");
  if (existing) return res.status(400).json({ error: "Swap already requested for this shift" });
  const swap = {
    id: uuidv4(),
    shiftId,
    weekStart,
    requesterId: req.member.id,
    requesterName: req.member.name,
    shiftRole: shift.role,
    shiftDay: shift.day,
    shiftStart: shift.startTime,
    shiftEnd: shift.endTime,
    note: note || "",
    status: "open",       // open -> claimed -> approved/denied
    claimedBy: null,
    claimedByName: null,
    createdAt: new Date().toISOString(),
  };
  data.swapRequests.push(swap);
  writeDB(data);
  res.json({ success: true, id: swap.id });
});

// Staff: see open swaps available for them to claim (matching role)
app.get("/api/swaps/available", staff, (req, res) => {
  const data = db();
  const myRole = req.member.role;
  const available = data.swapRequests.filter(
    (s) => s.status === "open" &&
      s.requesterId !== req.member.id &&
      s.shiftRole === myRole
  );
  res.json(available);
});

// Staff: claim a swap
app.post("/api/swaps/:id/claim", staff, (req, res) => {
  const data = db();
  const idx = data.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Swap not found" });
  const swap = data.swapRequests[idx];
  if (swap.status !== "open") return res.status(400).json({ error: "Swap no longer available" });
  if (swap.requesterId === req.member.id) return res.status(400).json({ error: "Cannot claim your own shift" });
  if (swap.shiftRole !== req.member.role) return res.status(403).json({ error: "Role mismatch" });
  data.swapRequests[idx].status = "claimed";
  data.swapRequests[idx].claimedBy = req.member.id;
  data.swapRequests[idx].claimedByName = req.member.name;
  data.swapRequests[idx].claimedAt = new Date().toISOString();
  writeDB(data);
  res.json({ success: true });
});

// Staff: get my swap requests
app.get("/api/swaps/mine", staff, (req, res) => {
  const data = db();
  const mine = data.swapRequests.filter((s) => s.requesterId === req.member.id);
  res.json(mine);
});

// Manager: get all swaps
app.get("/api/manager/swaps", mgr, (req, res) => {
  const data = db();
  res.json(data.swapRequests);
});

// Manager: approve or deny a claimed swap
app.post("/api/manager/swaps/:id", mgr, (req, res) => {
  const { action } = req.body;
  if (!["approve","deny"].includes(action)) return res.status(400).json({ error: "action must be approve or deny" });
  const data = db();
  const idx = data.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const swap = data.swapRequests[idx];

  if (action === "approve") {
    // Reassign shift to claimer
    const weekIdx = data.schedules.findIndex((w) => w.weekStart === swap.weekStart);
    if (weekIdx !== -1) {
      const shiftIdx = data.schedules[weekIdx].shifts.findIndex((s) => s.id === swap.shiftId);
      if (shiftIdx !== -1 && swap.claimedBy) {
        data.schedules[weekIdx].shifts[shiftIdx].staffId = swap.claimedBy;
      }
    }
    data.swapRequests[idx].status = "approved";
  } else {
    data.swapRequests[idx].status = "denied";
    // Re-open if they want to try again (set back to open only if claimer was set)
  }
  data.swapRequests[idx].resolvedAt = new Date().toISOString();
  writeDB(data);
  res.json({ success: true });
});

// Manager: cancel/reopen a denied swap back to open
app.post("/api/manager/swaps/:id/reopen", mgr, (req, res) => {
  const data = db();
  const idx = data.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.swapRequests[idx].status = "open";
  data.swapRequests[idx].claimedBy = null;
  data.swapRequests[idx].claimedByName = null;
  writeDB(data);
  res.json({ success: true });
});

// ─── HELPERS ──────────────────────────────────────────────
function timeToHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

// ─── FALLBACK ─────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Pizza Box Scheduler v2 running on port ${PORT}`));
