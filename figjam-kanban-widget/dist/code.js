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
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 19h16"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3"/>',
    sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'
  };
  function icon(name, color, size = 12, strokeWidth = 1.8) {
    return wrap(PATHS[name], color, size, strokeWidth);
  }

  // src/code.tsx
  var { widget } = figma;
  var { AutoLayout, Text, Input, SVG, Image, Ellipse, Rectangle, useSyncedState, useSyncedMap, usePropertyMenu, useWidgetNodeId, useEffect } = widget;
  var FONT = "Inter";
  var K = 1.35;
  var px = (n) => Math.round(n * K);
  var SCALES = { compact: 1, comfortable: 1.35, large: 1.7 };
  var uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var toast = (msg) => figma.notify(msg, { timeout: 1400 });
  var shortName = (s, n = 14) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  var subtasksOf = (t) => {
    var _a;
    return (_a = t.subtasks) != null ? _a : [];
  };
  var hexToRgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });
  var labelsOf = (t) => {
    var _a;
    return (_a = t.labels) != null ? _a : [];
  };
  function Icon({ name, color, size = 12 }) {
    const sz = px(size);
    return /* @__PURE__ */ figma.widget.h(SVG, { src: icon(name, color, sz), width: sz, height: sz });
  }
  function StatusGlyph({ status, size = 12, color, muted }) {
    const c = color != null ? color : muted ? C.faint : STATUS_COLOR[status];
    const sz = px(size);
    const r = sz / 2;
    if (status === "done") {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: sz, height: sz, cornerRadius: r, fill: c, horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(sz * 0.66), fontWeight: 700, fill: "#FFFFFF", lineHeight: sz }, "\u2713"));
    }
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: sz, height: sz, cornerRadius: r, stroke: c, strokeWidth: 1.5, strokeAlign: "inside", horizontalAlignItems: "center", verticalAlignItems: "center" }, status === "inprogress" ? /* @__PURE__ */ figma.widget.h(Ellipse, { width: sz - px(5), height: sz - px(5), fill: c, arcData: { startingAngle: -Math.PI / 2, endingAngle: Math.PI / 2, innerRadius: 0 } }) : status === "blocked" ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: Math.round(size * 0.45), height: px(1.5), fill: c }) : null);
  }
  function Avatar({ name, photo, size = 18 }) {
    const sz = px(size);
    if (!name) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: sz, height: sz, cornerRadius: sz / 2, stroke: C.borderStrong, strokeDashPattern: [2, 2], horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(sz * 0.5), fontWeight: 600, fill: C.faint, lineHeight: sz }, "?"));
    }
    if (photo) {
      return /* @__PURE__ */ figma.widget.h(Image, { src: photo, width: sz, height: sz, cornerRadius: sz / 2 });
    }
    const [bg, fg] = avatarColors(name);
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: sz, height: sz, cornerRadius: sz / 2, fill: bg, horizontalAlignItems: "center", verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: Math.round(sz * 0.44), fontWeight: 700, fill: fg, lineHeight: sz, letterSpacing: 0.2 }, initials(name)));
  }
  function Label(props) {
    var _a, _b, _c, _d, _e;
    const size = px((_a = props.size) != null ? _a : 11);
    return /* @__PURE__ */ figma.widget.h(
      Text,
      {
        fontFamily: FONT,
        fontSize: size,
        fontWeight: (_b = props.weight) != null ? _b : 400,
        fill: (_c = props.color) != null ? _c : C.text,
        width: typeof props.width === "number" ? px(props.width) : (_d = props.width) != null ? _d : "hug-contents",
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
    const pad2 = props.small ? { vertical: px(3), horizontal: px(7) } : { vertical: px(6), horizontal: px(10) };
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "horizontal",
        spacing: px(5),
        padding: pad2,
        cornerRadius: px(8),
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
    var _a, _b, _c;
    const s = px((_a = props.size) != null ? _a : 20);
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: s, height: s, cornerRadius: px(6), horizontalAlignItems: "center", verticalAlignItems: "center", onClick: props.onClick, hoverStyle: { fill: C.surfaceAlt }, tooltip: props.tooltip }, /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color: (_b = props.color) != null ? _b : C.muted, size: Math.round(((_c = props.size) != null ? _c : 20) * 0.6) }));
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
        spacing: px(4),
        padding: props.small ? { vertical: px(2), horizontal: px(7) } : { vertical: px(3), horizontal: px(8) },
        cornerRadius: px(999),
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
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { vertical: px(1), horizontal: px(6) }, cornerRadius: px(999), fill, verticalAlignItems: "center", onClick, tooltip }, /* @__PURE__ */ figma.widget.h(Label, { size, weight: 700, color }, text));
  }
  function LabelPill({ name, size = 9, onClick, active = true }) {
    const [bg, fg] = labelColors(name);
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        padding: { vertical: px(1), horizontal: px(6) },
        cornerRadius: px(4),
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
    return /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: px(1), fill: C.border });
  }
  function Progress({ done, total, width: w }) {
    const pct = total ? done / total : 0;
    const width = typeof w === "number" ? px(w) : w;
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width, height: px(4), cornerRadius: px(2), fill: C.surfaceAlt }, pct > 0 ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: typeof width === "number" ? Math.max(4, Math.round(width * pct)) : "fill-parent", height: px(4), cornerRadius: px(2), fill: pct >= 1 ? C.success : C.accent }) : null);
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
  var NS = "kanban-lite";
  var STATE_KEYS = [
    "view",
    "collapsed2",
    "openId",
    "confirmDeleteId",
    "filters",
    "filtersOpen",
    "search",
    "sort",
    "quickAddOpen",
    "draft",
    "celebrating",
    "showArchived",
    "doneSearch",
    "staleDays",
    "boardTitle",
    "uiSize",
    "scope",
    "storeVersion"
  ];
  function storeRead(key) {
    const raw = figma.root.getSharedPluginData(NS, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  var storeWrite = (key, value) => figma.root.setSharedPluginData(NS, key, value === null ? "" : JSON.stringify(value));
  var csvCell = (v) => {
    const str = v === null || v === void 0 ? "" : String(v);
    return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  var isoDateTime = (ts) => ts ? new Date(ts).toISOString() : "";
  function tasksToCsv(list) {
    const header = ["id", "title", "description", "status", "assignee", "due", "priority", "labels", "subtasks_done", "subtasks_total", "subtasks", "created_at", "updated_at", "completed_at", "archived"];
    const rows = list.map((t) => {
      var _a;
      const subs = subtasksOf(t);
      return [
        t.id,
        t.title,
        t.description,
        STATUS_LABEL[t.status],
        t.assignee,
        (_a = t.due) != null ? _a : "",
        t.priority ? PRIORITY_LABEL[t.priority] : "",
        labelsOf(t).join("; "),
        subs.filter((x) => x.done).length,
        subs.length,
        subs.map((x) => `[${x.done ? "x" : " "}] ${x.title}`).join("; "),
        isoDateTime(t.createdAt),
        isoDateTime(t.updatedAt),
        isoDateTime(t.completedAt),
        t.archived ? "yes" : "no"
      ].map(csvCell).join(",");
    });
    return [header.join(","), ...rows].join("\r\n");
  }
  function exportCsv(list, boardTitle) {
    const csv = tasksToCsv(list);
    const safe = boardTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tasks";
    const filename = `${safe}-${todayISO()}.csv`;
    return new Promise((resolve) => {
      figma.showUI(__html__, { width: 420, height: 300, title: "Export tasks as CSV" });
      figma.ui.postMessage({ type: "export", csv, filename, count: list.length });
      figma.ui.onmessage = (msg) => {
        if (msg && msg.type === "saved") toast(`Exported ${list.length} tasks`);
        figma.closePlugin();
        resolve();
      };
    });
  }
  function Widget() {
    var _a, _b;
    const tasks = useSyncedMap("tasks");
    const people = useSyncedMap("people");
    const [view, setView] = useSyncedState("view", "board");
    const [collapsed, setCollapsed] = useSyncedState("collapsed2", {});
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
    const [uiSize, setUiSize] = useSyncedState("uiSize", "comfortable");
    const [scope, setScope] = useSyncedState("scope", { kind: "team" });
    const [storeVersion] = useSyncedState("storeVersion", 0);
    const widgetId = useWidgetNodeId();
    K = (_a = SCALES[uiSize]) != null ? _a : 1.35;
    const owner = scope.kind === "personal" ? scope.name : null;
    const COL_W = px(300);
    const COL_GAP = px(10);
    const BOARD_W = COL_W * 4 + COL_GAP * 3;
    const COLLAPSED_W = px(40);
    const CARD_W = COL_W - px(20);
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const nextWeek = addDaysISO(today, 7);
    const everything = tasks.values();
    const all = owner ? everything.filter((t) => t.assignee === owner) : everything;
    const live = all.filter((t) => !t.archived);
    const active = live.filter((t) => t.status !== "done");
    const done = live.filter((t) => t.status === "done");
    const archived = all.filter((t) => t.archived);
    const syncPeople = () => {
      var _a2, _b2;
      const seen = [figma.currentUser, ...figma.activeUsers];
      const now = Date.now();
      for (const u of seen) {
        if (!u || !u.name) continue;
        const prev = people.get(u.name);
        if (!prev || prev.photoUrl !== ((_a2 = u.photoUrl) != null ? _a2 : null) || now - prev.seenAt > 36e5) {
          const person = { name: u.name, photoUrl: (_b2 = u.photoUrl) != null ? _b2 : null, seenAt: now };
          people.set(u.name, person);
          storeWrite("person:" + u.name, person);
        }
      }
    };
    const photoOf = (name) => {
      var _a2, _b2;
      return name ? (_b2 = (_a2 = people.get(name)) == null ? void 0 : _a2.photoUrl) != null ? _b2 : null : null;
    };
    const makeMine = () => {
      var _a2;
      const u = figma.currentUser;
      if (!u || !u.name) {
        toast("Could not read your Figma name");
        return;
      }
      syncPeople();
      setScope({ kind: "personal", name: u.name, photoUrl: (_a2 = u.photoUrl) != null ? _a2 : null });
      if (boardTitle === "Team tasks") setBoardTitle(`${u.name.split(/[\s|]+/)[0]}\u2019s tasks`);
      if (view === "people") setView("board");
      toast(`This is now ${u.name}'s board \u2014 only tasks assigned to you`);
    };
    const makeTeam = () => {
      setScope({ kind: "team" });
      if (/’s tasks$/.test(boardTitle)) setBoardTitle("Team tasks");
      toast("This is now the team board \u2014 every task in the file");
    };
    const refresh = () => {
      const n = syncWithStore();
      toast(n ? `Pulled ${n} update${n === 1 ? "" : "s"} from other boards` : "Up to date with the other boards");
    };
    const notifyOtherBoards = () => {
      try {
        if (!figma.widgetId) return;
        const others = figma.currentPage.findWidgetNodesByWidgetId(figma.widgetId).filter((n) => n.id !== widgetId);
        if (!others.length) return;
        const taskMap = {};
        const personMap = {};
        for (const k of figma.root.getSharedPluginDataKeys(NS)) {
          if (k.startsWith("task:")) {
            const v = storeRead(k);
            if (v && v.id) taskMap[v.id] = v;
          } else if (k.startsWith("person:")) {
            const v = storeRead(k);
            if (v && v.name) personMap[v.name] = v;
          }
        }
        const version = Date.now();
        for (const n of others) {
          const prev = n.widgetSyncedState || {};
          const next = {};
          for (const k of STATE_KEYS) if (k in prev) next[k] = prev[k];
          next.storeVersion = version;
          n.setWidgetSyncedState(next, { tasks: taskMap, people: personMap });
        }
      } catch (_) {
      }
    };
    const findTeammates = () => {
      const before = people.size;
      syncPeople();
      const here = figma.activeUsers.filter((u) => u.name).length;
      const added = people.size - before;
      toast(`${here} ${here === 1 ? "person is" : "people are"} in this file right now${added ? ` \xB7 ${added} new` : ""}`);
      notifyOtherBoards();
    };
    const writeTask = (t) => {
      tasks.set(t.id, t);
      storeWrite("task:" + t.id, t);
    };
    const deleteTask = (id) => {
      tasks.delete(id);
      storeWrite("task:" + id, null);
      storeWrite("deleted:" + id, { at: Date.now() });
    };
    const syncWithStore = () => {
      let changes = 0;
      let keys = [];
      try {
        keys = figma.root.getSharedPluginDataKeys(NS);
      } catch (_) {
        return 0;
      }
      const storeTasks = /* @__PURE__ */ new Map();
      const tomb = /* @__PURE__ */ new Set();
      const storePeople = /* @__PURE__ */ new Map();
      for (const k of keys) {
        if (k.startsWith("task:")) {
          const v = storeRead(k);
          if (v && v.id) storeTasks.set(v.id, v);
        } else if (k.startsWith("deleted:")) tomb.add(k.slice(8));
        else if (k.startsWith("person:")) {
          const v = storeRead(k);
          if (v && v.name) storePeople.set(v.name, v);
        }
      }
      storeTasks.forEach((st, id) => {
        const c = tasks.get(id);
        if (!c || c.updatedAt < st.updatedAt) {
          tasks.set(id, st);
          changes++;
        }
      });
      for (const c of tasks.values()) {
        const st = storeTasks.get(c.id);
        if (!st) {
          if (tomb.has(c.id)) {
            tasks.delete(c.id);
            changes++;
          } else storeWrite("task:" + c.id, c);
        } else if (st.updatedAt < c.updatedAt) storeWrite("task:" + c.id, c);
      }
      storePeople.forEach((sp, name) => {
        const c = people.get(name);
        if (!c || c.seenAt < sp.seenAt) {
          people.set(name, sp);
          changes++;
        }
      });
      for (const c of people.values()) {
        const sp = storePeople.get(c.name);
        if (!sp || sp.seenAt < c.seenAt) storeWrite("person:" + c.name, c);
      }
      return changes;
    };
    useEffect(() => {
      syncWithStore();
    });
    const patch = (id, p) => {
      const t = tasks.get(id);
      if (!t) return;
      writeTask(__spreadProps(__spreadValues(__spreadValues({}, t), p), { updatedAt: Date.now() }));
      if (owner && "assignee" in p && t.assignee === owner && p.assignee !== owner) {
        toast(p.assignee ? `Moved to ${p.assignee}'s board` : "Unassigned \u2014 now only on the team board");
      }
      syncPeople();
      notifyOtherBoards();
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
      if (owner && !t.assignee) t.assignee = owner;
      if (t.status === "done") t.completedAt = now;
      writeTask(t);
      syncPeople();
      toast(`Added \u201C${shortName(clean, 34)}\u201D`);
      notifyOtherBoards();
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
      deleteTask(id);
      setConfirmDeleteId(null);
      if (openId === id) setOpenId(null);
      toast("Task deleted");
      notifyOtherBoards();
    };
    const setDiscuss = (id, flag) => {
      patch(id, { discuss: flag });
      toast(flag ? "Added to the team sync agenda" : "Removed from the agenda");
    };
    const createAgendaOnCanvas = async () => {
      const flagged = live.filter((t) => t.discuss);
      if (!flagged.length) {
        toast("Flag tasks with \u201CDiscuss in team sync\u201D first");
        return;
      }
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      const me = await figma.getNodeByIdAsync(widgetId);
      const anchor = me && "x" in me ? me : null;
      const section = figma.createSection();
      section.name = `Team sync \xB7 ${weekdayDate(today)}`;
      section.fills = [{ type: "SOLID", color: hexToRgb("#EEF2FF") }];
      const gap = 24;
      const cols = 3;
      let w = 0;
      let h = 0;
      flagged.forEach((t, i) => {
        const sticky = figma.createSticky();
        const lines = [t.title];
        const meta = [t.assignee ? `@${t.assignee}` : "Unassigned", STATUS_LABEL[t.status], t.due ? `due ${dueLabel(t.due)}` : null].filter(Boolean).join(" \xB7 ");
        lines.push("", meta);
        if (t.discussNote) lines.push("", t.discussNote);
        sticky.text.characters = lines.join("\n");
        sticky.authorVisible = false;
        sticky.fills = [{ type: "SOLID", color: hexToRgb(t.status === "blocked" ? "#FFD8B5" : t.status === "inprogress" ? "#BFDBFE" : t.status === "done" ? "#BBF7D0" : "#FDE68A") }];
        section.appendChild(sticky);
        const col = i % cols;
        const row = Math.floor(i / cols);
        sticky.x = gap + col * (sticky.width + gap);
        sticky.y = 56 + row * (sticky.height + gap);
        w = Math.max(w, sticky.x + sticky.width + gap);
        h = Math.max(h, sticky.y + sticky.height + gap);
      });
      section.resizeWithoutConstraints(w, h);
      if (anchor) {
        section.x = anchor.x + anchor.width + 80;
        section.y = anchor.y;
      }
      figma.currentPage.appendChild(section);
      figma.viewport.scrollAndZoomIntoView([section]);
      toast(`Created an agenda with ${flagged.length} stick${flagged.length === 1 ? "y" : "ies"} next to the board`);
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
      var _a2, _b2, _c, _d;
      if (sort === "created") return b.createdAt - a.createdAt;
      if (sort === "priority") {
        const pr2 = PRIORITY_RANK[(_a2 = a.priority) != null ? _a2 : "none"] - PRIORITY_RANK[(_b2 = b.priority) != null ? _b2 : "none"];
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
          propertyName: "scope",
          tooltip: "Board scope",
          selectedOption: scope.kind === "team" ? "team" : "mine",
          options: [
            { option: "team", label: "Team board (everyone)" },
            { option: "mine", label: "My board (only my tasks)" }
          ]
        },
        {
          itemType: "dropdown",
          propertyName: "view",
          tooltip: "View",
          selectedOption: view,
          options: [
            { option: "board", label: "Board" },
            { option: "people", label: "People" },
            { option: "week", label: "Week" },
            { option: "done", label: "Done" },
            { option: "sync", label: "Team sync" }
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
        {
          itemType: "dropdown",
          propertyName: "size",
          tooltip: "Widget size",
          selectedOption: uiSize,
          options: [
            { option: "compact", label: "Size: compact" },
            { option: "comfortable", label: "Size: comfortable" },
            { option: "large", label: "Size: large" }
          ]
        },
        { itemType: "separator" },
        { itemType: "action", propertyName: "export", tooltip: "Export CSV" },
        { itemType: "action", propertyName: "agenda", tooltip: "Create sync agenda on canvas" },
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
          case "scope":
            if (propertyValue === "mine") makeMine();
            else makeTeam();
            break;
          case "sort":
            setSort(propertyValue);
            break;
          case "stale":
            setStaleDays(parseInt(propertyValue, 10));
            break;
          case "size":
            setUiSize(propertyValue);
            break;
          case "export":
            return exportCsv(all, boardTitle);
          case "agenda":
            return createAgendaOnCanvas();
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
          writeTask(__spreadProps(__spreadValues({}, t), { archived: true, updatedAt: Date.now() }));
          n++;
        }
      }
      toast(n ? `Archived ${n} completed task${n === 1 ? "" : "s"}` : "Nothing older than 14 days to archive");
      if (n) notifyOtherBoards();
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
        var _a2, _b2, _c, _d, _e, _f, _g;
        const now = Date.now() - (samples.length - i) * 1e3;
        const t = {
          id: uid() + i,
          title: s.title,
          description: (_a2 = s.description) != null ? _a2 : "",
          status: (_b2 = s.status) != null ? _b2 : "todo",
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
        writeTask(t);
      });
      syncPeople();
      toast("Added 8 sample tasks");
      notifyOtherBoards();
    };
    const resolveAgainst = (typed, known) => {
      const v = typed.trim();
      if (!v) return "";
      const lower = v.toLowerCase();
      const exact = known.find((k) => k.toLowerCase() === lower);
      if (exact) return exact;
      const prefix = known.filter((k) => k.toLowerCase().startsWith(lower));
      if (prefix.length === 1) return prefix[0];
      const word = known.filter((k) => k.toLowerCase().split(/\s+/).some((w) => w.startsWith(lower)));
      if (word.length === 1) return word[0];
      return v;
    };
    const resolvePerson = (typed) => resolveAgainst(typed, knownAssignees);
    const resolveLabel = (typed) => resolveAgainst(typed, knownLabels);
    function PersonChip({ name, onClick, active: active2 }) {
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: px(5),
          padding: { top: px(2), bottom: px(2), left: px(2), right: px(8) },
          cornerRadius: px(999),
          fill: active2 ? C.accentSoft : C.bg,
          stroke: active2 ? C.accent : C.border,
          verticalAlignItems: "center",
          onClick,
          hoverStyle: { fill: C.accentSoft, stroke: C.accent }
        },
        /* @__PURE__ */ figma.widget.h(Avatar, { name, photo: photoOf(name), size: 16 }),
        /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: active2 ? C.accent : C.text }, shortName(name, 18))
      );
    }
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
          fill: isCelebrating ? C.successSoft : C.bg,
          cornerRadius: px(8),
          stroke: open ? C.accent : isCelebrating ? C.success : C.border,
          strokeWidth: open ? 2 : 1,
          hoverStyle: open ? void 0 : { stroke: C.borderStrong },
          overflow: "hidden",
          effect: open ? { type: "drop-shadow", color: { r: 0.31, g: 0.27, b: 0.9, a: 0.18 }, offset: { x: 0, y: 4 }, blur: 14 } : void 0
        },
        stripe ? /* @__PURE__ */ figma.widget.h(Rectangle, { width: px(3), height: "fill-parent", fill: stripe }) : null,
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(5), padding: { vertical: px(7), horizontal: px(9) } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            width: px(16),
            height: px(16),
            cornerRadius: px(8),
            fill: isDone ? C.success : void 0,
            stroke: isDone ? void 0 : C.borderStrong,
            strokeWidth: 1.5,
            strokeAlign: "inside",
            horizontalAlignItems: "center",
            verticalAlignItems: "center",
            onClick: () => complete(task.id),
            hoverStyle: { fill: isDone ? C.success : C.successSoft, stroke: C.success }
          },
          isDone ? /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: px(10), fontWeight: 700, fill: "#FFFFFF", lineHeight: px(16) }, "\u2713") : null
        ), open ? /* @__PURE__ */ figma.widget.h(
          Input,
          {
            value: task.title,
            placeholder: "Task title",
            onTextEditEnd: (e) => {
              const v = e.characters.trim();
              if (v && v !== task.title) patch(task.id, { title: v });
            },
            fontFamily: FONT,
            fontSize: px(13),
            fontWeight: 700,
            fill: C.text,
            width: "fill-parent",
            inputBehavior: "wrap",
            inputFrameProps: { padding: 0 }
          }
        ) : /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", onClick: () => setOpenId(task.id) }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 600, width: "fill-parent", truncate: 2, strike: isDone, color: isDone ? C.muted : C.text }, task.title || "Untitled")), open ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "chevronUp", size: 18, tooltip: "Collapse", onClick: () => setOpenId(null) }) : null, task.priority ? /* @__PURE__ */ figma.widget.h(Pill, { text: PRIORITY_GLYPH[task.priority], color: PRIORITY_COLOR[task.priority], fill: PRIORITY_SOFT[task.priority], tooltip: `${PRIORITY_LABEL[task.priority]} priority`, onClick: () => setOpenId(open ? null : task.id) }) : null), labels.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), wrap: true, width: "fill-parent" }, labels.slice(0, 3).map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, onClick: () => setFilter("label", filters.label === l ? null : l) })), labels.length > 3 ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, `+${labels.length - 3}`) : null) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center", wrap: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center", onClick: () => setOpenId(task.id), tooltip: task.assignee ? `Assigned to ${task.assignee}` : "Unassigned \u2014 click to assign" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee) }), task.assignee ? null : /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: C.faint, italic: true }, "Unassigned")), task.due ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            padding: { vertical: px(1), horizontal: px(6) },
            cornerRadius: px(999),
            fill: overdue ? C.dangerSoft : task.due === today ? C.accentSoft : C.surface,
            onClick: () => setOpenId(task.id),
            hoverStyle: { fill: overdue ? "#FECACA" : C.surfaceAlt },
            tooltip: overdue ? `Overdue \u2014 was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`
          },
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: overdue || task.due === today ? 700 : 500, color: overdue ? C.danger : task.due === today ? C.accentText : C.muted }, overdue ? `Overdue \xB7 ${dueLabel(task.due)}` : dueLabel(task.due))
        ) : /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { vertical: px(1), horizontal: px(6) }, cornerRadius: px(999), onClick: () => setDue(task.id, today), hoverStyle: { fill: C.surface }, tooltip: "No due date \u2014 click to set Today" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: C.faint }, "+ date")), subs.length ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: px(4),
            padding: { vertical: px(1), horizontal: px(6) },
            cornerRadius: px(999),
            fill: subsDone === subs.length ? C.successSoft : C.surface,
            verticalAlignItems: "center",
            onClick: () => setOpenId(task.id),
            tooltip: `${subsDone} of ${subs.length} subtasks done`
          },
          /* @__PURE__ */ figma.widget.h(Progress, { done: subsDone, total: subs.length, width: px(22) }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: subsDone === subs.length ? C.success : C.muted }, `${subsDone}/${subs.length}`)
        ) : null, stale && !isDone ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${ageInDays(task.createdAt)}d old`, color: C.warn, fill: C.warnSoft, size: 10, tooltip: `In To Do for ${ageInDays(task.createdAt)} days` }) : null, task.discuss ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(3), padding: { vertical: px(1), horizontal: px(6) }, cornerRadius: px(999), fill: C.accentSoft, verticalAlignItems: "center", onClick: () => setView("sync"), tooltip: "On the team sync agenda" }, /* @__PURE__ */ figma.widget.h(Icon, { name: "chat", color: C.accentText, size: 10 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: C.accentText }, "Sync")) : null, showStatus ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), padding: { vertical: px(1), horizontal: px(6) }, cornerRadius: px(999), fill: STATUS_SOFT[task.status], verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: task.status, size: 10 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: STATUS_COLOR[task.status] }, STATUS_LABEL[task.status])) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(1), cornerRadius: px(6), fill: C.surface, padding: px(1) }, STATUSES.map((s) => {
          const current = task.status === s && !isCelebrating;
          return /* @__PURE__ */ figma.widget.h(
            AutoLayout,
            {
              key: s,
              width: px(22),
              height: px(18),
              cornerRadius: px(5),
              fill: current ? C.bg : void 0,
              stroke: current ? C.border : void 0,
              horizontalAlignItems: "center",
              verticalAlignItems: "center",
              onClick: () => setStatus(task.id, s),
              hoverStyle: { fill: current ? C.bg : STATUS_SOFT[s] }
            },
            /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 11, muted: !current })
          );
        }))), isCelebrating ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: C.success }, "\u2713 Done! Moving to Completed\u2026") : null, open ? /* @__PURE__ */ figma.widget.h(Editor, { task }) : null)
      );
    }
    function PropRow({ label, children, stack }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(4) }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 700, color: C.faint }, label.toUpperCase()), stack ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(5) }, children) : /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(4), wrap: true, verticalAlignItems: "center" }, children));
    }
    function Editor({ task }) {
      const confirming = confirmDeleteId === task.id;
      const customDue = !!task.due && task.due !== today && task.due !== tomorrow && task.due !== nextWeek;
      const overdue = isOverdue(task.due) && task.status !== "done";
      const subs = subtasksOf(task);
      const subsDone = subs.filter((s) => s.done).length;
      const labels = labelsOf(task);
      const peopleRow = knownAssignees.filter((a) => a !== task.assignee);
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(10), padding: { top: px(4) } }, /* @__PURE__ */ figma.widget.h(Divider, null), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: task.description || null,
          placeholder: "Add a description\u2026",
          onTextEditEnd: (e) => {
            if (e.characters !== task.description) patch(task.id, { description: e.characters });
          },
          fontFamily: FONT,
          fontSize: px(11),
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "multiline",
          inputFrameProps: { padding: { vertical: px(6), horizontal: px(8) }, fill: C.surface, cornerRadius: px(8) }
        }
      ), /* @__PURE__ */ figma.widget.h(Divider, null), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Status" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(1), cornerRadius: px(8), fill: C.surface, padding: px(2) }, STATUSES.map((s) => {
        const current = task.status === s;
        return /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            key: s,
            direction: "horizontal",
            spacing: px(4),
            padding: { vertical: px(3), horizontal: current ? 8 : 6 },
            cornerRadius: px(6),
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
      }))), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Due", stack: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Icon, { name: "calendar", color: task.due ? overdue ? C.danger : C.accentText : C.faint, size: 12 }), task.due ? /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 700, color: overdue ? C.danger : C.text, width: "fill-parent", truncate: true }, overdue ? `Overdue \xB7 was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`) : /* @__PURE__ */ figma.widget.h(Label, { size: 11, color: C.faint, italic: true, width: "fill-parent" }, "No due date"), task.due ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "x", label: "Clear", onClick: () => setDue(task.id, null) }) : null), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), wrap: true, width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: task.due === today, onClick: () => setDue(task.id, today) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Tomorrow", active: task.due === tomorrow, onClick: () => setDue(task.id, tomorrow) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Next week", active: task.due === nextWeek, onClick: () => setDue(task.id, nextWeek) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: customDue ? weekdayDate(task.due) : "Pick date\u2026", active: customDue, onClick: () => pickDate(task.title, task.due, (iso) => setDue(task.id, iso)) }))), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Owner", stack: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(6), verticalAlignItems: "center", width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee), size: 22 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: task.assignee || null,
          placeholder: "Type a name, press Enter",
          onTextEditEnd: (e) => {
            const v = resolvePerson(e.characters);
            if (v !== task.assignee) patch(task.id, { assignee: v });
          },
          fontFamily: FONT,
          fontSize: px(11),
          fontWeight: 600,
          fill: C.text,
          placeholderProps: { fill: C.faint, fontWeight: 400, italic: true },
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: px(4), horizontal: px(8) }, fill: C.surface, cornerRadius: px(8) }
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
      ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "users", tooltip: "Find teammates who are in this file right now", onClick: findTeammates })), peopleRow.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), wrap: true, width: "fill-parent", verticalAlignItems: "center" }, peopleRow.map((a) => /* @__PURE__ */ figma.widget.h(PersonChip, { key: a, name: a, onClick: () => patch(task.id, { assignee: a }) }))) : /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent" }, "Anyone you type becomes a chip here. Teammates who open this board appear automatically with their photo.")), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { small: true, key: p, label: PRIORITY_GLYPH[p], active: task.priority === p, color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], onClick: () => patch(task.id, { priority: task.priority === p ? null : p }) }))), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Labels" }, knownLabels.map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: labels.includes(l), onClick: () => toggleLabel(task.id, l) })), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "+ label",
          onTextEditEnd: (e) => {
            const v = resolveLabel(e.characters);
            if (v && !labels.includes(v)) toggleLabel(task.id, v);
          },
          fontFamily: FONT,
          fontSize: px(10),
          fontWeight: 600,
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: px(80),
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: px(2), horizontal: px(7) }, cornerRadius: px(4), stroke: C.border, strokeDashPattern: [3, 2] }
        }
      )), /* @__PURE__ */ figma.widget.h(PropRow, { label: "Team sync", stack: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          small: true,
          label: task.discuss ? "On the agenda" : "Discuss in team sync",
          lead: /* @__PURE__ */ figma.widget.h(Icon, { name: "chat", color: task.discuss ? C.accent : C.muted, size: 11 }),
          active: !!task.discuss,
          onClick: () => setDiscuss(task.id, !task.discuss)
        }
      ), task.discuss ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "chat", label: "Open agenda", onClick: () => setView("sync") }) : null), task.discuss ? /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: task.discussNote || null,
          placeholder: "What needs deciding? (shows on the agenda)",
          onTextEditEnd: (e) => {
            var _a2;
            if (e.characters !== ((_a2 = task.discussNote) != null ? _a2 : "")) patch(task.id, { discussNote: e.characters });
          },
          fontFamily: FONT,
          fontSize: px(11),
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "multiline",
          inputFrameProps: { padding: { vertical: px(5), horizontal: px(7) }, fill: C.accentSoft, cornerRadius: px(6) }
        }
      ) : null), /* @__PURE__ */ figma.widget.h(Divider, null), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(4) }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: C.muted }, "Subtasks"), subs.length ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: subsDone === subs.length ? C.success : C.text }, `${subsDone}/${subs.length}`) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: px(1) }), subs.length ? /* @__PURE__ */ figma.widget.h(Progress, { done: subsDone, total: subs.length, width: px(90) }) : null), subs.map((s) => /* @__PURE__ */ figma.widget.h(AutoLayout, { key: s.id, direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center", padding: { vertical: px(2) }, hoverStyle: { fill: C.canvas }, cornerRadius: px(4) }, /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          width: px(14),
          height: px(14),
          cornerRadius: px(4),
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
        s.done ? /* @__PURE__ */ figma.widget.h(Text, { fontFamily: FONT, fontSize: px(9), fontWeight: 700, fill: "#FFFFFF", lineHeight: px(14) }, "\u2713") : null
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
          fontSize: px(11),
          fill: s.done ? C.muted : C.text,
          textDecoration: s.done ? "strikethrough" : "none",
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: px(0) }
        }
      ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Remove subtask", onClick: () => patchSubtask(task.id, s.id, null) }))), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "+ Add subtask",
          onTextEditEnd: (e) => addSubtask(task.id, e.characters),
          fontFamily: FONT,
          fontSize: px(11),
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.muted, fontWeight: 600 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: px(4), horizontal: px(6) }, cornerRadius: px(6), hoverStyle: { fill: C.surface } }
        }
      )), /* @__PURE__ */ figma.widget.h(Divider, null), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", verticalAlignItems: "center", spacing: px(4) }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, `Created ${fromTimestamp(task.createdAt)}${task.completedAt ? ` \xB7 Done ${fromTimestamp(task.completedAt)}` : ""}`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "archive", tooltip: "Archive (keeps the task, hides it from views)", onClick: () => archive(task.id, true) }), confirming ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "danger", icon: "trash", label: "Confirm delete", onClick: () => remove(task.id) }) : /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "trash", tooltip: "Delete permanently", onClick: () => setConfirmDeleteId(task.id) }), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "chevronUp", tooltip: "Collapse", onClick: () => setOpenId(null) })));
    }
    function Column({ status }) {
      const isCollapsed = !!collapsed[status];
      const items = live.filter((t) => t.status === status);
      const visible = items.filter(matches).sort(status === "done" ? (a, b) => {
        var _a2, _b2;
        return ((_a2 = b.completedAt) != null ? _a2 : b.updatedAt) - ((_b2 = a.completedAt) != null ? _b2 : a.updatedAt);
      } : compare);
      const color = STATUS_COLOR[status];
      const hiddenByFilter = items.length - visible.length;
      if (isCollapsed) {
        return /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            key: status,
            direction: "vertical",
            width: COLLAPSED_W,
            spacing: px(8),
            padding: { vertical: px(10), horizontal: px(4) },
            fill: STATUS_TINT[status],
            cornerRadius: px(12),
            horizontalAlignItems: "center",
            onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: false })),
            hoverStyle: { fill: STATUS_SOFT[status] },
            tooltip: `Expand ${STATUS_LABEL[status]} (${items.length})`
          },
          /* @__PURE__ */ figma.widget.h(Rectangle, { width: px(20), height: px(3), cornerRadius: px(2), fill: color }),
          /* @__PURE__ */ figma.widget.h(StatusGlyph, { status, size: 14 }),
          /* @__PURE__ */ figma.widget.h(Pill, { text: String(items.length), color, fill: C.bg, size: 10 }),
          /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: px(-1), horizontalAlignItems: "center", padding: { top: px(2) } }, STATUS_SHORT[status].split("").map((ch, i) => /* @__PURE__ */ figma.widget.h(Label, { key: i, size: 9, weight: 700, color }, ch)))
        );
      }
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: status, direction: "vertical", width: COL_W, spacing: 0, fill: STATUS_TINT[status], cornerRadius: px(12), overflow: "hidden" }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: px(4), fill: color }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(8), padding: { top: px(8), bottom: px(10), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status, size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700, color: C.text }, STATUS_LABEL[status]), /* @__PURE__ */ figma.widget.h(Pill, { text: String(visible.length), color, fill: C.bg, size: 10 }), hiddenByFilter > 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, `+${hiddenByFilter} filtered`) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: px(1) }), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "chevronDown", tooltip: "Collapse column", onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: true })) })), status === "done" ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(4) }, visible.slice(0, 5).map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t, compact: true })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Completed tasks land here.") : null, /* @__PURE__ */ figma.widget.h(Btn, { label: visible.length > 5 ? `${visible.length - 5} more in Done view` : "Open Done view", icon: "chevronRight", tone: "ghost", small: true, onClick: () => setView("done") })) : /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(6) }, visible.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: "fill-parent" })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { vertical: px(4), horizontal: px(4) } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, items.length > 0 ? "No matches for current filters." : status === "todo" && live.length === 0 ? "Type below to add your first task." : "Nothing here.")) : null, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "+ New task",
          onTextEditEnd: (e) => createTask(e.characters, { status }),
          fontFamily: FONT,
          fontSize: px(11),
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.muted, fontWeight: 600 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: px(6), horizontal: px(8) }, cornerRadius: px(8), hoverStyle: { fill: C.bg } }
        }
      ))));
    }
    function DoneRow({ task, compact }) {
      const open = openId === task.id;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: task.id,
          direction: "vertical",
          width: "fill-parent",
          spacing: 0,
          fill: C.bg,
          cornerRadius: px(8),
          stroke: open ? C.accent : C.border,
          strokeWidth: open ? 2 : 1,
          hoverStyle: open ? void 0 : { stroke: C.borderStrong }
        },
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(8), padding: { vertical: px(5), horizontal: px(8) }, verticalAlignItems: "center" }, task.archived ? /* @__PURE__ */ figma.widget.h(Icon, { name: "archive", color: C.faint, size: 13 }) : /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: "done", size: 14 }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(1), onClick: () => setOpenId(open ? null : task.id), tooltip: "Open details" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 500, color: C.muted, strike: !task.archived, width: "fill-parent", truncate: true }, task.title), compact ? null : /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, [
          task.assignee ? task.assignee : "Unassigned",
          task.due ? `due ${weekdayDate(task.due)}` : null,
          task.completedAt ? `completed ${fromTimestamp(task.completedAt)}` : null,
          task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
          labelsOf(task).length ? labelsOf(task).join(", ") : null
        ].filter(Boolean).join(" \xB7 "))), compact ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, task.completedAt ? fromTimestamp(task.completedAt) : "") : /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee), size: 16 }), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "undo", tooltip: "Reopen in To Do", onClick: () => reopen(task.id) }), compact ? null : task.archived ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "archive", tooltip: "Restore from archive", color: C.accent, onClick: () => archive(task.id, false) }) : /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "archive", tooltip: "Archive", onClick: () => archive(task.id, true) }), !compact && task.archived ? confirmDeleteId === task.id ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "danger", icon: "trash", label: "Confirm", onClick: () => remove(task.id) }) : /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "trash", tooltip: "Delete permanently", onClick: () => setConfirmDeleteId(task.id) }) : null),
        open ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { top: 0, bottom: px(8), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(Editor, { task })) : null
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
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: px(8), width: BOARD_W }, groups.map((g) => /* @__PURE__ */ figma.widget.h(AutoLayout, { key: g.key, direction: "horizontal", width: "fill-parent", spacing: px(10), padding: px(10), fill: g.tint, cornerRadius: px(12), verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: px(118), spacing: px(2) }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700, color: g.color }, g.title), /* @__PURE__ */ figma.widget.h(Pill, { text: String(g.items.length), color: g.color, fill: C.bg, size: 10 })), g.sub ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent" }, g.sub) : null), g.items.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(8), wrap: true, verticalAlignItems: "start" }, g.items.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: CARD_W, showStatus: true }))) : /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { vertical: px(2) } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Nothing scheduled.")))));
    }
    function DoneView() {
      const dq = doneSearch.trim().toLowerCase();
      const pool = (showArchived ? all.filter((t) => t.archived || t.status === "done") : done).filter(matches).filter((t) => !dq || `${t.title} ${t.description} ${t.assignee} ${labelsOf(t).join(" ")}`.toLowerCase().includes(dq)).sort((a, b) => {
        var _a2, _b2;
        return ((_a2 = b.completedAt) != null ? _a2 : b.updatedAt) - ((_b2 = a.completedAt) != null ? _b2 : a.updatedAt);
      });
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: px(8), width: BOARD_W }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(8), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(6), verticalAlignItems: "center", padding: { vertical: px(5), horizontal: px(9) }, fill: C.surface, cornerRadius: px(8), width: px(260) }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: doneSearch || null,
          placeholder: "Search completed tasks\u2026",
          onTextEditEnd: (e) => setDoneSearch(e.characters),
          fontFamily: FONT,
          fontSize: px(11),
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: px(0) }
        }
      ), doneSearch ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Clear search", onClick: () => setDoneSearch("") }) : null), /* @__PURE__ */ figma.widget.h(Chip, { label: `Show archived (${archived.length})`, active: showArchived, onClick: () => setShowArchived(!showArchived) }), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: px(1) }), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Archive done > 14 days", icon: "archive", onClick: archiveOld, tooltip: "Move completed tasks older than 14 days to the archive" })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 0, fill: STATUS_TINT.done, cornerRadius: px(12), overflow: "hidden" }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: px(4), fill: STATUS_COLOR.done }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(6), padding: { top: px(8), bottom: px(10), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: "done", size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700 }, showArchived ? "Completed & archived" : "Completed"), /* @__PURE__ */ figma.widget.h(Pill, { text: String(pool.length), color: C.success, fill: C.bg, size: 10 })), pool.length ? pool.map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t })) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, dq || anyFilter ? "No completed tasks match." : "No completed tasks yet \u2014 click a card\u2019s circle to mark it done."))));
    }
    function PeopleView() {
      const pool = active.filter(matches);
      const names = Array.from(new Set(pool.map((t) => t.assignee))).sort((a, b) => a === "" ? 1 : b === "" ? -1 : a.localeCompare(b));
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: COL_GAP, wrap: true, width: BOARD_W, verticalAlignItems: "start" }, names.length === 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "No active tasks.") : null, names.map((name) => {
        const items = pool.filter((t) => t.assignee === name).sort(compare);
        const od = items.filter((t) => isOverdue(t.due)).length;
        const [bg, fg] = name ? avatarColors(name) : [C.surface, C.muted];
        return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: name || "__none__", direction: "vertical", width: COL_W, spacing: 0, fill: C.canvas, cornerRadius: px(12), overflow: "hidden", stroke: C.border }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: px(4), fill: fg }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(8), padding: { top: px(8), bottom: px(10), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Avatar, { name, photo: photoOf(name), size: 20 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700, color: name ? C.text : C.muted, italic: !name, width: "fill-parent", truncate: true }, name || "Unassigned"), od ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${od} overdue`, color: C.danger, fill: C.dangerSoft }) : null, /* @__PURE__ */ figma.widget.h(Pill, { text: String(items.length), color: fg, fill: bg, size: 10 })), items.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: "fill-parent", showStatus: true }))));
      }));
    }
    function SyncView() {
      const agenda = live.filter((t) => t.discuss).filter(matches).sort(compare);
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: px(8), width: BOARD_W }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(8), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, color: C.muted, width: "fill-parent" }, "Flag any task with \u201CDiscuss in team sync\u201D. Before the meeting, drop the agenda onto the canvas as stickies and work through it there."), agenda.length ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "x", label: "Clear agenda", onClick: () => agenda.forEach((t) => patch(t.id, { discuss: false })) }) : null, /* @__PURE__ */ figma.widget.h(Btn, { label: "Create agenda on canvas", icon: "sticky", tone: "primary", onClick: createAgendaOnCanvas, tooltip: "Creates a dated section with one sticky per flagged task next to the board" })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 0, fill: C.accentSoft, cornerRadius: px(12), overflow: "hidden" }, /* @__PURE__ */ figma.widget.h(Rectangle, { width: "fill-parent", height: px(4), fill: C.accent }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(6), padding: { top: px(8), bottom: px(10), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Icon, { name: "chat", color: C.accent, size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 700 }, `Team sync agenda \xB7 ${weekdayDate(today)}`), /* @__PURE__ */ figma.widget.h(Pill, { text: String(agenda.length), color: C.accent, fill: C.bg, size: 10 })), agenda.length ? agenda.map((t) => /* @__PURE__ */ figma.widget.h(AgendaRow, { key: t.id, task: t })) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Nothing on the agenda yet \u2014 open a task and click \u201CDiscuss in team sync\u201D."))));
    }
    function AgendaRow({ task }) {
      const open = openId === task.id;
      const overdue = isOverdue(task.due) && task.status !== "done";
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: task.id, direction: "vertical", width: "fill-parent", spacing: 0, fill: C.bg, cornerRadius: px(8), stroke: open ? C.accent : C.border, strokeWidth: open ? 2 : 1, hoverStyle: open ? void 0 : { stroke: C.borderStrong } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(8), padding: { vertical: px(6), horizontal: px(8) }, verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          width: px(16),
          height: px(16),
          cornerRadius: px(4),
          stroke: C.accent,
          strokeWidth: 1.5,
          strokeAlign: "inside",
          horizontalAlignItems: "center",
          verticalAlignItems: "center",
          onClick: () => setDiscuss(task.id, false),
          hoverStyle: { fill: C.accentSoft },
          tooltip: "Discussed \u2014 remove from agenda"
        }
      ), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(3) }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", onClick: () => setOpenId(open ? null : task.id) }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 600, width: "fill-parent", truncate: 2 }, task.title)), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(6), wrap: true, verticalAlignItems: "center", width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), padding: { vertical: px(1), horizontal: px(6) }, cornerRadius: px(999), fill: STATUS_SOFT[task.status], verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: task.status, size: 10 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: STATUS_COLOR[task.status] }, STATUS_LABEL[task.status])), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: task.assignee, photo: photoOf(task.assignee), size: 16 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: task.assignee ? C.text : C.faint, italic: !task.assignee }, task.assignee ? shortName(task.assignee, 20) : "Unassigned")), task.due ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: overdue ? 700 : 500, color: overdue ? C.danger : C.muted }, overdue ? `Overdue \xB7 ${dueLabel(task.due)}` : dueLabel(task.due)) : null, labelsOf(task).map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l }))), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: task.discussNote || null,
          placeholder: "Add a talking point\u2026",
          onTextEditEnd: (e) => {
            var _a2;
            if (e.characters !== ((_a2 = task.discussNote) != null ? _a2 : "")) patch(task.id, { discussNote: e.characters });
          },
          fontFamily: FONT,
          fontSize: px(11),
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "multiline",
          inputFrameProps: { padding: { vertical: px(4), horizontal: px(7) }, fill: C.surface, cornerRadius: px(6) }
        }
      )), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: open ? "chevronUp" : "chevronDown", tooltip: open ? "Collapse" : "Edit task", onClick: () => setOpenId(open ? null : task.id) })), open ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { top: 0, bottom: px(8), left: px(10), right: px(10) } }, /* @__PURE__ */ figma.widget.h(Editor, { task })) : null);
    }
    function QuickAddPanel() {
      const customDue = !!draft.due && draft.due !== today && draft.due !== tomorrow && draft.due !== nextWeek;
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(8), padding: px(10), fill: C.accentSoft, cornerRadius: px(12) }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "New task title \u2014 press Enter to add, then type the next one",
          onTextEditEnd: (e) => createTask(e.characters, { status: draft.status, priority: draft.priority, due: draft.due, assignee: draft.assignee, labels: draft.label ? [draft.label] : [] }),
          fontFamily: FONT,
          fontSize: px(12),
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.faint, fontWeight: 400 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: px(7), horizontal: px(10) }, fill: C.bg, stroke: C.accent, cornerRadius: px(8) }
        }
      ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", tooltip: "Close quick add", onClick: () => setQuickAddOpen(false) })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(14), wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, ACTIVE_STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, small: true, label: STATUS_LABEL[s], lead: /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 10, muted: draft.status !== s }), active: draft.status === s, color: STATUS_COLOR[s], soft: STATUS_SOFT[s], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { status: s })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: draft.due === today, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === today ? null : today })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Tomorrow", active: draft.due === tomorrow, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === tomorrow ? null : tomorrow })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Next week", active: draft.due === nextWeek, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === nextWeek ? null : nextWeek })) }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: customDue ? weekdayDate(draft.due) : "Pick\u2026", active: customDue, onClick: () => pickDate("New task", draft.due, (iso) => setDraft(__spreadProps(__spreadValues({}, draft), { due: iso }))) })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, small: true, label: PRIORITY_GLYPH[p], active: draft.priority === p, color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { priority: draft.priority === p ? null : p })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Avatar, { name: draft.assignee, photo: photoOf(draft.assignee), size: 18 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: draft.assignee || null,
          placeholder: "Assignee",
          onTextEditEnd: (e) => setDraft(__spreadProps(__spreadValues({}, draft), { assignee: e.characters.trim() })),
          fontFamily: FONT,
          fontSize: px(10),
          fontWeight: 600,
          fill: C.text,
          placeholderProps: { fill: C.faint, italic: true },
          width: px(88),
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: px(3), horizontal: px(8) }, fill: C.bg, stroke: C.border, cornerRadius: px(999) }
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
      )), knownLabels.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, knownLabels.slice(0, 6).map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: draft.label === l, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { label: draft.label === l ? null : l })) }))) : null));
    }
    function FilterPanel() {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: px(8), padding: px(10), fill: C.bg, cornerRadius: px(12), stroke: C.border }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(14), wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Quick" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Overdue (${overdueCount})`, color: C.danger, soft: C.dangerSoft, active: filters.due === "overdue", onClick: () => toggleFilter("due", "overdue") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Unassigned (${unassignedCount})`, active: filters.assignee === "__none__", onClick: () => toggleFilter("assignee", "__none__"), dashed: true }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: `Stale ${staleDays}d+ (${staleCount})`, color: C.warn, soft: C.warnSoft, active: filters.stale, onClick: () => setFilter("stale", !filters.stale), tooltip: `In To Do for ${staleDays}+ days` })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Due" }, /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "Today", active: filters.due === "today", onClick: () => toggleFilter("due", "today") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "This week", active: filters.due === "week", onClick: () => toggleFilter("due", "week") }), /* @__PURE__ */ figma.widget.h(Chip, { small: true, label: "No date", active: filters.due === "none", onClick: () => toggleFilter("due", "none") })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, small: true, label: PRIORITY_GLYPH[p], color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], active: filters.priority === p, onClick: () => toggleFilter("priority", p) }))), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Status" }, STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, small: true, label: STATUS_LABEL[s], lead: /* @__PURE__ */ figma.widget.h(StatusGlyph, { status: s, size: 10, muted: filters.status !== s }), color: STATUS_COLOR[s], soft: STATUS_SOFT[s], active: filters.status === s, onClick: () => toggleFilter("status", s) })))), knownLabels.length || knownAssignees.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(14), wrap: true, verticalAlignItems: "center" }, knownLabels.length ? /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Label" }, knownLabels.map((l) => /* @__PURE__ */ figma.widget.h(LabelPill, { key: l, name: l, size: 10, active: filters.label === l, onClick: () => toggleFilter("label", l) }))) : null, knownAssignees.length ? /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "People" }, knownAssignees.map((a) => /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: a,
          direction: "horizontal",
          spacing: px(4),
          padding: { vertical: px(1), horizontal: px(1) },
          cornerRadius: px(999),
          fill: filters.assignee === a ? C.accentSoft : void 0,
          stroke: filters.assignee === a ? C.accent : void 0,
          verticalAlignItems: "center",
          onClick: () => toggleFilter("assignee", a),
          hoverStyle: { fill: C.accentSoft },
          tooltip: a
        },
        /* @__PURE__ */ figma.widget.h(Avatar, { name: a, photo: photoOf(a), size: 20 }),
        filters.assignee === a ? /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { right: px(6) } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 700, color: C.accent }, shortName(a))) : null
      ))) : null) : null, anyFilter ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: px(6), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.muted }, `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}${search ? " + search" : ""} active`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "x", label: "Clear all", onClick: clearFilters })) : null);
    }
    function FilterGroup({ label, children }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { right: px(2) } }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 700, color: C.faint }, label.toUpperCase())), children);
    }
    function ViewTab({ id, label, iconName, count }) {
      const on = view === id;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: px(5),
          padding: { vertical: px(5), horizontal: px(12) },
          cornerRadius: px(7),
          fill: on ? C.bg : void 0,
          verticalAlignItems: "center",
          onClick: () => setView(id),
          hoverStyle: { fill: on ? C.bg : C.surfaceAlt },
          effect: on ? { type: "drop-shadow", color: { r: 0, g: 0, b: 0, a: 0.08 }, offset: { x: 0, y: 1 }, blur: 2 } : void 0
        },
        /* @__PURE__ */ figma.widget.h(Icon, { name: iconName, color: on ? C.accent : C.muted, size: 11 }),
        /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: on ? 700 : 500, color: on ? C.text : C.muted }, label),
        count !== void 0 && count > 0 ? /* @__PURE__ */ figma.widget.h(Pill, { text: String(count), color: id === "sync" ? C.accent : on ? C.success : C.muted, fill: id === "sync" ? C.accentSoft : on ? C.successSoft : C.surfaceAlt }) : null
      );
    }
    const agendaCount = live.filter((t) => t.discuss).length;
    void storeVersion;
    const mainView = view === "board" || view === "people" && owner ? /* @__PURE__ */ figma.widget.h(BoardView, null) : view === "week" ? /* @__PURE__ */ figma.widget.h(WeekView, null) : view === "sync" ? /* @__PURE__ */ figma.widget.h(SyncView, null) : view === "people" ? /* @__PURE__ */ figma.widget.h(PeopleView, null) : /* @__PURE__ */ figma.widget.h(DoneView, null);
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "vertical",
        spacing: px(10),
        padding: px(14),
        fill: C.bg,
        cornerRadius: px(16),
        stroke: C.border,
        strokeWidth: 1,
        width: "hug-contents",
        effect: { type: "drop-shadow", color: { r: 0.07, g: 0.09, b: 0.15, a: 0.08 }, offset: { x: 0, y: 4 }, blur: 16 }
      },
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: px(12), verticalAlignItems: "center" }, owner ? /* @__PURE__ */ figma.widget.h(Avatar, { name: owner, photo: scope.kind === "personal" ? (_b = scope.photoUrl) != null ? _b : photoOf(owner) : null, size: 30 }) : null, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: boardTitle,
          placeholder: "Board title",
          onTextEditEnd: (e) => setBoardTitle(e.characters.trim() || "Team tasks"),
          fontFamily: FONT,
          fontSize: px(16),
          fontWeight: 700,
          fill: C.text,
          width: px(220),
          inputBehavior: "truncate",
          inputFrameProps: { padding: px(0) }
        }
      ), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(4), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Pill, { text: owner ? "My board" : "Team board", color: owner ? C.accent : C.muted, fill: owner ? C.accentSoft : C.surface, size: 10, tooltip: owner ? `Shows only tasks assigned to ${owner}` : "Shows every task in this file" }), /* @__PURE__ */ figma.widget.h(Pill, { text: `${active.length} active`, color: C.muted, fill: C.surface, size: 10 }), overdueCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${overdueCount} overdue`, color: C.danger, fill: C.dangerSoft, size: 10, onClick: () => setFilter("due", filters.due === "overdue" ? null : "overdue"), tooltip: "Filter overdue" }) : null, blockedCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${blockedCount} blocked`, color: STATUS_COLOR.blocked, fill: STATUS_SOFT.blocked, size: 10 }) : null, unassignedCount ? /* @__PURE__ */ figma.widget.h(Pill, { text: `${unassignedCount} unassigned`, color: C.muted, fill: C.surface, size: 10, onClick: () => setFilter("assignee", filters.assignee === "__none__" ? null : "__none__"), tooltip: "Filter unassigned" }) : null), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: px(1) }), /* @__PURE__ */ figma.widget.h(
        Btn,
        {
          small: true,
          tone: "ghost",
          icon: owner ? "users" : "user",
          label: owner ? "Switch to team board" : "Make this my board",
          onClick: owner ? makeTeam : makeMine,
          tooltip: owner ? "Show every task in the file again" : "Show only tasks assigned to you. Duplicate the widget first if the team still needs this one."
        }
      ), /* @__PURE__ */ figma.widget.h(Btn, { label: "Add task", icon: "plus", tone: quickAddOpen ? "default" : "primary", onClick: () => setQuickAddOpen(!quickAddOpen), tooltip: "Quick add with optional details (or type directly into a column)" })),
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: px(10), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(2), padding: px(3), fill: C.surface, cornerRadius: px(9) }, /* @__PURE__ */ figma.widget.h(ViewTab, { id: "board", label: "Board", iconName: "board" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "week", label: "Week", iconName: "week" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "done", label: "Done", iconName: "check", count: done.length }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "sync", label: "Sync", iconName: "chat", count: agendaCount }), owner ? null : /* @__PURE__ */ figma.widget.h(ViewTab, { id: "people", label: "People", iconName: "users" })), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: px(1) }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: px(6), verticalAlignItems: "center", padding: { vertical: px(6), horizontal: px(10) }, fill: C.surface, stroke: search ? C.accent : void 0, cornerRadius: px(8), width: px(220) }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: search ? C.accent : C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: search || null,
          placeholder: "Search tasks, labels, people\u2026",
          onTextEditEnd: (e) => setSearch(e.characters),
          fontFamily: FONT,
          fontSize: px(11),
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "truncate",
          inputFrameProps: { padding: px(0) }
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
      ), /* @__PURE__ */ figma.widget.h(Btn, { icon: "refresh", onClick: refresh, tooltip: "Pull changes made on other boards in this file" }), /* @__PURE__ */ figma.widget.h(Btn, { icon: "download", onClick: () => exportCsv(all, boardTitle), tooltip: owner ? "Export my tasks as CSV" : "Export all tasks as CSV" })),
      quickAddOpen ? /* @__PURE__ */ figma.widget.h(QuickAddPanel, null) : null,
      filtersOpen ? /* @__PURE__ */ figma.widget.h(FilterPanel, null) : null,
      live.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: px(8), padding: { vertical: px(8), horizontal: px(10) }, fill: C.surface, cornerRadius: px(10), verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, color: C.muted, width: "fill-parent" }, "Empty board. Type a title into any column, use \u201CAdd task\u201D, or load a few sample tasks to see how it works."), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Load sample tasks", onClick: addSamples })) : null,
      mainView
    );
  }
  widget.register(Widget);
})();
