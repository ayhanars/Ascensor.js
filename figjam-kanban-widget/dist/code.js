"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/types.ts
  var EMPTY_FILTERS = {
    assignee: null,
    priority: null,
    due: null,
    status: null,
    stale: false,
    label: null
  };
  var STATUSES = ["todo", "inprogress", "blocked", "done"];
  var ACTIVE_STATUSES = ["todo", "inprogress", "blocked"];
  var PRIORITIES = ["low", "medium", "high"];
  var STATUS_LABEL = {
    todo: "To Do",
    inprogress: "In Progress",
    blocked: "Blocked",
    done: "Done"
  };
  var STATUS_SHORT = {
    todo: "TODO",
    inprogress: "DOING",
    blocked: "BLOCKED",
    done: "DONE"
  };
  var PRIORITY_LABEL = {
    low: "Low",
    medium: "Medium",
    high: "High"
  };
  var PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

  // src/dates.ts
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var pad = (n) => n < 10 ? "0" + n : String(n);
  function toISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
    return new Date(y, m - 1, d);
  }
  function todayISO() {
    return toISO(/* @__PURE__ */ new Date());
  }
  function addDaysISO(iso, days) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + days);
    return toISO(d);
  }
  function nextMondayISO() {
    const d = /* @__PURE__ */ new Date();
    const day = d.getDay();
    const delta = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + delta);
    return toISO(d);
  }
  function daysFromToday(iso) {
    const a = parseISO(todayISO()).getTime();
    const b = parseISO(iso).getTime();
    return Math.round((b - a) / 864e5);
  }
  function isOverdue(iso) {
    return !!iso && daysFromToday(iso) < 0;
  }
  function shortDate(iso) {
    const d = parseISO(iso);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  function weekdayDate(iso) {
    const d = parseISO(iso);
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  function dueLabel(iso) {
    const diff = daysFromToday(iso);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 1 && diff < 7) {
      const d = parseISO(iso);
      return `${DAYS[d.getDay()]} ${d.getDate()}`;
    }
    return shortDate(iso);
  }
  function fromTimestamp(ts) {
    return shortDate(toISO(new Date(ts)));
  }
  function ageInDays(ts) {
    return Math.floor((Date.now() - ts) / 864e5);
  }

  // src/theme.ts
  var C = {
    bg: "#FFFFFF",
    canvas: "#FAFAFB",
    surface: "#F3F4F6",
    surfaceAlt: "#E9EAEE",
    border: "#E5E7EB",
    borderStrong: "#CBD0D8",
    text: "#111827",
    muted: "#6B7280",
    faint: "#9CA3AF",
    accent: "#4F46E5",
    accentHover: "#4338CA",
    accentSoft: "#EEF2FF",
    accentText: "#3730A3",
    danger: "#DC2626",
    dangerSoft: "#FEE2E2",
    warn: "#B45309",
    warnSoft: "#FEF3C7",
    success: "#059669",
    successSoft: "#D1FAE5"
  };
  var STATUS_COLOR = {
    todo: "#64748B",
    inprogress: "#2563EB",
    blocked: "#EA580C",
    done: "#059669"
  };
  var STATUS_SOFT = {
    todo: "#E2E8F0",
    inprogress: "#DBEAFE",
    blocked: "#FFEDD5",
    done: "#D1FAE5"
  };
  var STATUS_TINT = {
    todo: "#F1F3F6",
    inprogress: "#EDF3FF",
    blocked: "#FFF3EB",
    done: "#ECF8F2"
  };
  var PRIORITY_COLOR = {
    high: "#BE123C",
    medium: "#B45309",
    low: "#64748B"
  };
  var PRIORITY_SOFT = {
    high: "#FFE4E6",
    medium: "#FEF3C7",
    low: "#E2E8F0"
  };
  var PRIORITY_GLYPH = {
    high: "\u2191 High",
    medium: "\u2192 Med",
    low: "\u2193 Low"
  };
  var AVATARS = [
    ["#DBEAFE", "#1D4ED8"],
    ["#FCE7F3", "#BE185D"],
    ["#D1FAE5", "#047857"],
    ["#FEF3C7", "#B45309"],
    ["#EDE9FE", "#6D28D9"],
    ["#FFEDD5", "#C2410C"],
    ["#CFFAFE", "#0E7490"],
    ["#E2E8F0", "#334155"]
  ];
  function avatarColors(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
    return AVATARS[h % AVATARS.length];
  }
  var LABELS = [
    ["#E0E7FF", "#3730A3"],
    ["#FCE7F3", "#9D174D"],
    ["#D1FAE5", "#065F46"],
    ["#FEF3C7", "#92400E"],
    ["#CFFAFE", "#155E75"],
    ["#FFE4E6", "#9F1239"],
    ["#EDE9FE", "#5B21B6"],
    ["#ECFCCB", "#3F6212"]
  ];
  function labelColors(name) {
    let h = 7;
    for (let i = 0; i < name.length; i++) h = h * 33 + name.charCodeAt(i) >>> 0;
    return LABELS[h % LABELS.length];
  }
  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  var wrap = (inner, color, size, sw) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  var PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronUp: '<path d="M6 15l6-6 6 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    archive: '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V20h14V8.5M10 13h4"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/>',
    week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3M8 17.5h3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    tag: '<path d="M3 11V4h7l10 10-7 7z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'
  };
  function icon(name, color, size = 12, strokeWidth = 1.8) {
    return wrap(PATHS[name], color, size, strokeWidth);
  }

  // src/code.tsx
  var { widget } = figma;
  var { AutoLayout, Text, Input, SVG, Image, Ellipse, Rectangle, useSyncedState, useSyncedMap, usePropertyMenu } = widget;
  var COL_W = 252;
  var COL_GAP = 10;
  var BOARD_W = COL_W * 4 + COL_GAP * 3;
  var COLLAPSED_W = 40;
  var CARD_W = COL_W - 20;
  var PANEL_W = 300;
  var FONT = "Inter";
  var uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var toast = (msg) => figma.notify(msg, { timeout: 1400 });
  var shortName = (s, n = 14) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  var subtasksOf = (t) => {
    var _a;
    return (_a = t.subtasks) != null ? _a : [];
  };
  var labelsOf = (t) => {
    var _a;
    return (_a = t.labels) != null ? _a : [];
  };
  function Icon({ name, color, size = 12 }) {
    return /* @__PURE__ */ figma.widget.h(SVG, { src: icon(name, color, size), width: size, height: size });
  }
  function StatusGlyph({ status, size = 12, color, muted }) {
    const c = color != null ? color : muted ? C.faint : STATUS_COLOR[status];
    const r = size / 2;
    if (status === "done") {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: size, height: size, cornerRadius: r, fill: c, horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(size * 0.66), fontWeight: 700, fill: "#FFFFFF", lineHeight: size }, "\u2713"));
    }
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: size, height: size, cornerRadius: r, stroke: c, strokeWidth: 1.5, strokeAlign: "inside", horizontalAlignItems: "center", verticalAlignItems: "center" }, status === "inprogress" ? /* @__PURE__ */ figma.widget.h(Ellipse, { width: size - 5, height: size - 5, fill: c, arcData: { startingAngle: -Math.PI / 2, endingAngle: Math.PI / 2, innerRadius: 0 } }) : status === "blocked" ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: Math.round(size * 0.45), height: 1.5, fill: c }) : null);
  }
  function Avatar({ name, photo, size = 18 }) {
    if (!name) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: size, height: size, cornerRadius: size / 2, stroke: C.borderStrong, strokeDashPattern: [2, 2], horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(size * 0.5), fontWeight: 600, fill: C.faint, lineHeight: size }, "?"));
    }
    if (photo) {
      return /* @__PURE__ */ figma.widget.h(Image, { src: photo, width: size, height: size, cornerRadius: size / 2 });
    }
    const [bg, fg] = avatarColors(name);
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: size, height: size, cornerRadius: size / 2, fill: bg, horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(size * 0.44), fontWeight: 700, fill: fg, lineHeight: size, letterSpacing: 0.2 }, initials(name)));
  }
  function Label(props) {
    var _a, _b, _c, _d, _e;
    const size = (_a = props.size) != null ? _a : 11;
    return /* @__PURE__ */ figma.widget.h(
      Text,
      {
        fontFamily: FONT,
        fontSize: size,
        fontWeight: (_b = props.weight) != null ? _b : 400,
        fill: (_c = props.color) != null ? _c : C.text,
        width: (_d = props.width) != null ? _d : "hug-contents",
        truncate: props.truncate,
        textDecoration: props.strike ? "strikethrough" : "none",
        italic: props.italic,
        horizontalAlignText: (_e = props.align) != null ? _e : "left",
        lineHeight: Math.round(size * 1.35)
      },
      props.children
    );
  }
  function Btn(props) {
    var _a;
    const tone = (_a = props.tone) != null ? _a : "default";
    const fill = tone === "primary" ? C.accent : tone === "ghost" ? void 0 : tone === "danger" ? C.dangerSoft : C.bg;
    const color = tone === "primary" ? "#FFFFFF" : tone === "danger" ? C.danger : tone === "ghost" ? C.muted : C.text;
    const hover = tone === "primary" ? C.accentHover : tone === "danger" ? "#FECACA" : C.surfaceAlt;
    const pad2 = props.small ? { vertical: 3, horizontal: 7 } : { vertical: 6, horizontal: 10 };
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "horizontal",
        spacing: 5,
        padding: pad2,
        cornerRadius: 8,
        fill,
        stroke: tone === "default" ? C.border : void 0,
        strokeWidth: 1,
        verticalAlignItems: "center",
        onClick: props.onClick,
        hoverStyle: { fill: hover },
        tooltip: props.tooltip
      },
      props.icon ? /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color, size: props.small ? 11 : 12 }) : null,
      props.label ? /* @__PURE__ */ figma.widget.h(Label, { size: props.small ? 10 : 11, weight: 600, color }, props.label) : null
    );
  }
  function IconBtn(props) {
    var _a, _b;
    const s = (_a = props.size) != null ? _a : 20;
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: s, height: s, cornerRadius: 6, horizontalAlignItems: "center", verticalAlignItems: "center", onClick: props.onClick, hoverStyle: { fill: C.surfaceAlt }, tooltip: props.tooltip }, /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color: (_b = props.color) != null ? _b : C.muted, size: Math.round(s * 0.6) }));
  }
  function Chip(props) {
    var _a, _b, _c;
    const active = !!props.active;
    const color = (_a = props.color) != null ? _a : C.accent;
    const soft = (_b = props.soft) != null ? _b : C.accentSoft;
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "horizontal",
        spacing: 4,
        padding: props.small ? { vertical: 2, horizontal: 7 } : { vertical: 3, horizontal: 8 },
        cornerRadius: 999,
        fill: active ? soft : C.bg,
        stroke: active ? color : C.border,
        strokeWidth: 1,
        strokeDashPattern: props.dashed && !active ? [3, 2] : void 0,
        verticalAlignItems: "center",
        onClick: props.onClick,
        hoverStyle: { fill: active ? soft : C.surface, stroke: color },
        tooltip: props.tooltip
      },
      (_c = props.lead) != null ? _c : null,
      /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: active ? color : C.muted }, props.label)
    );
  }
  function Pill({ text, color, fill, size = 9, onClick, tooltip }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { vertical: 1, horizontal: 6 }, cornerRadius: 999, fill, verticalAlignItems: "center", onClick, tooltip }, /* @__PURE__ */ figma.widget.h(Label, { size, weight: 700, color }, text));
  }
  function LabelPill({ name, size = 9, onClick, active = true }) {
    const [bg, fg] = labelColors(name);
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        padding: { vertical: 1, horizontal: 6 },
        cornerRadius: 4,
        fill: active ? bg : C.bg,
        stroke: active ? void 0 : C.border,
        strokeDashPattern: active ? void 0 : [3, 2],
        verticalAlignItems: "center",
        onClick,
        hoverStyle: onClick ? { fill: bg } : void 0,
        tooltip: onClick ? active ? `Remove label \u201C${name}\u201D` : `Add label \u201C${name}\u201D` : `Label: ${name}`
      },
      /* @__PURE__ */ figma.widget.h(Label, { size, weight: 700, color: active ? fg : C.muted }, name)
    );
  }
  function Divider() {
    return /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: 1, fill: C.border });
  }
  function Progress({ done, total, width }) {
    const pct = total ? done / total : 0;
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width, height: 4, cornerRadius: 2, fill: C.surfaceAlt }, pct > 0 ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: typeof width === "number" ? Math.max(4, Math.round(width * pct)) : "fill-parent", height: 4, cornerRadius: 2, fill: pct >= 1 ? C.success : C.accent }) : null);
  }
  function pickDate(title, current, onPick) {
    return new Promise((resolve) => {
      figma.showUI(__html__, { width: 300, height: 190, title: "Due date" });
      figma.ui.postMessage({ type: "init", title, value: current, today: todayISO() });
      figma.ui.onmessage = (msg) => {
        var _a;
        if (msg && msg.type === "set") onPick((_a = msg.value) != null ? _a : null);
        figma.closePlugin();
        resolve();
      };
    });
  }
  function Widget() {
    var _a;
    const tasks = useSyncedMap("tasks");
    const people = useSyncedMap("people");
    const [view, setView] = useSyncedState("view", "board");
    const [collapsed, setCollapsed] = useSyncedState("collapsed", { done: true });
    const [openId, setOpenId] = useSyncedState("openId", null);
    const [confirmDeleteId, setConfirmDeleteId] = useSyncedState("confirmDeleteId", null);
    const [filters, setFilters] = useSyncedState("filters", EMPTY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useSyncedState("filtersOpen", false);
    const [search, setSearch] = useSyncedState("search", "");
    const [sort, setSort] = useSyncedState("sort", "due");
    const [quickAddOpen, setQuickAddOpen] = useSyncedState("quickAddOpen", false);
    const [draft, setDraft] = useSyncedState("draft", { status: "todo", priority: null, due: null, assignee: "", label: null });
    const [celebrating, setCelebrating] = useSyncedState("celebrating", null);
    const [showArchived, setShowArchived] = useSyncedState("showArchived", false);
    const [doneSearch, setDoneSearch] = useSyncedState("doneSearch", "");
    const [staleDays, setStaleDays] = useSyncedState("staleDays", 7);
    const [boardTitle, setBoardTitle] = useSyncedState("boardTitle", "Team tasks");
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const nextMon = nextMondayISO();
    const all = tasks.values();
    const live = all.filter((t) => !t.archived);
    const active = live.filter((t) => t.status !== "done");
    const done = live.filter((t) => t.status === "done");
    const archived = all.filter((t) => t.archived);
    const openTask = openId ? (_a = tasks.get(openId)) != null ? _a : null : null;
    const syncPeople = () => {
      var _a2, _b;
      const seen = [figma.currentUser, ...figma.activeUsers];
      const now = Date.now();
      for (const u of seen) {
        if (!u || !u.name) continue;
        const prev = people.get(u.name);
        if (!prev || prev.photoUrl !== ((_a2 = u.photoUrl) != null ? _a2 : null) || now - prev.seenAt > 36e5) {
          people.set(u.name, { name: u.name, photoUrl: (_b = u.photoUrl) != null ? _b : null, seenAt: now });
        }
      }
    };
    const photoOf = (name) => {
      var _a2, _b;
      return name ? (_b = (_a2 = people.get(name)) == null ? void 0 : _a2.photoUrl) != null ? _b : null : null;
    };
    const patch = (id, p) => {
      const t = tasks.get(id);
      if (!t) return;
      tasks.set(id, __spreadProps(__spreadValues(__spreadValues({}, t), p), { updatedAt: Date.now() }));
      syncPeople();
    };
    const createTask = (title, extra = {}) => {
      const clean = title.trim();
      if (!clean) return;
      const now = Date.now();
      const t = __spreadValues({
        id: uid(),
        title: clean,
        description: "",
        status: "todo",
        assignee: "",
        due: null,
        priority: null,
        labels: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        archived: false
      }, extra);
      if (t.status === "done") t.completedAt = now;
      tasks.set(t.id, t);
      syncPeople();
      toast(`Added \u201C${shortName(clean, 34)}\u201D`);
    };
    const complete = (id) => {
      const t = tasks.get(id);
      if (!t || t.status === "done") return;
      setCelebrating(id);
      return new Promise((resolve) => {
        setTimeout(() => {
          patch(id, { status: "done", completedAt: Date.now() });
          setCelebrating(null);
          if (openId === id) setOpenId(null);
          toast("\u2713 Completed \u2014 find it in Done");
          resolve();
        }, 600);
      });
    };
    const setStatus = (id, status) => {
      const t = tasks.get(id);
      if (!t || t.status === status) return;
      if (status === "done") return complete(id);
      patch(id, { status, completedAt: null });
      toast(`Moved to ${STATUS_LABEL[status]}`);
    };
    const reopen = (id) => {
      patch(id, { status: "todo", completedAt: null, archived: false });
      toast("Reopened in To Do");
    };
    const archive = (id, flag) => {
      patch(id, { archived: flag });
      toast(flag ? "Archived" : "Restored");
    };
    const remove = (id) => {
      tasks.delete(id);
      setConfirmDeleteId(null);
      if (openId === id) setOpenId(null);
      toast("Task deleted");
    };
    const setDue = (id, due) => {
      patch(id, { due });
      toast(due ? `Due ${dueLabel(due)}` : "Due date cleared");
    };
    const toggleLabel = (id, label) => {
      const t = tasks.get(id);
      if (!t) return;
      const cur = labelsOf(t);
      patch(id, { labels: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] });
    };
    const addSubtask = (id, title) => {
      const clean = title.trim();
      const t = tasks.get(id);
      if (!t || !clean) return;
      patch(id, { subtasks: [...subtasksOf(t), { id: uid(), title: clean, done: false }] });
    };
    const patchSubtask = (id, sid, p) => {
      const t = tasks.get(id);
      if (!t) return;
      const next = p === null ? subtasksOf(t).filter((s) => s.id !== sid) : subtasksOf(t).map((s) => s.id === sid ? __spreadValues(__spreadValues({}, s), p) : s);
      patch(id, { subtasks: next });
      if (p && p.done && next.length && next.every((s) => s.done)) toast("All subtasks done \u{1F389}");
    };
    const myName = () => {
      var _a2;
      syncPeople();
      const name = (_a2 = figma.currentUser) == null ? void 0 : _a2.name;
      if (!name) toast("Could not read your Figma name \u2014 type a name instead");
      return name != null ? name : null;
    };
    const setFilter = (key, value) => setFilters(__spreadProps(__spreadValues({}, filters), { [key]: value }));
    const toggleFilter = (key, value) => setFilter(key, filters[key] === value ? key === "stale" ? false : null : value);
    const activeFilterCount = (filters.assignee ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.due ? 1 : 0) + (filters.status ? 1 : 0) + (filters.stale ? 1 : 0) + (filters.label ? 1 : 0);
    const anyFilter = activeFilterCount > 0 || search.trim().length > 0;
    const clearFilters = () => {
      setFilters(EMPTY_FILTERS);
      setSearch("");
    };
    const isStale = (t) => t.status === "todo" && ageInDays(t.createdAt) >= staleDays;
    const q = search.trim().toLowerCase();
    const matches = (t) => {
      if (q) {
        const hay = `${t.title} ${t.description} ${t.assignee} ${labelsOf(t).join(" ")} ${subtasksOf(t).map((s) => s.title).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.assignee === "__none__" && t.assignee) return false;
      if (filters.assignee && filters.assignee !== "__none__" && t.assignee !== filters.assignee) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.stale && !isStale(t)) return false;
      if (filters.label && !labelsOf(t).includes(filters.label)) return false;
      if (filters.due) {
        if (filters.due === "none" && t.due) return false;
        if (filters.due !== "none" && !t.due) return false;
        if (filters.due === "overdue" && !(isOverdue(t.due) && t.status !== "done")) return false;
        if (filters.due === "today" && t.due !== today) return false;
        if (filters.due === "week" && t.due) {
          const d = daysFromToday(t.due);
          if (d < 0 || d > 6) return false;
        }
      }
      return true;
    };
    const compare = (a, b) => {
      var _a2, _b, _c, _d;
      if (sort === "created") return b.createdAt - a.createdAt;
      if (sort === "priority") {
        const pr2 = PRIORITY_RANK[(_a2 = a.priority) != null ? _a2 : "none"] - PRIORITY_RANK[(_b = b.priority) != null ? _b : "none"];
        if (pr2 !== 0) return pr2;
      }
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      const pr = PRIORITY_RANK[(_c = a.priority) != null ? _c : "none"] - PRIORITY_RANK[(_d = b.priority) != null ? _d : "none"];
      if (pr !== 0) return pr;
      return a.createdAt - b.createdAt;
    };
    const knownAssignees = Array.from(/* @__PURE__ */ new Set([...live.map((t) => t.assignee).filter((a) => a), ...people.keys()])).sort();
    const knownLabels = Array.from(new Set(live.reduce((acc, t) => acc.concat(labelsOf(t)), []))).sort();
    const overdueCount = active.filter((t) => isOverdue(t.due)).length;
    const blockedCount = active.filter((t) => t.status === "blocked").length;
    const unassignedCount = active.filter((t) => !t.assignee).length;
    const staleCount = active.filter(isStale).length;
    usePropertyMenu(
      [
        {
          itemType: "dropdown",
          propertyName: "view",
          tooltip: "View",
          selectedOption: view,
          options: [
            { option: "board", label: "Board" },
            { option: "week", label: "Week" },
            { option: "done", label: "Done" }
          ]
        },
        {
          itemType: "dropdown",
          propertyName: "sort",
          tooltip: "Sort cards",
          selectedOption: sort,
          options: [
            { option: "due", label: "Sort: due date" },
            { option: "priority", label: "Sort: priority" },
            { option: "created", label: "Sort: newest" }
          ]
        },
        {
          itemType: "dropdown",
          propertyName: "stale",
          tooltip: "Stale threshold",
          selectedOption: String(staleDays),
          options: [
            { option: "3", label: "Stale after 3 days" },
            { option: "7", label: "Stale after 7 days" },
            { option: "14", label: "Stale after 14 days" },
            { option: "30", label: "Stale after 30 days" }
          ]
        },
        { itemType: "separator" },
        { itemType: "action", propertyName: "expandAll", tooltip: "Expand all columns" },
        { itemType: "action", propertyName: "collapseAll", tooltip: "Collapse all columns" },
        { itemType: "action", propertyName: "clearFilters", tooltip: "Clear filters" },
        { itemType: "separator" },
        { itemType: "action", propertyName: "archiveOld", tooltip: "Archive done > 14 days" },
        { itemType: "action", propertyName: "samples", tooltip: "Add sample tasks" }
      ],
      ({ propertyName, propertyValue }) => {
        switch (propertyName) {
          case "view":
            setView(propertyValue);
            break;
          case "sort":
            setSort(propertyValue);
            break;
          case "stale":
            setStaleDays(parseInt(propertyValue, 10));
            break;
          case "expandAll":
            setCollapsed({});
            break;
          case "collapseAll":
            setCollapsed({ todo: true, inprogress: true, blocked: true, done: true });
            break;
          case "clearFilters":
            clearFilters();
            break;
          case "archiveOld":
            archiveOld();
            break;
          case "samples":
            addSamples();
            break;
        }
      }
    );
    const archiveOld = () => {
      let n = 0;
      for (const t of done) {
        if (t.completedAt && ageInDays(t.completedAt) >= 14) {
          tasks.set(t.id, __spreadProps(__spreadValues({}, t), { archived: true, updatedAt: Date.now() }));
          n++;
        }
      }
      toast(n ? `Archived ${n} completed task${n === 1 ? "" : "s"}` : "Nothing older than 14 days to archive");
    };
    const addSamples = () => {
      const d = (n) => addDaysISO(today, n);
      const st = (titles, doneCount = 0) => titles.map((title, i) => ({ id: uid() + i, title, done: i < doneCount }));
      const samples = [
        { title: "Draft Q4 roadmap outline", status: "todo", priority: "high", due: d(1), assignee: "Maya Chen", labels: ["Roadmap"], subtasks: st(["Collect team input", "Write first draft", "Review with leads"], 1) },
        { title: "Review onboarding copy", status: "todo", priority: "medium", due: d(3), labels: ["Website"] },
        { title: "Collect customer interview notes", status: "todo", priority: "low", due: d(-2), assignee: "Jon Park", labels: ["Research"] },
        { title: "Prototype billing settings page", status: "inprogress", priority: "high", due: d(0), assignee: "Priya Nair", labels: ["Billing", "Design"], subtasks: st(["Wireframe", "Hi-fi mockup", "Prototype flows", "Usability test"], 2) },
        { title: "Update design tokens", status: "inprogress", priority: "medium", due: d(5), assignee: "Maya Chen", labels: ["Design"] },
        { title: "Waiting on legal: privacy copy", status: "blocked", priority: "high", due: d(-1), assignee: "Jon Park", labels: ["Website"], description: "Blocked until legal signs off on the new consent wording." },
        { title: "Ship notification preferences", status: "done", priority: "medium", due: d(-3), assignee: "Priya Nair", labels: ["Billing"] },
        { title: "Fix mobile nav overlap", status: "done", priority: "high", due: d(-6), assignee: "Maya Chen", labels: ["Website"] }
      ];
      samples.forEach((s, i) => {
        var _a2, _b, _c, _d, _e, _f, _g;
        const now = Date.now() - (samples.length - i) * 1e3;
        const t = {
          id: uid() + i,
          title: s.title,
          description: (_a2 = s.description) != null ? _a2 : "",
          status: (_b = s.status) != null ? _b : "todo",
          assignee: (_c = s.assignee) != null ? _c : "",
          due: (_d = s.due) != null ? _d : null,
          priority: (_e = s.priority) != null ? _e : null,
          labels: (_f = s.labels) != null ? _f : [],
          subtasks: (_g = s.subtasks) != null ? _g : [],
          createdAt: now - 9 * 864e5 * (i % 2),
          updatedAt: now,
          completedAt: s.status === "done" ? now - 2 * 864e5 : null,
          archived: false
        };
        tasks.set(t.id, t);
      });
      syncPeople();
      toast("Added 8 sample tasks");
    };
    function Card({ task, width, showStatus }) {
      const open = openId === task.id;
      const isCelebrating = celebrating === task.id;
      const overdue = isOverdue(task.due) && task.status !== "done";
      const stale = isStale(task);
      const isDone = task.status === "done" || isCelebrating;
      const stripe = isCelebrating ? C.success : task.status === "blocked" ? STATUS_COLOR.blocked : overdue ? C.danger : null;
      const subs = subtasksOf(task);
      const subsDone = subs.filter((s) => s.done).length;
      const labels = labelsOf(task);
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: task.id,
          direction: "horizontal",
          width,
          fill: isCelebrating ? C.successSoft : open ? C.accentSoft : C.bg,
          cornerRadius: 8,
          stroke: open ? C.accent : isCelebrating ? C.success : C.border,
          strokeWidth: open ? 1.5 : 1,
          hoverStyle: open ? void 0 : { stroke: C.borderStrong },
          overflow: "hidden"
        },
        stripe ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: 3, height: "fill-parent", fill: stripe }) : null,
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 5, padding: { vertical: 7, horizontal: 9 } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            width: 16,
            height: 16,
            cornerRadius: 8,
            fill: isDone ? C.success : void 0,
            stroke: isDone ? void 0 : C.borderStrong,
            strokeWidth: 1.5,
            strokeAlign: "inside",
            horizontalAlignItems: "center",
            verticalAlignItems: "center",
            onClick: () => complete(task.id),
            hoverStyle: { fill: isDone ? C.success : C.successSoft, stroke: C.success },
            tooltip: isDone ? "Completed" : "Mark done"
          },
          isDone ? /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: 10, fontWeight: 700, fill: "#FFFFFF", lineHeight: 16 }, "\u2713") : null
        ), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", onClick: () => setOpenId(open ? null : task.id), tooltip: open ? "Close details" : "Open details" }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 600, width: "fill-parent", truncate: 2, strike: isDone, color: isDone ? C.muted : C.text }, task.title || "Untitled")), task.priority ? /* @__PURE__ */ figma.widget.h(Pill, { text: PRIORITY_GLYPH[task.priority], color: PRIORITY_COLOR[task.priority], fill: PRIORITY_SOFT[task.priority], tooltip: `${PRIORITY_LABEL[task.priority]} priority`, onClick: () => setOpenId(task.id) }) : null), labels.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, wrap: true, width: "fill-parent" }, labels.slice(0, 3).map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, onClick: () => setFilter("label", filters.label === l ? null : l) })), labels.length > 3 ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, `+${labels.length - 3}`) : null) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center", wrap: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center", onClick: () => setOpenId(task.id), tooltip: task.assignee ? `Assigned to ${task.assignee}` : "Unassigned \u2014 click to assign" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee) }), task.assignee ? null : /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: C.faint, italic: true }, "Unassigned")), task.due ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            padding: { vertical: 1, horizontal: 6 },
            cornerRadius: 999,
            fill: overdue ? C.dangerSoft : task.due === today ? C.accentSoft : C.surface,
            onClick: () => setOpenId(task.id),
            hoverStyle: { fill: overdue ? "#FECACA" : C.surfaceAlt },
            tooltip: overdue ? `Overdue \u2014 was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`
          },
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: overdue || task.due === today ? 700 : 500, color: overdue ? C.danger : task.due === today ? C.accentText : C.muted }, overdue ? `Overdue \xB7 ${dueLabel(task.due)}` : dueLabel(task.due))
        ) : /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { vertical: 1, horizontal: 6 }, cornerRadius: 999, onClick: () => setDue(task.id, today), hoverStyle: { fill: C.surface }, tooltip: "No due date \u2014 click to set Today" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: C.faint }, "+ date")), subs.length ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 4,
            padding: { vertical: 1, horizontal: 6 },
            cornerRadius: 999,
            fill: subsDone === subs.length ? C.successSoft : C.surface,
            verticalAlignItems: "center",
            onClick: () => setOpenId(task.id),
            tooltip: `${subsDone} of ${subs.length} subtasks done`
          },
          /* @__PURE__ */ figma.widget.h(Progress, { done: subsDone, total: subs.length, width: 22 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: subsDone === subs.length ? C.success : C.muted }, `${subsDone}/${subs.length}`)
        ) : null, stale && !isDone ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${ageInDays(task.createdAt)}d old`, color: C.warn, fill: C.warnSoft, size: 10, tooltip: `In To Do for ${ageInDays(task.createdAt)} days` }) : null, showStatus ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, padding: { vertical: 1, horizontal: 6 }, cornerRadius: 999, fill: STATUS_SOFT[task.status], verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: task.status, size: 10 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: STATUS_COLOR[task.status] }, STATUS_LABEL[task.status])) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 1, cornerRadius: 6, fill: C.surface, padding: 1 }, STATUSES.map((s) => {
          const current = task.status === s && !isCelebrating;
          return /* @__PURE__ */ figma.widget.h(
            AutoLayout,
            {
              key: s,
              width: 22,
              height: 18,
              cornerRadius: 5,
              fill: current ? C.bg : void 0,
              stroke: current ? C.border : void 0,
              horizontalAlignItems: "center",
              verticalAlignItems: "center",
              onClick: () => setStatus(task.id, s),
              hoverStyle: { fill: current ? C.bg : STATUS_SOFT[s] },
              tooltip: current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`
            },
            /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 11, muted: !current })
          );
        }))), isCelebrating ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: C.success }, "\u2713 Done! Moving to Completed\u2026") : null)
      );
    }
    function PropRow({ label, children, top }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 8, verticalAlignItems: top ? "start" : "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 58, padding: { top: top ? 4 : 0 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: C.muted }, label)), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 4, wrap: true, verticalAlignItems: "center" }, children));
    }
    function Inspector({ task }) {
      const confirming = confirmDeleteId === task.id;
      const customDue = !!task.due && task.due !== today && task.due !== tomorrow && task.due !== nextMon;
      const overdue = isOverdue(task.due) && task.status !== "done";
      const subs = subtasksOf(task);
      const subsDone = subs.filter((s) => s.done).length;
      const labels = labelsOf(task);
      const peopleRow = knownAssignees.filter((a) => a !== task.assignee).slice(0, 8);
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          direction: "vertical",
          width: PANEL_W,
          spacing: 10,
          padding: { top: 0, bottom: 12, left: 12, right: 12 },
          fill: C.bg,
          cornerRadius: 12,
          stroke: C.border,
          overflow: "hidden",
          effect: { type: "drop-shadow", color: { r: 0.07, g: 0.09, b: 0.15, a: 0.1 }, offset: { x: 0, y: 6 }, blur: 18 }
        },
        /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: 4, fill: STATUS_COLOR[task.status] }),
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, padding: { vertical: 2, horizontal: 7 }, cornerRadius: 999, fill: STATUS_SOFT[task.status], verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: task.status, size: 10 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: STATUS_COLOR[task.status] }, STATUS_LABEL[task.status])), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", tooltip: "Close", onClick: () => setOpenId(null) })),
        /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: task.title,
            placeholder: "Task title",
            onTextEditEnd: (e) => {
              const v = e.characters.trim();
              if (v && v !== task.title) patch(task.id, { title: v });
            },
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 700,
            fill: C.text,
            width: "fill-parent",
            inputBehavior: "wrap",
            inputFrameProps: { padding: 0 }
          }
        ),
        /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: task.description || null,
            placeholder: "Add a description\u2026",
            onTextEditEnd: (e) => {
              if (e.characters !== task.description) patch(task.id, { description: e.characters });
            },
            fontFamily: FONT,
            fontSize: 11,
            fill: C.text,
            placeholderProps: { fill: C.faint },
            width: "fill-parent",
            inputBehavior: "multiline",
            inputFrameProps: { padding: { vertical: 6, horizontal: 8 }, fill: C.surface, cornerRadius: 8 }
          }
        ),
        /* @__PURE__ */ figma.widget.h(Divider, null),
        /* @__PURE__ */ figma.widget.h(PropRow, { label: "Status" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 1, cornerRadius: 8, fill: C.surface, padding: 2 }, STATUSES.map((s) => {
          const current = task.status === s;
          return /* @__PURE__ */ figma.widget.h(
            AutoLayout,
            {
              key: s,
              direction: "horizontal",
              spacing: 4,
              padding: { vertical: 3, horizontal: current ? 8 : 6 },
              cornerRadius: 6,
              fill: current ? C.bg : void 0,
              stroke: current ? C.border : void 0,
              verticalAlignItems: "center",
              onClick: () => setStatus(task.id, s),
              hoverStyle: { fill: current ? C.bg : STATUS_SOFT[s] },
              tooltip: current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`
            },
            /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 11, muted: !current }),
            current ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: STATUS_COLOR[s] }, STATUS_LABEL[s]) : null
          );
        }))),
        /* @__PURE__ */ figma.widget.h(PropRow, { label: "Due", top: true }, task.due ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center", padding: { vertical: 2, horizontal: 8 }, cornerRadius: 999, fill: overdue ? C.dangerSoft : C.accentSoft }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: overdue ? C.danger : C.accentText }, overdue ? `Overdue \xB7 ${weekdayDate(task.due)}` : weekdayDate(task.due)), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 14, color: overdue ? C.danger : C.accentText, tooltip: "Clear due date", onClick: () => setDue(task.id, null) })) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "No due date"), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, wrap: true, width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: task.due === today, onClick: () => setDue(task.id, today) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Tomorrow", active: task.due === tomorrow, onClick: () => setDue(task.id, tomorrow) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Next Mon", active: task.due === nextMon, onClick: () => setDue(task.id, nextMon) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Pick date\u2026", active: customDue, onClick: () => pickDate(task.title, task.due, (iso) => setDue(task.id, iso)) }))),
        /* @__PURE__ */ figma.widget.h(PropRow, { label: "Owner", top: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center", width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee), size: 22 }), /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: task.assignee || null,
            placeholder: "Unassigned \u2014 type a name",
            onTextEditEnd: (e) => {
              const v = e.characters.trim();
              if (v !== task.assignee) patch(task.id, { assignee: v });
            },
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            fill: C.text,
            placeholderProps: { fill: C.faint, fontWeight: 400, italic: true },
            width: "fill-parent",
            inputBehavior: "truncate",
            inputFrameProps: { padding: { vertical: 4, horizontal: 8 }, fill: C.surface, cornerRadius: 8 }
          }
        ), /* @__PURE__ */ figma.widget.h(
          Chip,
          {
            small: true,
            label: "Me",
            tooltip: "Assign to me",
            onClick: () => {
              const name = myName();
              if (name) patch(task.id, { assignee: task.assignee === name ? "" : name });
            }
          }
        )), peopleRow.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, wrap: true, width: "fill-parent", verticalAlignItems: "center" }, peopleRow.map((a) => /* @__PURE__ */ figma.widget.h(AutoLayout, { key: a, cornerRadius: 999, padding: 1, onClick: () => patch(task.id, { assignee: a }), hoverStyle: { fill: C.accentSoft }, tooltip: `Assign to ${a}` }, /* @__PURE__ */ figma.widget.h(Avatar, { name: a, photo: photoOf(a), size: 22 })))) : null),
        /* @__PURE__ */ figma.widget.h(PropRow, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { small: true, key: p, label: PRIORITY_GLYPH[p], active: task.priority === p, color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], onClick: () => patch(task.id, { priority: task.priority === p ? null : p }) }))),
        /* @__PURE__ */ figma.widget.h(PropRow, { label: "Labels", top: true }, knownLabels.map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: labels.includes(l), onClick: () => toggleLabel(task.id, l) })), /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: null,
            placeholder: "+ label",
            onTextEditEnd: (e) => {
              const v = e.characters.trim();
              if (v && !labels.includes(v)) toggleLabel(task.id, v);
            },
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 600,
            fill: C.text,
            placeholderProps: { fill: C.faint },
            width: 64,
            inputBehavior: "truncate",
            inputFrameProps: { padding: { vertical: 2, horizontal: 7 }, cornerRadius: 4, stroke: C.border, strokeDashPattern: [3, 2] }
          }
        )),
        /* @__PURE__ */ figma.widget.h(Divider, null),
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: C.muted }, "Subtasks"), subs.length ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: subsDone === subs.length ? C.success : C.text }, `${subsDone}/${subs.length}`) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), subs.length ? /* @__PURE__ */ figma.widget.h(Progress, { done: subsDone, total: subs.length, width: 90 }) : null), subs.map((s) => /* @__PURE__ */ figma.widget.h(AutoLayout, { key: s.id, direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center", padding: { vertical: 2 }, hoverStyle: { fill: C.canvas }, cornerRadius: 4 }, /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            width: 14,
            height: 14,
            cornerRadius: 4,
            fill: s.done ? C.success : void 0,
            stroke: s.done ? void 0 : C.borderStrong,
            strokeWidth: 1.5,
            strokeAlign: "inside",
            horizontalAlignItems: "center",
            verticalAlignItems: "center",
            onClick: () => patchSubtask(task.id, s.id, { done: !s.done }),
            hoverStyle: { fill: s.done ? C.success : C.successSoft, stroke: C.success },
            tooltip: s.done ? "Mark not done" : "Mark done"
          },
          s.done ? /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: 9, fontWeight: 700, fill: "#FFFFFF", lineHeight: 14 }, "\u2713") : null
        ), /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: s.title,
            placeholder: "Subtask",
            onTextEditEnd: (e) => {
              const v = e.characters.trim();
              if (!v) patchSubtask(task.id, s.id, null);
              else if (v !== s.title) patchSubtask(task.id, s.id, { title: v });
            },
            fontFamily: FONT,
            fontSize: 11,
            fill: s.done ? C.muted : C.text,
            textDecoration: s.done ? "strikethrough" : "none",
            width: "fill-parent",
            inputBehavior: "truncate",
            inputFrameProps: { padding: 0 }
          }
        ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Remove subtask", onClick: () => patchSubtask(task.id, s.id, null) }))), /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: null,
            placeholder: "+ Add subtask",
            onTextEditEnd: (e) => addSubtask(task.id, e.characters),
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 500,
            fill: C.text,
            placeholderProps: { fill: C.muted, fontWeight: 600 },
            width: "fill-parent",
            inputBehavior: "wrap",
            inputFrameProps: { padding: { vertical: 4, horizontal: 6 }, cornerRadius: 6, hoverStyle: { fill: C.surface } }
          }
        )),
        /* @__PURE__ */ figma.widget.h(Divider, null),
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", verticalAlignItems: "center", spacing: 4 }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, `Created ${fromTimestamp(task.createdAt)}${task.completedAt ? ` \xB7 Done ${fromTimestamp(task.completedAt)}` : ""}`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "archive", tooltip: "Archive (keeps the task, hides it from views)", onClick: () => archive(task.id, true) }), confirming ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "danger", icon: "trash", label: "Confirm delete", onClick: () => remove(task.id) }) : /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "trash", tooltip: "Delete permanently", onClick: () => setConfirmDeleteId(task.id) }))
      );
    }
    function Column({ status }) {
      const isCollapsed = !!collapsed[status];
      const items = live.filter((t) => t.status === status);
      const visible = items.filter(matches).sort(compare);
      const color = STATUS_COLOR[status];
      const hiddenByFilter = items.length - visible.length;
      if (isCollapsed) {
        return /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            key: status,
            direction: "vertical",
            width: COLLAPSED_W,
            spacing: 8,
            padding: { vertical: 10, horizontal: 4 },
            fill: STATUS_TINT[status],
            cornerRadius: 12,
            horizontalAlignItems: "center",
            onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: false })),
            hoverStyle: { fill: STATUS_SOFT[status] },
            tooltip: `Expand ${STATUS_LABEL[status]} (${items.length})`
          },
          /* @__PURE__ */ figma.widget.h(Rectangle, { width: 20, height: 3, cornerRadius: 2, fill: color }),
          /* @__PURE__ */ figma.widget.h(StatusGlyph, { status, size: 14 }),
          /* @__PURE__ */ figma.widget.h(Pill, { text: String(items.length), color, fill: C.bg, size: 10 }),
          /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: -1, horizontalAlignItems: "center", padding: { top: 2 } }, STATUS_SHORT[status].split("").map((ch, i) => /* @__PURE__ */ figma.widget.h(Label, { key: i, size: 9, weight: 700, color }, ch)))
        );
      }
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: status, direction: "vertical", width: COL_W, spacing: 8, padding: { top: 0, bottom: 10, left: 10, right: 10 }, fill: STATUS_TINT[status], cornerRadius: 12, overflow: "hidden" }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: 4, fill: color }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status, size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700, color: C.text }, STATUS_LABEL[status]), /* @__PURE__ */ figma.widget.h(Pill, { text: String(visible.length), color, fill: C.bg, size: 10 }), hiddenByFilter > 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, `+${hiddenByFilter} filtered`) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "chevronDown", tooltip: "Collapse column", onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: true })) })), status === "done" ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4 }, visible.slice(0, 4).map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t, compact: true })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Completed tasks land here.") : null, /* @__PURE__ */ figma.widget.h(Btn, { label: visible.length > 4 ? `View all ${visible.length} completed` : "Open Done view", icon: "chevronRight", tone: "ghost", small: true, onClick: () => setView("done") })) : /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 6 }, visible.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: "fill-parent" })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { vertical: 4, horizontal: 4 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, items.length > 0 ? "No matches for current filters." : status === "todo" && live.length === 0 ? "Type below to add your first task." : "Nothing here.")) : null, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "+ New task",
          onTextEditEnd: (e) => createTask(e.characters, { status }),
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.muted, fontWeight: 600 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: 6, horizontal: 8 }, cornerRadius: 8, hoverStyle: { fill: C.bg } }
        }
      )));
    }
    function DoneRow({ task, compact }) {
      const open = openId === task.id;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: task.id,
          direction: "horizontal",
          width: "fill-parent",
          spacing: 8,
          padding: { vertical: 5, horizontal: 8 },
          fill: open ? C.accentSoft : C.bg,
          cornerRadius: 8,
          stroke: open ? C.accent : C.border,
          verticalAlignItems: "center",
          hoverStyle: open ? void 0 : { stroke: C.borderStrong }
        },
        task.archived ? /* @__PURE__ */ figma.widget.h(Icon, { name: "archive", color: C.faint, size: 13 }) : /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: "done", size: 14 }),
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 1, onClick: () => setOpenId(open ? null : task.id), tooltip: "Open details" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 500, color: C.muted, strike: !task.archived, width: "fill-parent", truncate: true }, task.title), compact ? null : /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, [
          task.assignee ? task.assignee : "Unassigned",
          task.due ? `due ${weekdayDate(task.due)}` : null,
          task.completedAt ? `completed ${fromTimestamp(task.completedAt)}` : null,
          task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
          labelsOf(task).length ? labelsOf(task).join(", ") : null
        ].filter(Boolean).join(" \xB7 "))),
        compact ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, task.completedAt ? fromTimestamp(task.completedAt) : "") : /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee), size: 16 }),
        /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "undo", tooltip: "Reopen in To Do", onClick: () => reopen(task.id) }),
        compact ? null : task.archived ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "archive", tooltip: "Restore from archive", color: C.accent, onClick: () => archive(task.id, false) }) : /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "archive", tooltip: "Archive", onClick: () => archive(task.id, true) }),
        !compact && task.archived ? confirmDeleteId === task.id ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "danger", icon: "trash", label: "Confirm", onClick: () => remove(task.id) }) : /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "trash", tooltip: "Delete permanently", onClick: () => setConfirmDeleteId(task.id) }) : null
      );
    }
    function BoardView() {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: COL_GAP, verticalAlignItems: "start", width: "hug-contents" }, STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Column, { key: s, status: s })));
    }
    function WeekView() {
      const pool = active.filter(matches).sort(compare);
      const groups = [];
      const overdue = pool.filter((t) => t.due && daysFromToday(t.due) < 0);
      if (overdue.length) groups.push({ key: "overdue", title: "Overdue", items: overdue, color: C.danger, tint: "#FFF1F1" });
      for (let i = 0; i < 7; i++) {
        const iso = addDaysISO(today, i);
        const items = pool.filter((t) => t.due === iso);
        groups.push({
          key: iso,
          title: i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekdayDate(iso).split(",")[0],
          sub: weekdayDate(iso),
          items,
          color: i === 0 ? C.accent : C.muted,
          tint: i === 0 ? C.accentSoft : C.surface
        });
      }
      const later = pool.filter((t) => t.due && daysFromToday(t.due) > 6);
      if (later.length) groups.push({ key: "later", title: "Later", items: later, color: C.muted, tint: C.surface });
      const undated = pool.filter((t) => !t.due);
      groups.push({ key: "none", title: "No due date", sub: "Click \u201C+ date\u201D on a card to schedule it", items: undated, color: C.muted, tint: C.canvas });
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, width: BOARD_W }, groups.map((g) => /* @__PURE__ */ figma.widget.h(AutoLayout, { key: g.key, direction: "horizontal", width: "fill-parent", spacing: 10, padding: 10, fill: g.tint, cornerRadius: 12, verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: 118, spacing: 2 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700, color: g.color }, g.title), /* @__PURE__ */ figma.widget.h(Pill, { text: String(g.items.length), color: g.color, fill: C.bg, size: 10 })), g.sub ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent" }, g.sub) : null), g.items.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 8, wrap: true, verticalAlignItems: "start" }, g.items.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: CARD_W, showStatus: true }))) : /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { vertical: 2 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Nothing scheduled.")))));
    }
    function DoneView() {
      const dq = doneSearch.trim().toLowerCase();
      const pool = (showArchived ? all.filter((t) => t.archived || t.status === "done") : done).filter(matches).filter((t) => !dq || `${t.title} ${t.description} ${t.assignee} ${labelsOf(t).join(" ")}`.toLowerCase().includes(dq)).sort((a, b) => {
        var _a2, _b;
        return ((_a2 = b.completedAt) != null ? _a2 : b.updatedAt) - ((_b = a.completedAt) != null ? _b : a.updatedAt);
      });
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, width: BOARD_W }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 8, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center", padding: { vertical: 5, horizontal: 9 }, fill: C.surface, cornerRadius: 8, width: 260 }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: doneSearch || null,
          placeholder: "Search completed tasks\u2026",
          onTextEditEnd: (e) => setDoneSearch(e.characters),
          fontFamily: FONT,
          fontSize: 11,
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: 0 }
        }
      ), doneSearch ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Clear search", onClick: () => setDoneSearch("") }) : null), /* @__PURE__ */ figma.widget.h(Chip, { label: `Show archived (${archived.length})`, active: showArchived, onClick: () => setShowArchived(!showArchived) }), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Archive done > 14 days", icon: "archive", onClick: archiveOld, tooltip: "Move completed tasks older than 14 days to the archive" })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 6, padding: { top: 0, bottom: 10, left: 10, right: 10 }, fill: STATUS_TINT.done, cornerRadius: 12, overflow: "hidden" }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: 4, fill: STATUS_COLOR.done }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: "done", size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700 }, showArchived ? "Completed & archived" : "Completed"), /* @__PURE__ */ figma.widget.h(Pill, { text: String(pool.length), color: C.success, fill: C.bg, size: 10 })), pool.length ? pool.map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t })) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, dq || anyFilter ? "No completed tasks match." : "No completed tasks yet \u2014 click a card\u2019s circle to mark it done.")));
    }
    function QuickAddPanel() {
      const customDue = !!draft.due && draft.due !== today && draft.due !== tomorrow && draft.due !== nextMon;
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 8, padding: 10, fill: C.accentSoft, cornerRadius: 12 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "New task title \u2014 press Enter to add, then type the next one",
          onTextEditEnd: (e) => createTask(e.characters, { status: draft.status, priority: draft.priority, due: draft.due, assignee: draft.assignee, labels: draft.label ? [draft.label] : [] }),
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.faint, fontWeight: 400 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: 7, horizontal: 10 }, fill: C.bg, stroke: C.accent, cornerRadius: 8 }
        }
      ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", tooltip: "Close quick add", onClick: () => setQuickAddOpen(false) })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 14, wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, ACTIVE_STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, small: true, label: STATUS_LABEL[s], lead: /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 10, muted: draft.status !== s }), active: draft.status === s, color: STATUS_COLOR[s], soft: STATUS_SOFT[s], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { status: s })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: draft.due === today, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === today ? null : today })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Tomorrow", active: draft.due === tomorrow, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === tomorrow ? null : tomorrow })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Next Mon", active: draft.due === nextMon, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === nextMon ? null : nextMon })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: customDue ? weekdayDate(draft.due) : "Pick\u2026", active: customDue, onClick: () => pickDate("New task", draft.due, (iso) => setDraft(__spreadProps(__spreadValues({}, draft), { due: iso }))) })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, small: true, label: PRIORITY_GLYPH[p], active: draft.priority === p, color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { priority: draft.priority === p ? null : p })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: draft.assignee, photo: photoOf(draft.assignee), size: 18 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: draft.assignee || null,
          placeholder: "Assignee",
          onTextEditEnd: (e) => setDraft(__spreadProps(__spreadValues({}, draft), { assignee: e.characters.trim() })),
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: 600,
          fill: C.text,
          placeholderProps: { fill: C.faint, italic: true },
          width: 88,
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: 3, horizontal: 8 }, fill: C.bg, stroke: C.border, cornerRadius: 999 }
        }
      ), /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          small: true,
          label: "Me",
          tooltip: "Assign to me",
          onClick: () => {
            const name = myName();
            if (name) setDraft(__spreadProps(__spreadValues({}, draft), { assignee: draft.assignee === name ? "" : name }));
          }
        }
      )), knownLabels.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, knownLabels.slice(0, 6).map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: draft.label === l, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { label: draft.label === l ? null : l })) }))) : null));
    }
    function FilterPanel() {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 8, padding: 10, fill: C.bg, cornerRadius: 12, stroke: C.border }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 14, wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Quick" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Overdue (${overdueCount})`, color: C.danger, soft: C.dangerSoft, active: filters.due === "overdue", onClick: () => toggleFilter("due", "overdue") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Unassigned (${unassignedCount})`, active: filters.assignee === "__none__", onClick: () => toggleFilter("assignee", "__none__"), dashed: true }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Stale ${staleDays}d+ (${staleCount})`, color: C.warn, soft: C.warnSoft, active: filters.stale, onClick: () => setFilter("stale", !filters.stale), tooltip: `In To Do for ${staleDays}+ days` })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Due" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: filters.due === "today", onClick: () => toggleFilter("due", "today") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "This week", active: filters.due === "week", onClick: () => toggleFilter("due", "week") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "No date", active: filters.due === "none", onClick: () => toggleFilter("due", "none") })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, small: true, label: PRIORITY_GLYPH[p], color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], active: filters.priority === p, onClick: () => toggleFilter("priority", p) }))), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Status" }, STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, small: true, label: STATUS_LABEL[s], lead: /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 10, muted: filters.status !== s }), color: STATUS_COLOR[s], soft: STATUS_SOFT[s], active: filters.status === s, onClick: () => toggleFilter("status", s) })))), knownLabels.length || knownAssignees.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 14, wrap: true, verticalAlignItems: "center" }, knownLabels.length ? /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Label" }, knownLabels.map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: filters.label === l, onClick: () => toggleFilter("label", l) }))) : null, knownAssignees.length ? /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "People" }, knownAssignees.map((a) => /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: a,
          direction: "horizontal",
          spacing: 4,
          padding: { vertical: 1, horizontal: 1 },
          cornerRadius: 999,
          fill: filters.assignee === a ? C.accentSoft : void 0,
          stroke: filters.assignee === a ? C.accent : void 0,
          verticalAlignItems: "center",
          onClick: () => toggleFilter("assignee", a),
          hoverStyle: { fill: C.accentSoft },
          tooltip: a
        },
        /* @__PURE__ */ figma.widget.h(Avatar, { name: a, photo: photoOf(a), size: 20 }),
        filters.assignee === a ? /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { right: 6 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: C.accent }, shortName(a))) : null
      ))) : null) : null, anyFilter ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.muted }, `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}${search ? " + search" : ""} active`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "x", label: "Clear all", onClick: clearFilters })) : null);
    }
    function FilterGroup({ label, children }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { right: 2 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 700, color: C.faint }, label.toUpperCase())), children);
    }
    function ViewTab({ id, label, iconName, count }) {
      const on = view === id;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 5,
          padding: { vertical: 5, horizontal: 12 },
          cornerRadius: 7,
          fill: on ? C.bg : void 0,
          verticalAlignItems: "center",
          onClick: () => setView(id),
          hoverStyle: { fill: on ? C.bg : C.surfaceAlt },
          effect: on ? { type: "drop-shadow", color: { r: 0, g: 0, b: 0, a: 0.08 }, offset: { x: 0, y: 1 }, blur: 2 } : void 0
        },
        /* @__PURE__ */ figma.widget.h(Icon, { name: iconName, color: on ? C.accent : C.muted, size: 11 }),
        /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: on ? 700 : 500, color: on ? C.text : C.muted }, label),
        count !== void 0 && count > 0 ? /* @__PURE__ */ figma.widget.h(Pill, { text: String(count), color: on ? C.success : C.muted, fill: on ? C.successSoft : C.surfaceAlt }) : null
      );
    }
    const mainView = view === "board" ? /* @__PURE__ */ figma.widget.h(BoardView, null) : view === "week" ? /* @__PURE__ */ figma.widget.h(WeekView, null) : /* @__PURE__ */ figma.widget.h(DoneView, null);
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "vertical",
        spacing: 10,
        padding: 14,
        fill: C.bg,
        cornerRadius: 16,
        stroke: C.border,
        strokeWidth: 1,
        width: "hug-contents",
        effect: { type: "drop-shadow", color: { r: 0.07, g: 0.09, b: 0.15, a: 0.08 }, offset: { x: 0, y: 4 }, blur: 16 }
      },
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: 12, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: boardTitle,
          placeholder: "Board title",
          onTextEditEnd: (e) => setBoardTitle(e.characters.trim() || "Team tasks"),
          fontFamily: FONT,
          fontSize: 16,
          fontWeight: 700,
          fill: C.text,
          width: 220,
          inputBehavior: "truncate",
          inputFrameProps: { padding: 0 }
        }
      ), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Pill, { text: `${active.length} active`, color: C.muted, fill: C.surface, size: 10 }), overdueCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${overdueCount} overdue`, color: C.danger, fill: C.dangerSoft, size: 10, onClick: () => setFilter("due", filters.due === "overdue" ? null : "overdue"), tooltip: "Filter overdue" }) : null, blockedCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${blockedCount} blocked`, color: STATUS_COLOR.blocked, fill: STATUS_SOFT.blocked, size: 10 }) : null, unassignedCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${unassignedCount} unassigned`, color: C.muted, fill: C.surface, size: 10, onClick: () => setFilter("assignee", filters.assignee === "__none__" ? null : "__none__"), tooltip: "Filter unassigned" }) : null), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(Btn, { label: "Add task", icon: "plus", tone: quickAddOpen ? "default" : "primary", onClick: () => setQuickAddOpen(!quickAddOpen), tooltip: "Quick add with optional details (or type directly into a column)" })),
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: 10, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 2, padding: 3, fill: C.surface, cornerRadius: 9 }, /* @__PURE__ */ figma.widget.h(ViewTab, { id: "board", label: "Board", iconName: "board" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "week", label: "Week", iconName: "week" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "done", label: "Done", iconName: "check", count: done.length })), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center", padding: { vertical: 6, horizontal: 10 }, fill: C.surface, stroke: search ? C.accent : void 0, cornerRadius: 8, width: 220 }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: search ? C.accent : C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: search || null,
          placeholder: "Search tasks, labels, people\u2026",
          onTextEditEnd: (e) => setSearch(e.characters),
          fontFamily: FONT,
          fontSize: 11,
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: 0 }
        }
      ), search ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Clear search", onClick: () => setSearch("") }) : null), /* @__PURE__ */ figma.widget.h(
        Btn,
        {
          label: activeFilterCount ? `Filters \xB7 ${activeFilterCount}` : "Filters",
          icon: "filter",
          tone: filtersOpen || activeFilterCount ? "primary" : "default",
          onClick: () => setFiltersOpen(!filtersOpen),
          tooltip: "Filter by label, person, priority, due date, status"
        }
      )),
      quickAddOpen ? /* @__PURE__ */ figma.widget.h(QuickAddPanel, null) : null,
      filtersOpen ? /* @__PURE__ */ figma.widget.h(FilterPanel, null) : null,
      live.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: 8, padding: { vertical: 8, horizontal: 10 }, fill: C.surface, cornerRadius: 10, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, color: C.muted, width: "fill-parent" }, "Empty board. Type a title into any column, use \u201CAdd task\u201D, or load a few sample tasks to see how it works."), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Load sample tasks", onClick: addSamples })) : null,
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 12, verticalAlignItems: "start", width: "hug-contents" }, mainView, openTask ? /* @__PURE__ */ figma.widget.h(Inspector, { task: openTask }) : null)
    );
  }
  widget.register(Widget);
})();
