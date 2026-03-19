import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Task Manager – Grouped Blocks · DnD · Filters · Reminders
 * (Standalone React version for Vite build)
 *
 * Includes:
 *  • Grouped routine blocks with subtasks (Daily / Weekly / Monthly)
 *  • Drag & drop: reorder groups; reorder subtasks; move subtasks between groups (same scope)
 *  • Filters: status (open/done/handover), group type (routine/custom/carried), search, sorting
 *  • Time‑based reminders: per group AND per subtask; one‑off & recurring (daily/weekly/monthly)
 *  • Reset engine with blocker + resolution panel (Complete / Handover / Move to next period)
 *  • Routine duplication rules:
 *      - Daily reset → Daily Routine
 *      - Weekly reset → Weekly Routine
 *      - Monthly reset → Monthly Routine
 *    + carry‑over items (moved by user)
 *  • Local storage persistence
 */

// ---------------- Types ----------------
const STATUS = { OPEN: "open", DONE: "done", HANDOVER: "handover" };
const RECURRENCE = { NONE: "none", DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" };

// ---------------- Keys ----------------
const STORAGE_KEY = "todo_lists_v4_grouped";
const SETTINGS_KEY = "todo_settings_v2";
const REMINDER_KEY = "todo_reminders_v1";

// ---------------- Utils ----------------
function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function startOfNextDayTs() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
function startOfNextWeekTs(mondayStart = true) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const delta = mondayStart ? (((8 - (day || 7)) % 7) || 7) : (((7 - day) % 7) || 7);
  d.setDate(d.getDate() + delta);
  return d.getTime();
}
function startOfNextMonthTs() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------- Templates (Sam) ----------------
const TemplateDailyRoutine = () => ({
  id: makeId(),
  title: "Daily Routine",
  type: "routine",
  period: "daily",
  expanded: true,
  subtasks: [
    { id: makeId(), text: "10:30 – Deadline for morning report to trust chat", status: STATUS.OPEN },
    { id: makeId(), text: "11:00–12:00 – Focus hour: call/email non‑notified customers (credit control)", status: STATUS.OPEN },
    { id: makeId(), text: "Reconcile items on Xero and chase any items needing info", status: STATUS.OPEN },
  ],
});

const TemplateWeeklyRoutine = () => ({
  id: makeId(),
  title: "Weekly Routine",
  type: "routine",
  period: "weekly",
  expanded: true,
  subtasks: [
    // Monday
    { id: makeId(), text: "Monday – Update credit limits & apply if extra needed", status: STATUS.OPEN },
    { id: makeId(), text: "Monday – Update trust chat with customers with shortfall on cover", status: STATUS.OPEN },
    { id: makeId(), text: "Monday – Send customers on stop report", status: STATUS.OPEN },
    // Tuesday
    { id: makeId(), text: "Tuesday – Process weekly payroll & email payslips", status: STATUS.OPEN },
    // Wednesday
    { id: makeId(), text: "Wednesday – Update payment list", status: STATUS.OPEN },
    { id: makeId(), text: "Wednesday – Upload invoices to close & update availability / sales on payment list", status: STATUS.OPEN },
    { id: makeId(), text: "Wednesday – Send payment list to Claire & drawdown by 1–2pm", status: STATUS.OPEN },
    { id: makeId(), text: "Wednesday – Send sales figures in trust chat", status: STATUS.OPEN },
    { id: makeId(), text: "Wednesday PM – Send £95,000 to TWS when funds land", status: STATUS.OPEN },
    { id: makeId(), text: "Wednesday – Update NEST schedule", status: STATUS.OPEN },
    // Thursday
    { id: makeId(), text: "Thursday AM – Send balancing payment to TWS when invoice is in Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday AM – Clear any soundings on Ideal", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Debtor call", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Nathan margin report", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Pete margin report", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Antolin rebate (send to customer if work done) & update Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Magna rebate (send to customer if work done) & update Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – OP rebate (send to customer if work done) & update Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Tenneco rebate (send to customer if work done) & update Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – WHS rebate (send when Ben sends invoice) & update Xero", status: STATUS.OPEN },
    { id: makeId(), text: "Thursday – Schedule payments to come out on Friday", status: STATUS.OPEN },
    // Friday
    { id: makeId(), text: "Friday AM – Send statements to all customers on Xero", status: STATUS.OPEN },
  ],
});

