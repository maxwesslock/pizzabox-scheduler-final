"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "db.json");

// ─── MANAGER CONFIG ──────────────────────────────────────────────────────────
const MANAGER_NAME = "Max";
const MANAGER_PIN = process.env.MANAGER_PIN || "0000";

// ─── HOURS CONFIG ────────────────────────────────────────────────────────────
const HOURS = {
  0: null, // Monday closed
  1: { open: "11:00", close: "22:00" }, // Tuesday
  2: { open: "11:00", close: "22:00" }, // Wednesday
  3: { open: "11:00", close: "22:00" }, // Thursday
  4: { open: "11:00", close: "24:00" }, // Friday midnight
  5: { open: "11:00", close: "24:00" }, // Saturday midnight
  6: { open: "11:00", close: "21:00" }, // Sunday
};
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROLES = ["FOH", "BOH", "FOH Assist", "BOH Assist"];

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { staff: [], schedules: [], swapRequests: [], salesData: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ensureDBFields(db) {
  if (!db.staff) db.staff = [];
  if (!db.schedules) db.schedules = [];
  if (!db.swapRequests) db.swapRequests = [];
  if (!db.salesData) db.salesData = [];
  return db;
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
function requireManager(req, res, next) {
  const { managerPin } = req.headers;
  if (managerPin !== MANAGER_PIN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function requireStaff(req, res, next) {
  const { staffid, staffpin } = req.headers;
  if (!staffid || !staffpin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const db = ensureDBFields(readDB());
  const member = db.staff.find((s) => s.id === staffid && s.pin === staffpin);
  if (!member) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (member.status !== "approved") {
    return res.status(403).json({ error: "Pending approval" });
  }
  req.staffMember = member;
  next();
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
// Manager login
app.post("/api/manager/login", (req, res) => {
  const { pin } = req.body;
  if (pin !== MANAGER_PIN) {
    return res.status(401).json({ error: "Invalid PIN" });
  }
  res.json({ success: true, name: MANAGER_NAME });
});

// Staff signup
app.post("/api/staff/signup", (req, res) => {
  const { name, pin, availability } = req.body;
  if (!name || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "Name and 4-digit PIN required" });
  }
  const db = ensureDBFields(readDB());
  const existing = db.staff.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "Name already taken" });
  }
  const member = {
    id: uuidv4(),
    name,
    pin,
    availability: availability || [],
    role: null,
    rate: null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.staff.push(member);
  writeDB(db);
  res.json({ success: true, id: member.id });
});

// Staff login
app.post("/api/staff/login", (req, res) => {
  const { name, pin } = req.body;
  const db = ensureDBFields(readDB());
  const member = db.staff.find(
    (s) => s.name.toLowerCase() === name.toLowerCase() && s.pin === pin
  );
  if (!member) {
    return res.status(401).json({ error: "Invalid name or PIN" });
  }
  res.json({
    success: true,
    id: member.id,
    name: member.name,
    status: member.status,
    role: member.role,
  });
});

// Staff check status
app.get("/api/staff/status", (req, res) => {
  const { staffid, staffpin } = req.headers;
  const db = ensureDBFields(readDB());
  const member = db.staff.find((s) => s.id === staffid && s.pin === staffpin);
  if (!member) return res.status(401).json({ error: "Unauthorized" });
  res.json({ status: member.status, role: member.role });
});

// ─── MANAGER ROUTES ───────────────────────────────────────────────────────────
// Get all staff
app.get("/api/manager/staff", requireManager, (req, res) => {
  const db = ensureDBFields(readDB());
  res.json(db.staff.map((s) => ({ ...s, pin: undefined })));
});

// Approve staff + assign role/rate
app.post("/api/manager/staff/:id/approve", requireManager, (req, res) => {
  const { role, rate } = req.body;
  if (!role || !ROLES.includes(role)) {
    return res.status(400).json({ error: "Valid role required" });
  }
  if (!rate || isNaN(parseFloat(rate)) || parseFloat(rate) <= 0) {
    return res.status(400).json({ error: "Valid hourly rate required" });
  }
  const db = ensureDBFields(readDB());
  const idx = db.staff.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Staff not found" });
  db.staff[idx].status = "approved";
  db.staff[idx].role = role;
  db.staff[idx].rate = parseFloat(rate);
  writeDB(db);
  res.json({ success: true });
});

// Reject / remove staff
app.delete("/api/manager/staff/:id", requireManager, (req, res) => {
  const db = ensureDBFields(readDB());
  db.staff = db.staff.filter((s) => s.id !== req.params.id);
  // Remove their shifts from schedules
  db.schedules = db.schedules.map((week) => {
    if (week.shifts) {
      week.shifts = week.shifts.filter((sh) => sh.staffId !== req.params.id);
    }
    return week;
  });
  writeDB(db);
  res.json({ success: true });
});

// Update staff role/rate
app.patch("/api/manager/staff/:id", requireManager, (req, res) => {
  const { role, rate } = req.body;
  const db = ensureDBFields(readDB());
  const idx = db.staff.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Staff not found" });
  if (role && ROLES.includes(role)) db.staff[idx].role = role;
  if (rate && !isNaN(parseFloat(rate))) db.staff[idx].rate = parseFloat(rate);
  writeDB(db);
  res.json({ success: true });
});

// ─── SCHEDULE ROUTES ──────────────────────────────────────────────────────────
// Get week schedule (manager)
app.get("/api/manager/schedule/:weekStart", requireManager, (req, res) => {
  const db = ensureDBFields(readDB());
  const week = db.schedules.find((w) => w.weekStart === req.params.weekStart);
  res.json(week || { weekStart: req.params.weekStart, shifts: [] });
});

// Save/update week schedule (manager)
app.post("/api/manager/schedule/:weekStart", requireManager, (req, res) => {
  const { shifts } = req.body;
  if (!Array.isArray(shifts)) {
    return res.status(400).json({ error: "Shifts array required" });
  }
  const db = ensureDBFields(readDB());
  const idx = db.schedules.findIndex((w) => w.weekStart === req.params.weekStart);
  const weekData = {
    weekStart: req.params.weekStart,
    shifts: shifts.map((s) => ({
      id: s.id || uuidv4(),
      staffId: s.staffId,
      day: s.day, // 0=Mon ... 6=Sun
      startTime: s.startTime,
      endTime: s.endTime,
      role: s.role,
    })),
    updatedAt: new Date().toISOString(),
  };
  if (idx === -1) {
    db.schedules.push(weekData);
  } else {
    db.schedules[idx] = weekData;
  }
  writeDB(db);
  res.json({ success: true });
});

// Get labor cost for a week
app.get("/api/manager/labor/:weekStart", requireManager, (req, res) => {
  const db = ensureDBFields(readDB());
  const week = db.schedules.find((w) => w.weekStart === req.params.weekStart);
  const salesEntry = db.salesData.find((s) => s.weekStart === req.params.weekStart);
  const sales = salesEntry ? salesEntry.sales : null;

  if (!week || !week.shifts || week.shifts.length === 0) {
    return res.json({ totalLaborCost: 0, totalHours: 0, laborPct: null, sales });
  }

  let totalCost = 0;
  let totalHours = 0;
  for (const shift of week.shifts) {
    const member = db.staff.find((s) => s.id === shift.staffId);
    if (!member) continue;
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    const hours = (end - start) / 60;
    if (hours > 0) {
      totalHours += hours;
      totalCost += hours * (member.rate || 0);
    }
  }

  const laborPct = sales && sales > 0 ? (totalCost / sales) * 100 : null;
  res.json({
    totalLaborCost: Math.round(totalCost * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    laborPct: laborPct !== null ? Math.round(laborPct * 10) / 10 : null,
    sales,
  });
});

// Save sales data
app.post("/api/manager/sales/:weekStart", requireManager, (req, res) => {
  const { sales } = req.body;
  if (isNaN(parseFloat(sales))) {
    return res.status(400).json({ error: "Valid sales amount required" });
  }
  const db = ensureDBFields(readDB());
  const idx = db.salesData.findIndex((s) => s.weekStart === req.params.weekStart);
  const entry = { weekStart: req.params.weekStart, sales: parseFloat(sales) };
  if (idx === -1) {
    db.salesData.push(entry);
  } else {
    db.salesData[idx] = entry;
  }
  writeDB(db);
  res.json({ success: true });
});

// ─── SWAP REQUEST ROUTES ──────────────────────────────────────────────────────
// Staff: request swap
app.post("/api/swaps", requireStaff, (req, res) => {
  const { shiftId, weekStart, note } = req.body;
  if (!shiftId || !weekStart) {
    return res.status(400).json({ error: "shiftId and weekStart required" });
  }
  const db = ensureDBFields(readDB());
  const week = db.schedules.find((w) => w.weekStart === weekStart);
  if (!week) return res.status(404).json({ error: "Week not found" });
  const shift = week.shifts.find((s) => s.id === shiftId);
  if (!shift) return res.status(404).json({ error: "Shift not found" });
  if (shift.staffId !== req.staffMember.id) {
    return res.status(403).json({ error: "Not your shift" });
  }
  const swap = {
    id: uuidv4(),
    shiftId,
    weekStart,
    requesterId: req.staffMember.id,
    requesterName: req.staffMember.name,
    note: note || "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.swapRequests.push(swap);
  writeDB(db);
  res.json({ success: true, id: swap.id });
});

// Staff: get my swap requests
app.get("/api/swaps/mine", requireStaff, (req, res) => {
  const db = ensureDBFields(readDB());
  const swaps = db.swapRequests.filter((s) => s.requesterId === req.staffMember.id);
  res.json(swaps);
});

// Manager: get all swap requests
app.get("/api/manager/swaps", requireManager, (req, res) => {
  const db = ensureDBFields(readDB());
  res.json(db.swapRequests);
});

// Manager: approve/deny swap
app.post("/api/manager/swaps/:id", requireManager, (req, res) => {
  const { action } = req.body; // "approve" or "deny"
  if (!["approve", "deny"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or deny" });
  }
  const db = ensureDBFields(readDB());
  const idx = db.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Swap not found" });
  db.swapRequests[idx].status = action === "approve" ? "approved" : "denied";
  db.swapRequests[idx].resolvedAt = new Date().toISOString();

  if (action === "approve") {
    // Remove the shift from schedule
    const swap = db.swapRequests[idx];
    const weekIdx = db.schedules.findIndex((w) => w.weekStart === swap.weekStart);
    if (weekIdx !== -1) {
      db.schedules[weekIdx].shifts = db.schedules[weekIdx].shifts.filter(
        (s) => s.id !== swap.shiftId
      );
    }
  }
  writeDB(db);
  res.json({ success: true });
});

// ─── STAFF SCHEDULE VIEW ──────────────────────────────────────────────────────
app.get("/api/staff/schedule/:weekStart", requireStaff, (req, res) => {
  const db = ensureDBFields(readDB());
  const week = db.schedules.find((w) => w.weekStart === req.params.weekStart);
  if (!week) return res.json({ weekStart: req.params.weekStart, shifts: [] });
  const myShifts = week.shifts.filter((s) => s.staffId === req.staffMember.id);
  res.json({ weekStart: req.params.weekStart, shifts: myShifts });
});

// ─── CONFIG ROUTE (public) ────────────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  res.json({ hours: HOURS, dayNames: DAY_NAMES, roles: ROLES });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function timeToMinutes(t) {
  if (!t) return 0;
  const parts = t.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || "0", 10);
}

// ─── FALLBACK ─────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Pizza Box Scheduler running on port ${PORT}`);
});
