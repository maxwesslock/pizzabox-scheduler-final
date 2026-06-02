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

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const ROLES = ["FOH","BOH","FOH Assist","BOH Assist"];
const DAY_HOURS = {
  0: null,
  1: { open: 11, close: 22 },
  2: { open: 11, close: 22 },
  3: { open: 11, close: 22 },
  4: { open: 11, close: 24 },
  5: { open: 11, close: 24 },
  6: { open: 11, close: 21 },
};

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch (e) { return { staff: [], schedules: [], swapRequests: [], salesData: [] }; }
}
function writeDB(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2), "utf8"); }
function db() {
  const d = readDB();
  if (!d.staff) d.staff = [];
  if (!d.schedules) d.schedules = [];
  if (!d.swapRequests) d.swapRequests = [];
  if (!d.salesData) d.salesData = [];
  return d;
}

// Normalise roles field — always an array
function memberRoles(member) {
  if (Array.isArray(member.roles)) return member.roles;
  if (member.role) return [member.role];
  return [];
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function mgr(req, res, next) {
  if (req.headers.managerpin !== MANAGER_PIN) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function staffAuth(req, res, next) {
  const { staffpin } = req.headers;
  if (!staffpin) return res.status(401).json({ error: "Unauthorized" });
  const data = db();
  const member = data.staff.find((s) => s.pin === staffpin);
  if (!member) return res.status(401).json({ error: "Invalid PIN" });
  req.member = member;
  next();
}

// ── CONFIG ──
app.get("/api/config", (req, res) => {
  res.json({ dayNames: DAY_NAMES, roles: ROLES, dayHours: DAY_HOURS });
});

// ── MANAGER AUTH ──
app.post("/api/manager/login", (req, res) => {
  if (req.body.pin !== MANAGER_PIN) return res.status(401).json({ error: "Invalid PIN" });
  res.json({ success: true, name: MANAGER_NAME });
});

// ── STAFF AUTH ──
app.post("/api/staff/login", (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN required" });
  const data = db();
  const member = data.staff.find((s) => s.pin === pin);
  if (!member) return res.status(401).json({ error: "Invalid PIN" });
  res.json({
    id: member.id,
    name: member.name,
    roles: memberRoles(member),
    setupComplete: member.setupComplete || false,
  });
});

app.post("/api/staff/setup", staffAuth, (req, res) => {
  const { availability } = req.body;
  if (!availability || typeof availability !== "object") return res.status(400).json({ error: "Availability required" });
  const data = db();
  const idx = data.staff.findIndex((s) => s.id === req.member.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.staff[idx].availability = availability;
  data.staff[idx].setupComplete = true;
  writeDB(data);
  res.json({ success: true });
});

app.patch("/api/staff/availability", staffAuth, (req, res) => {
  const { availability } = req.body;
  if (!availability || typeof availability !== "object") return res.status(400).json({ error: "Availability required" });
  const data = db();
  const idx = data.staff.findIndex((s) => s.id === req.member.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.staff[idx].availability = availability;
  writeDB(data);
  res.json({ success: true });
});

// ── MANAGER: STAFF CRUD ──
app.get("/api/manager/staff", mgr, (req, res) => {
  const data = db();
  res.json(data.staff.map((s) => ({ ...s, pin: "****", roles: memberRoles(s) })));
});

app.get("/api/manager/staff/:id", mgr, (req, res) => {
  const data = db();
  const member = data.staff.find((s) => s.id === req.params.id);
  if (!member) return res.status(404).json({ error: "Not found" });
  res.json({ ...member, roles: memberRoles(member) });
});

app.post("/api/manager/staff", mgr, (req, res) => {
  const { name, pin, roles, rate } = req.body;
  const rolesArr = Array.isArray(roles) ? roles : (roles ? [roles] : []);
  if (!name || !pin || !/^\d{4}$/.test(pin) || !rolesArr.length) {
    return res.status(400).json({ error: "name, 4-digit pin, and at least one role required" });
  }
  for (const r of rolesArr) {
    if (!ROLES.includes(r)) return res.status(400).json({ error: "Invalid role: " + r });
  }
  const data = db();
  if (data.staff.find((s) => s.pin === pin)) return res.status(400).json({ error: "PIN already in use" });
  if (data.staff.find((s) => s.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: "Name already in use" });
  const member = {
    id: uuidv4(),
    name,
    pin,
    roles: rolesArr,
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
  const { name, pin, roles, rate } = req.body;
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
  if (roles !== undefined) {
    const rolesArr = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    data.staff[idx].roles = rolesArr;
    data.staff[idx].role = rolesArr[0] || null; // keep legacy field in sync
  }
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

// ── SCHEDULE ──
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

app.get("/api/staff/schedule/:weekStart", staffAuth, (req, res) => {
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === req.params.weekStart);
  const shifts = week ? week.shifts.filter((s) => s.staffId === req.member.id) : [];
  res.json({ weekStart: req.params.weekStart, shifts });
});

// ── LABOR ──
app.get("/api/manager/labor/:weekStart", mgr, (req, res) => {
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === req.params.weekStart);
  const salesEntry = data.salesData.find((s) => s.weekStart === req.params.weekStart);
  const sales = salesEntry ? salesEntry.sales : null;
  let totalCost = 0, totalHours = 0;
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
  res.json({ totalLaborCost: round2(totalCost), totalHours: round2(totalHours), laborPct: laborPct !== null ? round1(laborPct) : null, sales });
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

// ── SWAPS ──
app.post("/api/swaps", staffAuth, (req, res) => {
  const { shiftId, weekStart, note } = req.body;
  if (!shiftId || !weekStart) return res.status(400).json({ error: "shiftId and weekStart required" });
  const data = db();
  const week = data.schedules.find((w) => w.weekStart === weekStart);
  if (!week) return res.status(404).json({ error: "Week not found" });
  const shift = week.shifts.find((s) => s.id === shiftId);
  if (!shift) return res.status(404).json({ error: "Shift not found" });
  if (shift.staffId !== req.member.id) return res.status(403).json({ error: "Not your shift" });
  const existing = data.swapRequests.find((s) => s.shiftId === shiftId && (s.status === "open" || s.status === "claimed"));
  if (existing) return res.status(400).json({ error: "Swap already requested for this shift" });
  const swap = {
    id: uuidv4(),
    shiftId, weekStart,
    requesterId: req.member.id,
    requesterName: req.member.name,
    shiftRole: shift.role,
    shiftDay: shift.day,
    shiftStart: shift.startTime,
    shiftEnd: shift.endTime,
    note: note || "",
    status: "open",
    claimedBy: null,
    claimedByName: null,
    createdAt: new Date().toISOString(),
  };
  data.swapRequests.push(swap);
  writeDB(data);
  res.json({ success: true, id: swap.id });
});

// Available swaps — match any of the member's roles
app.get("/api/swaps/available", staffAuth, (req, res) => {
  const data = db();
  const myRoles = memberRoles(req.member);
  const available = data.swapRequests.filter(
    (s) => s.status === "open" &&
      s.requesterId !== req.member.id &&
      myRoles.includes(s.shiftRole)
  );
  res.json(available);
});

// Claim — any of member's roles
app.post("/api/swaps/:id/claim", staffAuth, (req, res) => {
  const data = db();
  const idx = data.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Swap not found" });
  const swap = data.swapRequests[idx];
  if (swap.status !== "open") return res.status(400).json({ error: "Swap no longer available" });
  if (swap.requesterId === req.member.id) return res.status(400).json({ error: "Cannot claim your own shift" });
  const myRoles = memberRoles(req.member);
  if (!myRoles.includes(swap.shiftRole)) return res.status(403).json({ error: "Role mismatch" });
  data.swapRequests[idx].status = "claimed";
  data.swapRequests[idx].claimedBy = req.member.id;
  data.swapRequests[idx].claimedByName = req.member.name;
  data.swapRequests[idx].claimedAt = new Date().toISOString();
  writeDB(data);
  res.json({ success: true });
});

app.get("/api/swaps/mine", staffAuth, (req, res) => {
  const data = db();
  res.json(data.swapRequests.filter((s) => s.requesterId === req.member.id));
});

app.get("/api/manager/swaps", mgr, (req, res) => {
  res.json(db().swapRequests);
});

app.post("/api/manager/swaps/:id", mgr, (req, res) => {
  const { action } = req.body;
  if (!["approve","deny"].includes(action)) return res.status(400).json({ error: "action must be approve or deny" });
  const data = db();
  const idx = data.swapRequests.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const swap = data.swapRequests[idx];
  if (action === "approve") {
    const weekIdx = data.schedules.findIndex((w) => w.weekStart === swap.weekStart);
    if (weekIdx !== -1 && swap.claimedBy) {
      const shiftIdx = data.schedules[weekIdx].shifts.findIndex((s) => s.id === swap.shiftId);
      if (shiftIdx !== -1) data.schedules[weekIdx].shifts[shiftIdx].staffId = swap.claimedBy;
    }
    data.swapRequests[idx].status = "approved";
  } else {
    data.swapRequests[idx].status = "denied";
  }
  data.swapRequests[idx].resolvedAt = new Date().toISOString();
  writeDB(data);
  res.json({ success: true });
});

function timeToHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Pizza Box Scheduler v3 on port ${PORT}`));