const TemplateMonthlyRoutine = () => ({
  id: makeId(),
  title: "Monthly Routine",
  type: "routine",
  period: "monthly",
  expanded: true,
  subtasks: [
    { id: makeId(), text: "Send monthly salary breakdown to Steve & Claire for approval", status: STATUS.OPEN },
    { id: makeId(), text: "Process monthly salaries on Xero; email payslips; process NEST pension", status: STATUS.OPEN },
    { id: makeId(), text: "TWS audit", status: STATUS.OPEN },
    { id: makeId(), text: "PAYE payments due to HMRC – add bill to Xero", status: STATUS.OPEN },
  ],
});

// ---------------- Persistence ----------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { autoDaily: true, autoWeekly: true, autoMonthly: true, weekStartsMonday: true };
  } catch {
    return { autoDaily: true, autoWeekly: true, autoMonthly: true, weekStartsMonday: true };
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// Reminders store (descriptors) – timeouts are in-memory only
function loadReminderStore() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveReminderStore(store) {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(store));
  } catch {}
}

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}
async function ensurePermission() {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

// compute next fire time from a base datetime string and recurrence
function nextFireTs(baseIsoLocal, recurrence) {
  if (!baseIsoLocal) return null;
  const base = new Date(baseIsoLocal);
  if (isNaN(base.getTime())) return null;
  const now = Date.now();
  let next = base.getTime();
  while (next <= now) {
    if (recurrence === RECURRENCE.NONE) return null;
    if (recurrence === RECURRENCE.DAILY) next += 24 * 60 * 60 * 1000;
    else if (recurrence === RECURRENCE.WEEKLY) next += 7 * 24 * 60 * 60 * 1000;
    else if (recurrence === RECURRENCE.MONTHLY) {
      const d = new Date(next);
      d.setMonth(d.getMonth() + 1);
      next = d.getTime();
    } else return null;
  }
  return next;
}

// ---------------- Small UI helpers (vanilla CSS) ----------------
const styles = {
  container: { maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  h1: { fontSize: 28, fontWeight: 800, marginBottom: 16 },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 },
  progressWrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 160, width: "50%" },
  progressBar: { height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden", flex: 1 },
  progressFill: (pct) => ({ height: "100%", width: `${pct}%`, background: "#3b82f6", transition: "width .2s ease" }),
  btn: { padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" },
  btnPrimary: { padding: "6px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer" },
  input: { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" },
  labelRow: { display: "flex", alignItems: "center", gap: 8 },
  groupCard: { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" },
  subRow: { display: "flex", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", padding: 8, borderRadius: 8 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 },
  modal: { background: "#fff", borderRadius: 12, padding: 16, width: "100%", maxWidth: 720, boxShadow: "0 8px 30px rgba(0,0,0,.12)" },
};

// ---------------- Main Component ----------------
export default function ToDoPage() {
  // groups per scope
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);

  // carry‑over subtasks moved forward by user
  const [carryDaily, setCarryDaily] = useState([]);
  const [carryWeekly, setCarryWeekly] = useState([]);
  const [carryMonthly, setCarryMonthly] = useState([]);

  const [settings, setSettings] = useState(loadSettings());
  const [pendingReset, setPendingReset] = useState(null); // { scope }

  // filters & sort
  const [filters, setFilters] = useState({
    showOpen: true,
    showDone: true,
    showHandover: true,
    showRoutine: true,
    showCustom: true,
    showCarried: true,
    q: "",
    sortGroups: "default", // default | az | za
    sortSubtasks: "default", // default | az | za
  });

  // drag state
  const dragState = useRef(null); // { type:'group'|'subtask', scope, groupId, subId, fromIndex }

  // reminders
  const reminderTimeouts = useRef({}); // id -> timeoutId
  const [reminders, setReminders] = useState(loadReminderStore()); // { id: { label, when, recurrence, scope, groupId, subId? } }

  // manual add
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupScope, setNewGroupScope] = useState("daily");
  const [newTaskText, setNewTaskText] = useState("");

  // Load & persist
  useEffect(() => {
    const loaded = loadState();
    if (loaded) {
      setDaily(loaded.daily || []);
      setWeekly(loaded.weekly || []);
      setMonthly(loaded.monthly || []);
      setCarryDaily(loaded.carryDaily || []);
      setCarryWeekly(loaded.carryWeekly || []);
      setCarryMonthly(loaded.carryMonthly || []);
    } else {
      setDaily([TemplateDailyRoutine()]);
    }
    setTimeout(() => rescheduleAllReminders(), 0);
  }, []);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(
    () => saveState({ daily, weekly, monthly, carryDaily, carryWeekly, carryMonthly }),
    [daily, weekly, monthly, carryDaily, carryWeekly, carryMonthly]
  );
  useEffect(() => {
    saveReminderStore(reminders);
    rescheduleAllReminders();
  }, [reminders]);

  // Scheduling resets
  useEffect(() => {
    const timers = [];
    if (settings.autoDaily)
      timers.push(
        setTimeout(() => setPendingReset({ scope: "daily" }), Math.max(1000, startOfNextDayTs() - Date.now()))
      );
    if (settings.autoWeekly)
      timers.push(
        setTimeout(
          () => setPendingReset({ scope: "weekly" }),
          Math.max(1000, startOfNextWeekTs(settings.weekStartsMonday) - Date.now())
        )
      );
    if (settings.autoMonthly)
      timers.push(
        setTimeout(() => setPendingReset({ scope: "monthly" }), Math.max(1000, startOfNextMonthTs() - Date.now()))
      );
    return () => timers.forEach(clearTimeout);
  }, [settings]);

  // Progress
  const progress = (groups) => {
    let total = 0,
      resolved = 0;
    groups.forEach((g) => g.subtasks.forEach((st) => { total++; if (st.status !== STATUS.OPEN) resolved++; }));
    return total ? Math.round((resolved / total) * 100) : 0;
  };
  const dailyPct = useMemo(() => progress(daily), [daily]);
  const weeklyPct = useMemo(() => progress(weekly), [weekly]);
  const monthlyPct = useMemo(() => progress(monthly), [monthly]);

  // Reminders scheduling
  function clearReminderTimeout(id) {
    const t = reminderTimeouts.current[id];
    if (t) {
      clearTimeout(t);
      delete reminderTimeouts.current[id];
    }
  }
  function scheduleReminder(id, payload) {
    clearReminderTimeout(id);
    if (!payload?.when) return;
    const targetTs = nextFireTs(payload.when, payload.recurrence || RECURRENCE.NONE);
    if (!targetTs) return;
    const delay = Math.max(0, targetTs - Date.now());
    const doNotify = async () => {
      const ok = await ensurePermission();
      const title = payload.label || "Task reminder";
      if (ok && canNotify()) {
        try {
          new Notification(title, { body: payload.body || "", tag: id });
        } catch {}
      }
      if (payload.recurrence && payload.recurrence !== RECURRENCE.NONE) {
        const nextBase = new Date(payload.when);
        if (payload.recurrence === RECURRENCE.DAILY) nextBase.setDate(nextBase.getDate() + 1);
        if (payload.recurrence === RECURRENCE.WEEKLY) nextBase.setDate(nextBase.getDate() + 7);
        if (payload.recurrence === RECURRENCE.MONTHLY) nextBase.setMonth(nextBase.getMonth() + 1);
        setReminders((prev) => ({ ...prev, [id]: { ...prev[id], when: nextBase.toISOString().slice(0, 16) } }));
      } else {
        setReminders((prev) => {
          const c = { ...prev };
          delete c[id];
          return c;
        });
      }
    };
    reminderTimeouts.current[id] = setTimeout(doNotify, delay);
  }
  function rescheduleAllReminders() {
    Object.keys(reminders || {}).forEach((id) => scheduleReminder(id, reminders[id]));
  }
  function setGroupReminder(scope, groupId, when, recurrence) {
    const g = (scope === "daily" ? daily : scope === "weekly" ? weekly : monthly).find((x) => x.id === groupId);
    if (!g) return;
    const id = `grp:${scope}:${groupId}`;
    const payload = { label: `${g.title} – ${scope} group`, body: `Reminder for ${g.title}`, when, recurrence, scope, groupId };
    setReminders((prev) => ({ ...prev, [id]: payload }));
  }
  function setSubtaskReminder(scope, groupId, subId, when, recurrence) {
    const g = (scope === "daily" ? daily : scope === "weekly" ? weekly : monthly).find((x) => x.id === groupId);
    const s = g?.subtasks.find((x) => x.id === subId);
    if (!g || !s) return;
    const id = `sub:${scope}:${groupId}:${subId}`;
    const payload = { label: s.text, body: `${g.title} – ${s.text}`, when, recurrence, scope, groupId, subId };
    setReminders((prev) => ({ ...prev, [id]: payload }));
  }
  function removeReminder(id) {
    clearReminderTimeout(id);
    setReminders((prev) => {
      const c = { ...prev };
      delete c[id];
      return c;
    });
  }

  // DnD helpers
  function onDragStartGroup(scope, index, groupId) {
    return (e) => {
      dragState.current = { type: "group", scope, fromIndex: index, groupId };
      e.dataTransfer.effectAllowed = "move";
    };
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDropGroup(scope, index) {
    return (e) => {
      e.preventDefault();
      const ds = dragState.current;
      if (!ds || ds.type !== "group" || ds.scope !== scope) return;
      const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
      const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
      const [moved] = list.splice(ds.fromIndex, 1);
      list.splice(index, 0, moved);
      setter(list);
      dragState.current = null;
    };
  }
  function onDragStartSub(scope, groupId, subIndex, subId) {
    return (e) => {
      dragState.current = { type: "subtask", scope, groupId, fromIndex: subIndex, subId };
      e.dataTransfer.effectAllowed = "move";
    };
  }
  function onDropSub(scope, targetGroupId, targetIndex) {
    return (e) => {
      e.preventDefault();
      const ds = dragState.current;
      if (!ds || ds.type !== "subtask" || ds.scope !== scope) return;
      const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
      const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
      const fromG = list.find((g) => g.id === ds.groupId);
      const toG = list.find((g) => g.id === targetGroupId);
      if (!fromG || !toG) return;
      const [moved] = fromG.subtasks.splice(ds.fromIndex, 1);
      const insertAt = typeof targetIndex === "number" ? targetIndex : toG.subtasks.length;
      toG.subtasks.splice(insertAt, 0, moved);
      setter(list);
      dragState.current = null;
    };
  }

  // Core actions
  const toggleGroup = (scope, groupId) => {
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const list = scope === "daily" ? daily : scope === "weekly" ? weekly : monthly;
    setter(list.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g)));
  };
  const setSubtaskStatus = (scope, groupId, subId, status) => {
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
    const g = list.find((x) => x.id === groupId);
    if (!g) return;
    const s = g.subtasks.find((x) => x.id === subId);
    if (!s) return;
    s.status = status;
    if (status !== STATUS.HANDOVER) delete s.handoverTo;
    setter(list);
  };
  const setHandoverName = (scope, groupId, subId, name) => {
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
    const g = list.find((x) => x.id === groupId);
    const s = g?.subtasks.find((x) => x.id === subId);
    if (!s) return;
    s.status = STATUS.HANDOVER;
    s.handoverTo = name;
    setter(list);
  };
  const addQuickSubtask = (scope, groupId, text) => {
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
    const g = list.find((x) => x.id === groupId);
    if (!g) return;
    g.subtasks.push({ id: makeId(), text, status: STATUS.OPEN });
    setter(list);
  };
  const deleteGroup = (scope, groupId) => {
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
    // clear reminders
    removeReminder(`grp:${scope}:${groupId}`);
    const g = list.find((x) => x.id === groupId);
    g?.subtasks?.forEach((st) => removeReminder(`sub:${scope}:${groupId}:${st.id}`));
    setter(list.filter((g) => g.id !== groupId));
  };
  const unresolvedOf = (scope) => {
    const list = scope === "daily" ? daily : scope === "weekly" ? weekly : monthly;
    const unresolved = [];
    list.forEach((group) =>
      group.subtasks.forEach((st) => {
        if (st.status === STATUS.OPEN) unresolved.push({ group, subtask: st });
      })
    );
    return unresolved;
  };
  const openResolution = (scope) => setPendingReset({ scope });
  const applyMove = (scope, groupId, subId) => {
    const list = clone(scope === "daily" ? daily : scope === "weekly" ? weekly : monthly);
    const setter = scope === "daily" ? setDaily : scope === "weekly" ? setWeekly : setMonthly;
    const g = list.find((x) => x.id === groupId);
    if (!g) return;
    const idxS = g.subtasks.findIndex((s) => s.id === subId);
    if (idxS < 0) return;
    const [moved] = g.subtasks.splice(idxS, 1);
    setter(list);
    const stamp = todayISO();
    if (scope === "daily") setCarryDaily((prev) => [...prev, { id: makeId(), text: moved.text, fromDate: stamp }]);
    if (scope === "weekly") setCarryWeekly((prev) => [...prev, { id: makeId(), text: moved.text, fromDate: stamp }]);
    if (scope === "monthly") setCarryMonthly((prev) => [...prev, { id: makeId(), text: moved.text, fromDate: stamp }]);
  };
  const applyComplete = (scope, groupId, subId) => setSubtaskStatus(scope, groupId, subId, STATUS.DONE);
  const applyHandover = (scope, groupId, subId, name) => setHandoverName(scope, groupId, subId, name || "");

  const completeReset = (scope) => {
    if (scope === "daily") {
      const next = [];
      if (carryDaily.length)
        next.push({
          id: makeId(),
          title: `Carried from ${carryDaily[0]?.fromDate || todayISO()}`,
          type: "carried",
          period: "daily",
          expanded: true,
          subtasks: carryDaily.map((c) => ({ id: c.id, text: c.text, status: STATUS.OPEN })),
        });
      next.push(TemplateDailyRoutine());
      setDaily(next);
      setCarryDaily([]);
    }
    if (scope === "weekly") {
      const next = [];
      if (carryWeekly.length)
        next.push({
          id: makeId(),
          title: `Carried from ${carryWeekly[0]?.fromDate || todayISO()}`,
          type: "carried",
          period: "weekly",
          expanded: true,
          subtasks: carryWeekly.map((c) => ({ id: c.id, text: c.text, status: STATUS.OPEN })),
        });
      next.push(TemplateWeeklyRoutine());
      setWeekly(next);
      setCarryWeekly([]);
    }
    if (scope === "monthly") {
      const next = [];
      if (carryMonthly.length)
        next.push({
          id: makeId(),
          title: `Carried from ${carryMonthly[0]?.fromDate || todayISO()}`,
          type: "carried",
          period: "monthly",
          expanded: true,
          subtasks: carryMonthly.map((c) => ({ id: c.id, text: c.text, status: STATUS.OPEN })),
        });
      next.push(TemplateMonthlyRoutine());
      setMonthly(next);
      setCarryMonthly([]);
    }
    setPendingReset(null);
  };

  // manual routine loaders
  const manualLoad = (scope) => {
    if (scope === "daily") setDaily((prev) => [...prev, TemplateDailyRoutine()]);
    if (scope === "weekly") setWeekly((prev) => [...prev, TemplateWeeklyRoutine()]);
    if (scope === "monthly") setMonthly((prev) => [...prev, TemplateMonthlyRoutine()]);
  };

  // manual custom group
  const addCustom = () => {
    if (!newTaskText.trim()) return;
    const group = {
      id: makeId(),
      title: newGroupTitle.trim() || "Custom",
      type: "custom",
      period: newGroupScope,
      expanded: true,
      subtasks: [{ id: makeId(), text: newTaskText.trim(), status: STATUS.OPEN }],
    };
    if (newGroupScope === "daily") setDaily((prev) => [group, ...prev]);
    if (newGroupScope === "weekly") setWeekly((prev) => [group, ...prev]);
    if (newGroupScope === "monthly") setMonthly((prev) => [group, ...prev]);
    setNewGroupTitle("");
    setNewTaskText("");
  };

  // Filtering & sorting
  function filterAndSortGroups(scope, groups) {
    const f = filters;
    const matchType = (g) =>
      (g.type === "routine" && f.showRoutine) ||
      (g.type === "custom" && f.showCustom) ||
      (g.type === "carried" && f.showCarried);
    const matchSub = (st) => {
      if (st.status === STATUS.OPEN && !f.showOpen) return false;
      if (st.status === STATUS.DONE && !f.showDone) return false;
      if (st.status === STATUS.HANDOVER && !f.showHandover) return false;
      if (f.q && !st.text.toLowerCase().includes(f.q.toLowerCase())) return false;
      return true;
    };
    const filtered = groups
      .map((g) => ({ ...g, subtasks: g.subtasks.filter(matchSub) }))
      .filter((g) => matchType(g) && g.subtasks.length);

    const sortStr = (a, b, key = "title") => a[key].localeCompare(b[key]);
    let out = filtered;
    if (f.sortGroups === "az") out = [...out].sort((a, b) => sortStr(a, b));
    if (f.sortGroups === "za") out = [...out].sort((a, b) => sortStr(b, a));

    out = out.map((g) => {
      let subs = g.subtasks;
      if (f.sortSubtasks === "az") subs = [...subs].sort((a, b) => a.text.localeCompare(b.text));
      if (f.sortSubtasks === "za") subs = [...subs].sort((a, b) => b.text.localeCompare(a.text));
      return { ...g, subtasks: subs };
    });
    return out;
  }

  // UI subcomponents
  const ProgressBar = ({ pct }) => (
    <div style={styles.progressBar}>
      <div style={styles.progressFill(pct)} />
    </div>
  );

  function SubtaskReminderQuick({ scope, groupId, subId, onSet, onRemove }) {
    const [when, setWhen] = useState("");
    const [rec, setRec] = useState(RECURRENCE.NONE);
    const id = `sub:${scope}:${groupId}:${subId}`;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="datetime-local" style={styles.input} value={when} onChange={(e) => setWhen(e.target.value)} />
        <select style={styles.input} value={rec} onChange={(e) => setRec(e.target.value)}>
          <option value={RECURRENCE.NONE}>Once</option>
          <option value={RECURRENCE.DAILY}>Daily</option>
          <option value={RECURRENCE.WEEKLY}>Weekly</option>
          <option value={RECURRENCE.MONTHLY}>Monthly</option>
        </select>
        <button style={styles.btn} onClick={() => onSet(scope, groupId, subId, when, rec)}>⏰</button>
        <button style={styles.btn} onClick={() => onRemove(id)}>Clear</button>
      </div>
    );
  }

  function QuickAddSub({ scope, groupId, onAdd }) {
    const [val, setVal] = useState("");
    return (
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        <input
          style={{ ...styles.input, flex: 1 }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Add a subtask to this group"
        />
        <button
          style={styles.btn}
          onClick={() => {
            if (!val.trim()) return;
            onAdd(val.trim());
            setVal("");
          }}
        >
          Add
        </button>
      </div>
    );
  }

  function GroupBlock({ scope, group, index, onDelete }) {
    const resolvedCount = group.subtasks.filter((s) => s.status !== STATUS.OPEN).length;
    const pct = group.subtasks.length ? Math.round((resolvedCount / group.subtasks.length) * 100) : 0;

    const [gWhen, setGWhen] = useState("");
    const [gRec, setGRec] = useState(RECURRENCE.NONE);

    return (
      <div
        style={styles.groupCard}
        draggable
        onDragStart={onDragStartGroup(scope, index, group.id)}
        onDragOver={onDragOver}
        onDrop={onDropGroup(scope, index)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button onClick={() => toggleGroup(scope, group.id)} style={{ textAlign: "left", flex: 1, background: "transparent", border: 0, cursor: "pointer" }}>
            <div style={{ fontWeight: 600 }}>{group.title}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {resolvedCount}/{group.subtasks.length} resolved
            </div>
            <div style={{ marginTop: 8 }}>
              <ProgressBar pct={pct} />
            </div>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="datetime-local" style={styles.input} value={gWhen} onChange={(e) => setGWhen(e.target.value)} />
            <select style={styles.input} value={gRec} onChange={(e) => setGRec(e.target.value)}>
              <option value={RECURRENCE.NONE}>Once</option>
              <option value={RECURRENCE.DAILY}>Daily</option>
              <option value={RECURRENCE.WEEKLY}>Weekly</option>
              <option value={RECURRENCE.MONTHLY}>Monthly</option>
            </select>
            <button style={styles.btn} onClick={() => setGroupReminder(scope, group.id, gWhen, gRec)}>Set reminder</button>
            <button style={styles.btn} onClick={() => onDelete(group.id)}>Delete</button>
          </div>
        </div>

        {group.expanded && (
          <div style={{ marginTop: 12 }} onDragOver={onDragOver} onDrop={onDropSub(scope, group.id)}>
            <div style={{ display: "grid", gap: 8 }}>
              {group.subtasks.map((st, subIdx) => (
                <div
                  key={st.id}
                  style={styles.subRow}
                  draggable
                  onDragStart={onDragStartSub(scope, group.id, subIdx, st.id)}
                  onDrop={onDropSub(scope, group.id, subIdx)}
                >
                  <input
                    type="checkbox"
                    checked={st.status === STATUS.DONE}
                    onChange={(e) => setSubtaskStatus(scope, group.id, st.id, e.target.checked ? STATUS.DONE : STATUS.OPEN)}
                    title="Mark done"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ textDecoration: st.status === STATUS.DONE ? "line-through" : "none", color: st.status === STATUS.DONE ? "#9ca3af" : "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {st.text}
                    </div>
                    {st.status === STATUS.HANDOVER && (
                      <div style={{ fontSize: 12, color: "#1d4ed8" }}>Handover → {st.handoverTo || "(no name)"}</div>
                    )}
                  </div>
                  {st.status !== STATUS.HANDOVER && (
                    <button style={styles.btn} onClick={() => setSubtaskStatus(scope, group.id, st.id, STATUS.HANDOVER)}>Handover</button>
                  )}
                  {st.status === STATUS.HANDOVER && (
                    <input
                      style={{ ...styles.input, width: 160 }}
                      value={st.handoverTo || ""}
                      onChange={(e) => setHandoverName(scope, group.id, st.id, e.target.value)}
                      placeholder="Colleague name"
                    />
                  )}
                  <SubtaskReminderQuick
                    scope={scope}
                    groupId={group.id}
                    subId={st.id}
                    onSet={setSubtaskReminder}
                    onRemove={removeReminder}
                  />
                </div>
              ))}
            </div>

            <QuickAddSub scope={scope} groupId={group.id} onAdd={(text) => addQuickSubtask(scope, group.id, text)} />
          </div>
        )}
      </div>
    );
  }

  function FiltersPanel() {
    return (
      <div style={styles.card}>
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Filters & sorting</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 14 }}>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showOpen} onChange={(e) => setFilters((f) => ({ ...f, showOpen: e.target.checked }))} />Open</label>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showDone} onChange={(e) => setFilters((f) => ({ ...f, showDone: e.target.checked }))} />Completed</label>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showHandover} onChange={(e) => setFilters((f) => ({ ...f, showHandover: e.target.checked }))} />Handovers</label>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showRoutine} onChange={(e) => setFilters((f) => ({ ...f, showRoutine: e.target.checked }))} />Routine groups</label>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showCustom} onChange={(e) => setFilters((f) => ({ ...f, showCustom: e.target.checked }))} />Custom groups</label>
          <label style={styles.labelRow}><input type="checkbox" checked={filters.showCarried} onChange={(e) => setFilters((f) => ({ ...f, showCarried: e.target.checked }))} />Carried groups</label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <input
            style={{ ...styles.input, flex: 1 }}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search text…"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>Sort groups</span>
            <select
              style={styles.input}
              value={filters.sortGroups}
              onChange={(e) => setFilters((f) => ({ ...f, sortGroups: e.target.value }))}
            >
              <option value="default">Default</option>
              <option value="az">A–Z</option>
              <option value="za">Z–A</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>Sort subtasks</span>
            <select
              style={styles.input}
              value={filters.sortSubtasks}
              onChange={(e) => setFilters((f) => ({ ...f, sortSubtasks: e.target.value }))}
            >
              <option value="default">Default</option>
              <option value="az">A–Z</option>
              <option value="za">Z–A</option>
            </select>
          </div>
          <button
            style={styles.btn}
            onClick={() =>
              setFilters({
                showOpen: true,
                showDone: true,
                showHandover: true,
                showRoutine: true,
                showCustom: true,
                showCarried: true,
                q: "",
                sortGroups: "default",
                sortSubtasks: "default",
              })
            }
          >
            Reset filters
          </button>
        </div>
      </div>
    );
  }

  function Section({ scope, title, groups, pct }) {
    const visible = filterAndSortGroups(scope, groups);
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={styles.card}>
          <div style={styles.sectionHeader}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h2>
            <div style={styles.progressWrap}>
              <ProgressBar pct={pct} />
              <span style={{ fontSize: 14, color: "#6b7280", minWidth: 28, textAlign: "right" }}>{pct}%</span>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button style={styles.btn} onClick={() => manualLoad(scope)}>Load {title.replace("Tasks", "Routine")}</button>
            <button style={styles.btn} onClick={() => openResolution(scope)}>Start new {scope} (resolve pending first)</button>
          </div>

          <div style={{ display: "grid", gap: 12 }} onDragOver={onDragOver}>
            {visible.map((g, idx) => (
              <GroupBlock key={g.id} scope={scope} group={g} index={idx} onDelete={(id) => deleteGroup(scope, id)} />
            ))}
            {!visible.length && (
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                Nothing matches your filters. Try clearing filters or loading a routine.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function ResolutionPanel({ scope, unresolved, onComplete, onHandover, onMove, onClose, disabledComplete }) {
    const title =
      scope === "daily" ? "Daily reset blocked" : scope === "weekly" ? "Weekly reset blocked" : "Monthly reset blocked";
    const moveLabel =
      scope === "daily" ? "Move to tomorrow" : scope === "weekly" ? "Move to next week" : "Move to next month";

    return (
      <div style={styles.modalBackdrop}>
        <div style={styles.modal}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
            <button style={styles.btn} onClick={onClose}>Close</button>
          </div>
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 6 }}>
            Resolve each item below by marking <strong>Complete</strong>, <strong>Handover</strong> (enter a colleague
            name), or <strong>{moveLabel}</strong>.
          </p>

          <div style={{ maxHeight: "50vh", overflow: "auto", marginTop: 12, display: "grid", gap: 8 }}>
            {unresolved.map((u) => (
              <div key={u.subtask.id} style={{ ...styles.subRow, alignItems: "stretch" }}>
                <div style={{ fontSize: 14, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{u.group.title}</div>
                  <div>{u.subtask.text}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.btnPrimary} onClick={() => onComplete(u.group.id, u.subtask.id)}>Complete</button>
                  <button style={styles.btn} onClick={() => onHandover(u.group.id, u.subtask.id)}>Handover</button>
                  <input
                    style={{ ...styles.input, width: 160 }}
                    value={u.subtask.handoverTo || ""}
                    onChange={(e) => onHandover(u.group.id, u.subtask.id, e.target.value)}
                    placeholder="Colleague name"
                  />
                  <button style={styles.btn} onClick={() => onMove(u.group.id, u.subtask.id)}>{moveLabel}</button>
                </div>
              </div>
            ))}
            {!unresolved.length && (
              <div style={{ fontSize: 14, color: "#047857" }}>
                All items are resolved. You can complete the reset now.
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "end", gap: 8, marginTop: 12 }}>
            <button disabled={disabledComplete} style={{ ...styles.btnPrimary, opacity: disabledComplete ? 0.5 : 1 }} onClick={() => onClose(true)}>
              Complete reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derived helpers for modal
  const buildUnresolved = (scope) => unresolvedOf(scope).map((x) => ({ group: x.group, subtask: x.subtask }));
  const handleResolutionClose = (doComplete) => {
    if (!pendingReset) return;
    if (doComplete) completeReset(pendingReset.scope);
    setPendingReset(null);
  };

  // Render
  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>Your To‑Do Lists (Grouped · DnD · Filters · Reminders)</h1>

      {/* Settings */}
      <div style={styles.card}>
        <h3 style={{ fontWeight: 600, marginBottom: 6 }}>Settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, fontSize: 14 }}>
          <label style={styles.labelRow}>
            <input type="checkbox" checked={settings.autoDaily} onChange={(e) => setSettings((s) => ({ ...s, autoDaily: e.target.checked }))} />
            Auto‑load Daily Routine at midnight
          </label>
          <label style={styles.labelRow}>
            <input type="checkbox" checked={settings.autoWeekly} onChange={(e) => setSettings((s) => ({ ...s, autoWeekly: e.target.checked }))} />
            Auto‑load Weekly Routine at week start
          </label>
          <label style={styles.labelRow}>
            <input type="checkbox" checked={settings.autoMonthly} onChange={(e) => setSettings((s) => ({ ...s, autoMonthly: e.target.checked }))} />
            Auto‑load Monthly Routine on the 1st
          </label>
          <label style={styles.labelRow}>
            <input type="checkbox" checked={settings.weekStartsMonday} onChange={(e) => setSettings((s) => ({ ...s, weekStartsMonday: e.target.checked }))} />
            Week starts on Monday
          </label>
        </div>
      </div>

      {/* Filters */}
      <FiltersPanel />

      {/* Manual custom add */}
      <div style={styles.card}>
        <h3 style={{ fontWeight: 600, marginBottom: 6 }}>Quick add a custom task group</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={styles.input}
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            placeholder="Group title (optional)"
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder="First subtask text"
          />
          <select style={styles.input} value={newGroupScope} onChange={(e) => setNewGroupScope(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button style={styles.btn} onClick={addCustom}>Add group</button>
        </div>
      </div>

      {/* Sections */}
      <Section scope="daily" title="Daily Tasks" groups={daily} pct={dailyPct} />
      <Section scope="weekly" title="Weekly Tasks" groups={weekly} pct={weeklyPct} />
      <Section scope="monthly" title="Monthly Tasks" groups={monthly} pct={monthlyPct} />

      {/* Resolution modal */}
      {pendingReset && (
        <ResolutionPanel
          scope={pendingReset.scope}
          unresolved={buildUnresolved(pendingReset.scope)}
          onComplete={(gid, sid) => applyComplete(pendingReset.scope, gid, sid)}
          onHandover={(gid, sid, name) => applyHandover(pendingReset.scope, gid, sid, name)}
          onMove={(gid, sid) => applyMove(pendingReset.scope, gid, sid)}
          onClose={handleResolutionClose}
          disabledComplete={unresolvedOf(pendingReset.scope).length > 0}
        />
      )}
    </div>
  );
}
