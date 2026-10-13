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
    stale: false
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
    surface: "#F5F5F7",
    surfaceAlt: "#ECECF0",
    border: "#E3E3E8",
    borderStrong: "#CFCFD6",
    text: "#1D1D22",
    muted: "#6A6A75",
    faint: "#9C9CA6",
    accent: "#3B5BDB",
    accentSoft: "#E9EEFB",
    danger: "#C92A2A",
    dangerSoft: "#FDEBEB",
    warn: "#B35C00",
    warnSoft: "#FFF2E0",
    success: "#2B8A3E",
    successSoft: "#E6F4EA"
  };
  var STATUS_COLOR = {
    todo: "#6A6A75",
    inprogress: "#2F6FED",
    blocked: "#D9480F",
    done: "#2B8A3E"
  };
  var STATUS_SOFT = {
    todo: "#EEEEF2",
    inprogress: "#E6EEFD",
    blocked: "#FDEDE5",
    done: "#E6F4EA"
  };
  var PRIORITY_COLOR = {
    high: "#C92A2A",
    medium: "#B35C00",
    low: "#6A6A75"
  };
  var PRIORITY_SOFT = {
    high: "#FDEBEB",
    medium: "#FFF2E0",
    low: "#EEEEF2"
  };
  var wrap = (inner, color, size, sw) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  var PATHS = {
    circle: () => '<circle cx="12" cy="12" r="8.5"/>',
    half: (c) => `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="${c}" stroke="none"/>`,
    blocked: () => '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    check: () => '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    checkCircle: () => '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
    checkFilled: (c) => `<circle cx="12" cy="12" r="8.5" fill="${c}"/><path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#FFFFFF" stroke-width="2.2"/>`,
    plus: () => '<path d="M12 5v14M5 12h14"/>',
    search: () => '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    filter: () => '<path d="M4 6h16M7 12h10M10 18h4"/>',
    chevronDown: () => '<path d="M6 9l6 6 6-6"/>',
    chevronRight: () => '<path d="M9 6l6 6-6 6"/>',
    chevronUp: () => '<path d="M6 15l6-6 6 6"/>',
    calendar: () => '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    user: () => '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    x: () => '<path d="M6 6l12 12M18 6L6 18"/>',
    archive: () => '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V20h14V8.5M10 13h4"/>',
    undo: () => '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    trash: () => '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    flag: () => '<path d="M5 21V4h13l-2.5 4.5L18 13H5"/>',
    flagFilled: (c) => `<path d="M5 21V4h13l-2.5 4.5L18 13H5" fill="${c}"/>`,
    clock: () => '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: () => '<path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    board: () => '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/>',
    week: () => '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3M8 17.5h3"/>',
    dots: () => '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'
  };
  function icon(name, color, size = 12, strokeWidth = 1.8) {
    return wrap(PATHS[name](color), color, size, strokeWidth);
  }
  var STATUS_ICON = {
    todo: "circle",
    inprogress: "half",
    blocked: "blocked",
    done: "checkCircle"
  };

  // src/code.tsx
  var { widget } = figma;
  var { AutoLayout, Text, Input, SVG, useSyncedState, useSyncedMap, usePropertyMenu } = widget;
  var COL_W = 248;
  var COL_GAP = 8;
  var BOARD_W = COL_W * 4 + COL_GAP * 3;
  var COLLAPSED_W = 36;
  var CARD_W = COL_W - 16;
  var FONT = "Inter";
  var uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var toast = (msg) => figma.notify(msg, { timeout: 1400 });
  var shortName = (s) => s.length > 14 ? s.slice(0, 13) + "\u2026" : s;
  function Icon({ name, color, size = 12 }) {
    return /* @__PURE__ */ figma.widget.h(SVG, { src: icon(name, color, size), width: size, height: size });
  }
  function Label(props) {
    var _a, _b, _c, _d, _e, _f;
    return /* @__PURE__ */ figma.widget.h(
      Text,
      {
        fontFamily: FONT,
        fontSize: (_a = props.size) != null ? _a : 11,
        fontWeight: (_b = props.weight) != null ? _b : 400,
        fill: (_c = props.color) != null ? _c : C.text,
        width: (_d = props.width) != null ? _d : "hug-contents",
        truncate: props.truncate,
        textDecoration: props.strike ? "strikethrough" : "none",
        italic: props.italic,
        horizontalAlignText: (_e = props.align) != null ? _e : "left",
        lineHeight: Math.round(((_f = props.size) != null ? _f : 11) * 1.35)
      },
      props.children
    );
  }
  function Btn(props) {
    var _a;
    const tone = (_a = props.tone) != null ? _a : "default";
    const fill = tone === "primary" ? C.accent : tone === "ghost" ? "#FFFFFF00" : tone === "danger" ? C.dangerSoft : C.bg;
    const color = tone === "primary" ? "#FFFFFF" : tone === "danger" ? C.danger : tone === "ghost" ? C.muted : C.text;
    const hover = tone === "primary" ? "#3350C4" : tone === "danger" ? "#FADADA" : C.surfaceAlt;
    const pad2 = props.small ? { vertical: 3, horizontal: 6 } : { vertical: 5, horizontal: 9 };
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "horizontal",
        spacing: 5,
        padding: pad2,
        cornerRadius: 6,
        fill,
        stroke: tone === "default" ? C.border : void 0,
        strokeWidth: 1,
        verticalAlignItems: "center",
        onClick: props.onClick,
        hoverStyle: { fill: hover },
        tooltip: props.tooltip
      },
      props.icon ? /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color, size: props.small ? 11 : 12 }) : null,
      props.label ? /* @__PURE__ */ figma.widget.h(Label, { size: props.small ? 10 : 11, weight: 500, color }, props.label) : null
    );
  }
  function IconBtn(props) {
    var _a, _b;
    const s = (_a = props.size) != null ? _a : 20;
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        width: s,
        height: s,
        cornerRadius: 5,
        horizontalAlignItems: "center",
        verticalAlignItems: "center",
        onClick: props.onClick,
        hoverStyle: { fill: C.surfaceAlt },
        tooltip: props.tooltip
      },
      /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color: (_b = props.color) != null ? _b : C.muted, size: Math.round(s * 0.62) })
    );
  }
  function Chip(props) {
    var _a, _b;
    const active = !!props.active;
    const color = (_a = props.color) != null ? _a : C.accent;
    const soft = (_b = props.soft) != null ? _b : C.accentSoft;
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        direction: "horizontal",
        spacing: 4,
        padding: { vertical: 3, horizontal: 7 },
        cornerRadius: 10,
        fill: active ? soft : C.bg,
        stroke: active ? color : C.border,
        strokeWidth: 1,
        strokeDashPattern: props.dashed && !active ? [3, 2] : void 0,
        verticalAlignItems: "center",
        onClick: props.onClick,
        hoverStyle: { fill: active ? soft : C.surface, stroke: color },
        tooltip: props.tooltip
      },
      props.icon ? /* @__PURE__ */ figma.widget.h(Icon, { name: props.icon, color: active ? color : C.muted, size: 10 }) : null,
      /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: active ? 600 : 500, color: active ? color : C.muted }, props.label)
    );
  }
  function CountBadge({ n, color }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { padding: { vertical: 1, horizontal: 6 }, cornerRadius: 8, fill: C.surfaceAlt, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: color != null ? color : C.muted }, String(n)));
  }
  function Divider({ width }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: width != null ? width : "fill-parent", height: 1, fill: C.border });
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
    var _a, _b;
    const tasks = useSyncedMap("tasks");
    const [view, setView] = useSyncedState("view", "board");
    const [collapsed, setCollapsed] = useSyncedState("collapsed", { done: true });
    const [openId, setOpenId] = useSyncedState("openId", null);
    const [confirmDeleteId, setConfirmDeleteId] = useSyncedState("confirmDeleteId", null);
    const [filters, setFilters] = useSyncedState("filters", EMPTY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useSyncedState("filtersOpen", false);
    const [search, setSearch] = useSyncedState("search", "");
    const [sort, setSort] = useSyncedState("sort", "due");
    const [quickAddOpen, setQuickAddOpen] = useSyncedState("quickAddOpen", false);
    const [draft, setDraft] = useSyncedState("draft", { status: "todo", priority: null, due: null, assignee: "" });
    const [celebrating, setCelebrating] = useSyncedState("celebrating", null);
    const [showArchived, setShowArchived] = useSyncedState("showArchived", false);
    const [doneSearch, setDoneSearch] = useSyncedState("doneSearch", "");
    const [staleDays, setStaleDays] = useSyncedState("staleDays", 7);
    const [boardTitle, setBoardTitle] = useSyncedState("boardTitle", "Team tasks");
    const today = todayISO();
    const all = tasks.values();
    const live = all.filter((t) => !t.archived);
    const active = live.filter((t) => t.status !== "done");
    const done = live.filter((t) => t.status === "done");
    const archived = all.filter((t) => t.archived);
    const patch = (id, p) => {
      const t = tasks.get(id);
      if (!t) return;
      tasks.set(id, __spreadProps(__spreadValues(__spreadValues({}, t), p), { updatedAt: Date.now() }));
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
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        archived: false
      }, extra);
      if (t.status === "done") t.completedAt = now;
      tasks.set(t.id, t);
      toast(`Added \u201C${clean.length > 32 ? clean.slice(0, 32) + "\u2026" : clean}\u201D`);
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
          toast("\u2713 Completed \u2014 find it in the Done view");
          resolve();
        }, 650);
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
    const setFilter = (key, value) => setFilters(__spreadProps(__spreadValues({}, filters), { [key]: value }));
    const toggleFilter = (key, value) => setFilter(key, filters[key] === value ? key === "stale" ? false : null : value);
    const activeFilterCount = (filters.assignee ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.due ? 1 : 0) + (filters.status ? 1 : 0) + (filters.stale ? 1 : 0);
    const anyFilter = activeFilterCount > 0 || search.trim().length > 0;
    const clearFilters = () => {
      setFilters(EMPTY_FILTERS);
      setSearch("");
    };
    const isStale = (t) => t.status === "todo" && ageInDays(t.createdAt) >= staleDays;
    const matches = (t) => {
      const q = search.trim().toLowerCase();
      if (q && !(t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q))) return false;
      if (filters.assignee === "__none__" && t.assignee) return false;
      if (filters.assignee && filters.assignee !== "__none__" && t.assignee !== filters.assignee) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.stale && !isStale(t)) return false;
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
    const knownAssignees = Array.from(new Set(live.map((t) => t.assignee).filter((a) => a))).sort();
    const overdueCount = active.filter((t) => isOverdue(t.due)).length;
    const unassignedCount = active.filter((t) => !t.assignee).length;
    const staleCount = active.filter(isStale).length;
    const me = (_b = (_a = figma.currentUser) == null ? void 0 : _a.name) != null ? _b : "";
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
      const samples = [
        { title: "Draft Q4 roadmap outline", status: "todo", priority: "high", due: d(1), assignee: "Maya" },
        { title: "Review onboarding copy", status: "todo", priority: "medium", due: d(3) },
        { title: "Collect customer interview notes", status: "todo", priority: "low", due: d(-2), assignee: "Jon" },
        { title: "Prototype billing settings page", status: "inprogress", priority: "high", due: d(0), assignee: "Priya" },
        { title: "Update design tokens", status: "inprogress", priority: "medium", due: d(5), assignee: "Maya" },
        { title: "Waiting on legal: privacy copy", status: "blocked", priority: "high", due: d(-1), assignee: "Jon", description: "Blocked until legal signs off on the new consent wording." },
        { title: "Ship notification preferences", status: "done", priority: "medium", due: d(-3), assignee: "Priya" },
        { title: "Fix mobile nav overlap", status: "done", priority: "high", due: d(-6), assignee: "Maya" }
      ];
      samples.forEach((s, i) => {
        var _a2, _b2, _c, _d, _e;
        const now = Date.now() - (samples.length - i) * 1e3;
        const t = {
          id: uid() + i,
          title: s.title,
          description: (_a2 = s.description) != null ? _a2 : "",
          status: (_b2 = s.status) != null ? _b2 : "todo",
          assignee: (_c = s.assignee) != null ? _c : "",
          due: (_d = s.due) != null ? _d : null,
          priority: (_e = s.priority) != null ? _e : null,
          createdAt: now - 9 * 864e5 * (i % 2),
          updatedAt: now,
          completedAt: s.status === "done" ? now - 2 * 864e5 : null,
          archived: false
        };
        tasks.set(t.id, t);
      });
      toast("Added 8 sample tasks");
    };
    function Card({ task, width, showStatus }) {
      const open = openId === task.id;
      const isCelebrating = celebrating === task.id;
      const overdue = isOverdue(task.due) && task.status !== "done";
      const stale = isStale(task);
      const isDone = task.status === "done" || isCelebrating;
      const accent = isCelebrating ? C.success : task.status === "blocked" ? STATUS_COLOR.blocked : overdue ? C.danger : null;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: task.id,
          direction: "horizontal",
          width,
          fill: isCelebrating ? C.successSoft : C.bg,
          cornerRadius: 6,
          stroke: open ? C.accent : isCelebrating ? C.success : C.border,
          strokeWidth: 1,
          hoverStyle: open ? void 0 : { stroke: C.borderStrong },
          overflow: "hidden"
        },
        accent ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 3, height: "fill-parent", fill: accent }) : null,
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4, padding: { vertical: 6, horizontal: 8 } }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            width: 18,
            height: 18,
            cornerRadius: 9,
            horizontalAlignItems: "center",
            verticalAlignItems: "center",
            onClick: () => complete(task.id),
            hoverStyle: { fill: C.successSoft },
            tooltip: isDone ? "Completed" : "Mark done"
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: isDone ? "checkFilled" : "circle", color: isDone ? C.success : C.faint, size: 16 })
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
            fontSize: 12,
            fontWeight: 600,
            fill: C.text,
            width: "fill-parent",
            inputBehavior: "wrap",
            inputFrameProps: { padding: 0 }
          }
        ) : /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", onClick: () => setOpenId(task.id), tooltip: "Open details" }, /* @__PURE__ */ figma.widget.h(Label, { size: 12, weight: 600, width: "fill-parent", truncate: 2, strike: isDone, color: isDone ? C.muted : C.text }, task.title || "Untitled")), task.priority ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            padding: { vertical: 1, horizontal: 5 },
            cornerRadius: 4,
            fill: PRIORITY_SOFT[task.priority],
            verticalAlignItems: "center",
            spacing: 2,
            tooltip: `${PRIORITY_LABEL[task.priority]} priority`,
            onClick: () => setOpenId(open ? null : task.id)
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: task.priority === "high" ? "flagFilled" : "flag", color: PRIORITY_COLOR[task.priority], size: 9 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 700, color: PRIORITY_COLOR[task.priority] }, task.priority === "high" ? "HIGH" : task.priority === "medium" ? "MED" : "LOW")
        ) : null), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 4, verticalAlignItems: "center", wrap: true }, /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 3,
            padding: { vertical: 1, horizontal: 5 },
            cornerRadius: 4,
            fill: task.assignee ? C.surface : void 0,
            stroke: task.assignee ? void 0 : C.border,
            strokeDashPattern: task.assignee ? void 0 : [3, 2],
            verticalAlignItems: "center",
            onClick: () => setOpenId(task.id),
            hoverStyle: { fill: C.surfaceAlt },
            tooltip: task.assignee ? `Assigned to ${task.assignee}` : "Unassigned \u2014 click to assign"
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: "user", color: task.assignee ? C.muted : C.faint, size: 10 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 500, color: task.assignee ? C.text : C.faint, italic: !task.assignee }, task.assignee ? shortName(task.assignee) : "Unassigned")
        ), task.due ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 3,
            padding: { vertical: 1, horizontal: 5 },
            cornerRadius: 4,
            fill: overdue ? C.dangerSoft : C.surface,
            verticalAlignItems: "center",
            onClick: () => setOpenId(task.id),
            hoverStyle: { fill: overdue ? "#FADADA" : C.surfaceAlt },
            tooltip: overdue ? `Overdue \u2014 was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: overdue ? "alert" : "calendar", color: overdue ? C.danger : C.muted, size: 10 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: overdue ? 700 : 500, color: overdue ? C.danger : C.text }, overdue ? `Overdue \xB7 ${dueLabel(task.due)}` : dueLabel(task.due))
        ) : /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            width: 18,
            height: 18,
            cornerRadius: 4,
            horizontalAlignItems: "center",
            verticalAlignItems: "center",
            onClick: () => setDue(task.id, today),
            hoverStyle: { fill: C.surfaceAlt },
            tooltip: "No due date \u2014 click to set Today"
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: "calendar", color: C.faint, size: 11 })
        ), stale && !isDone ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 3,
            padding: { vertical: 1, horizontal: 5 },
            cornerRadius: 4,
            fill: C.warnSoft,
            verticalAlignItems: "center",
            tooltip: `In To Do for ${ageInDays(task.createdAt)} days`
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: "clock", color: C.warn, size: 10 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: C.warn }, `${ageInDays(task.createdAt)}d`)
        ) : null, showStatus ? /* @__PURE__ */ figma.widget.h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 3,
            padding: { vertical: 1, horizontal: 5 },
            cornerRadius: 4,
            fill: STATUS_SOFT[task.status],
            verticalAlignItems: "center"
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: STATUS_ICON[task.status], color: STATUS_COLOR[task.status], size: 10 }),
          /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: STATUS_COLOR[task.status] }, STATUS_LABEL[task.status])
        ) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 0, cornerRadius: 5, fill: C.surface, padding: 1 }, STATUSES.map((s) => {
          const current = task.status === s && !isCelebrating;
          return /* @__PURE__ */ figma.widget.h(
            AutoLayout,
            {
              key: s,
              width: 20,
              height: 18,
              cornerRadius: 4,
              fill: current ? C.bg : void 0,
              stroke: current ? C.border : void 0,
              horizontalAlignItems: "center",
              verticalAlignItems: "center",
              onClick: () => setStatus(task.id, s),
              hoverStyle: { fill: current ? C.bg : STATUS_SOFT[s] },
              tooltip: current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`
            },
            /* @__PURE__ */ figma.widget.h(Icon, { name: STATUS_ICON[s], color: current ? STATUS_COLOR[s] : C.faint, size: 11 })
          );
        }))), isCelebrating ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center", width: "fill-parent" }, /* @__PURE__ */ figma.widget.h(Icon, { name: "check", color: C.success, size: 11 }), /* @__PURE__ */ figma.widget.h(Label, { size: 10, weight: 600, color: C.success }, "Done! Moving to Completed\u2026")) : null, open ? /* @__PURE__ */ figma.widget.h(CardDetails, { task }) : null)
      );
    }
    function CardDetails({ task }) {
      const confirming = confirmDeleteId === task.id;
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 6, padding: { top: 2 } }, /* @__PURE__ */ figma.widget.h(Divider, null), /* @__PURE__ */ figma.widget.h(
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
          inputFrameProps: { padding: { vertical: 4, horizontal: 6 }, fill: C.surface, cornerRadius: 4 }
        }
      ), /* @__PURE__ */ figma.widget.h(Row, { label: "Status" }, STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          key: s,
          label: STATUS_LABEL[s],
          icon: STATUS_ICON[s],
          active: task.status === s,
          color: STATUS_COLOR[s],
          soft: STATUS_SOFT[s],
          onClick: () => setStatus(task.id, s)
        }
      ))), /* @__PURE__ */ figma.widget.h(Row, { label: "Due" }, /* @__PURE__ */ figma.widget.h(Chip, { label: "Today", active: task.due === today, onClick: () => setDue(task.id, today) }), /* @__PURE__ */ figma.widget.h(Chip, { label: "Tomorrow", active: task.due === addDaysISO(today, 1), onClick: () => setDue(task.id, addDaysISO(today, 1)) }), /* @__PURE__ */ figma.widget.h(Chip, { label: "Next Mon", active: task.due === nextMondayISO(), onClick: () => setDue(task.id, nextMondayISO()) }), /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          label: task.due ? weekdayDate(task.due) : "Pick date\u2026",
          icon: "calendar",
          active: !!task.due && task.due !== today && task.due !== addDaysISO(today, 1) && task.due !== nextMondayISO(),
          onClick: () => pickDate(task.title, task.due, (iso) => setDue(task.id, iso))
        }
      ), task.due ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 18, tooltip: "Clear due date", onClick: () => setDue(task.id, null) }) : null), /* @__PURE__ */ figma.widget.h(Row, { label: "Owner" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: task.assignee || null,
          placeholder: "Unassigned",
          onTextEditEnd: (e) => {
            const v = e.characters.trim();
            if (v !== task.assignee) patch(task.id, { assignee: v });
          },
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.faint, italic: true },
          width: 96,
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: 3, horizontal: 7 }, fill: C.bg, stroke: C.border, cornerRadius: 10 }
        }
      ), me ? /* @__PURE__ */ figma.widget.h(Chip, { label: "Me", icon: "user", active: task.assignee === me, onClick: () => patch(task.id, { assignee: task.assignee === me ? "" : me }) }) : null, knownAssignees.filter((a) => a !== me).slice(0, 3).map((a) => /* @__PURE__ */ figma.widget.h(Chip, { key: a, label: a, active: task.assignee === a, onClick: () => patch(task.id, { assignee: task.assignee === a ? "" : a }) }))), /* @__PURE__ */ figma.widget.h(Row, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          key: p,
          label: PRIORITY_LABEL[p],
          icon: p === "high" ? "flagFilled" : "flag",
          active: task.priority === p,
          color: PRIORITY_COLOR[p],
          soft: PRIORITY_SOFT[p],
          onClick: () => patch(task.id, { priority: task.priority === p ? null : p })
        }
      ))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", verticalAlignItems: "center", spacing: 4 }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, `Created ${fromTimestamp(task.createdAt)}${task.completedAt ? ` \xB7 Done ${fromTimestamp(task.completedAt)}` : ""}`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "archive", tooltip: "Archive (keeps the task, hides it from views)", onClick: () => archive(task.id, true) }), confirming ? /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "danger", icon: "trash", label: "Confirm delete", onClick: () => remove(task.id) }) : /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "trash", tooltip: "Delete permanently", onClick: () => setConfirmDeleteId(task.id) }), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "chevronUp", tooltip: "Collapse", onClick: () => setOpenId(null) })));
    }
    function Row({ label, children }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 4, verticalAlignItems: "center", wrap: true }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 44 }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 600, color: C.faint }, label.toUpperCase())), children);
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
            spacing: 6,
            padding: { vertical: 8, horizontal: 4 },
            fill: C.surface,
            cornerRadius: 8,
            horizontalAlignItems: "center",
            onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: false })),
            hoverStyle: { fill: C.surfaceAlt },
            tooltip: `Expand ${STATUS_LABEL[status]} (${items.length})`
          },
          /* @__PURE__ */ figma.widget.h(Icon, { name: "chevronRight", color: C.muted, size: 12 }),
          /* @__PURE__ */ figma.widget.h(Icon, { name: STATUS_ICON[status], color, size: 14 }),
          /* @__PURE__ */ figma.widget.h(CountBadge, { n: items.length, color }),
          /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 0, horizontalAlignItems: "center", padding: { top: 2 } }, STATUS_SHORT[status].split("").map((ch, i) => /* @__PURE__ */ figma.widget.h(Label, { key: i, size: 9, weight: 700, color: C.muted }, ch)))
        );
      }
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: status, direction: "vertical", width: COL_W, spacing: 6, padding: 8, fill: C.surface, cornerRadius: 8 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Icon, { name: STATUS_ICON[status], color, size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 700, color: C.text }, STATUS_LABEL[status]), /* @__PURE__ */ figma.widget.h(CountBadge, { n: visible.length, color }), hiddenByFilter > 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, `+${hiddenByFilter} filtered`) : null, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "chevronDown", tooltip: "Collapse column", onClick: () => setCollapsed(__spreadProps(__spreadValues({}, collapsed), { [status]: true })) })), status === "done" ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4 }, visible.slice(0, 4).map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t, compact: true })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Completed tasks land here.") : null, /* @__PURE__ */ figma.widget.h(
        Btn,
        {
          label: visible.length > 4 ? `View all ${visible.length} completed` : "Open Done view",
          icon: "chevronRight",
          tone: "ghost",
          small: true,
          onClick: () => setView("done")
        }
      )) : /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4 }, visible.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: "fill-parent" })), visible.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", padding: { vertical: 6, horizontal: 4 } }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, items.length > 0 ? "No matches for current filters." : status === "todo" && live.length === 0 ? "Type below to add your first task." : "Nothing here.")) : null, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "+ Add task, press Enter",
          onTextEditEnd: (e) => createTask(e.characters, { status }),
          fontFamily: FONT,
          fontSize: 11,
          fill: C.text,
          placeholderProps: { fill: C.faint },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: {
            padding: { vertical: 5, horizontal: 8 },
            fill: C.bg,
            stroke: C.border,
            strokeDashPattern: [3, 2],
            cornerRadius: 6,
            hoverStyle: { stroke: C.accent }
          }
        }
      )));
    }
    function DoneRow({ task, compact }) {
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          key: task.id,
          direction: "horizontal",
          width: "fill-parent",
          spacing: 6,
          padding: { vertical: 4, horizontal: 6 },
          fill: C.bg,
          cornerRadius: 5,
          stroke: C.border,
          verticalAlignItems: "center",
          hoverStyle: { stroke: C.borderStrong }
        },
        /* @__PURE__ */ figma.widget.h(Icon, { name: task.archived ? "archive" : "checkFilled", color: task.archived ? C.faint : C.success, size: 13 }),
        /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 1 }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 500, color: C.muted, strike: !task.archived, width: "fill-parent", truncate: true }, task.title), compact ? null : /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint, width: "fill-parent", truncate: true }, [
          task.assignee ? `@${task.assignee}` : "Unassigned",
          task.due ? `due ${weekdayDate(task.due)}` : null,
          task.completedAt ? `completed ${fromTimestamp(task.completedAt)}` : null,
          task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null
        ].filter(Boolean).join(" \xB7 "))),
        compact ? /* @__PURE__ */ figma.widget.h(Label, { size: 9, color: C.faint }, task.completedAt ? fromTimestamp(task.completedAt) : "") : null,
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
      if (overdue.length) groups.push({ key: "overdue", title: "Overdue", items: overdue, tone: C.danger });
      for (let i = 0; i < 7; i++) {
        const iso = addDaysISO(today, i);
        const items = pool.filter((t) => t.due === iso);
        groups.push({ key: iso, title: i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekdayDate(iso).split(",")[0], sub: weekdayDate(iso), items });
      }
      const later = pool.filter((t) => t.due && daysFromToday(t.due) > 6);
      if (later.length) groups.push({ key: "later", title: "Later", items: later });
      const undated = pool.filter((t) => !t.due);
      groups.push({ key: "none", title: "No due date", sub: "Click a card\u2019s calendar icon to schedule", items: undated });
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, width: BOARD_W }, groups.map((g) => {
        var _a2;
        return /* @__PURE__ */ figma.widget.h(AutoLayout, { key: g.key, direction: "vertical", width: "fill-parent", spacing: 6, padding: 8, fill: C.surface, cornerRadius: 8 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, g.key === "overdue" ? /* @__PURE__ */ figma.widget.h(Icon, { name: "alert", color: C.danger, size: 12 }) : /* @__PURE__ */ figma.widget.h(Icon, { name: "calendar", color: C.muted, size: 12 }), /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 700, color: (_a2 = g.tone) != null ? _a2 : C.text }, g.title), g.sub ? /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint }, g.sub) : null, /* @__PURE__ */ figma.widget.h(CountBadge, { n: g.items.length, color: g.tone })), g.items.length ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, wrap: true, verticalAlignItems: "start" }, g.items.map((t) => /* @__PURE__ */ figma.widget.h(Card, { key: t.id, task: t, width: CARD_W, showStatus: true }))) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, "Nothing scheduled."));
      }));
    }
    function DoneView() {
      const q = doneSearch.trim().toLowerCase();
      const pool = (showArchived ? all.filter((t) => t.archived || t.status === "done") : done).filter(matches).filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q)).sort((a, b) => {
        var _a2, _b2;
        return ((_a2 = b.completedAt) != null ? _a2 : b.updatedAt) - ((_b2 = a.completedAt) != null ? _b2 : a.updatedAt);
      });
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, width: BOARD_W }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 8, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center", padding: { vertical: 4, horizontal: 8 }, fill: C.bg, stroke: C.border, cornerRadius: 6, width: 260 }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
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
      ), doneSearch ? /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", size: 16, tooltip: "Clear search", onClick: () => setDoneSearch("") }) : null), /* @__PURE__ */ figma.widget.h(Chip, { label: `Show archived (${archived.length})`, icon: "archive", active: showArchived, onClick: () => setShowArchived(!showArchived) }), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Archive done > 14 days", icon: "archive", onClick: archiveOld, tooltip: "Move completed tasks older than 14 days to the archive" })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 4, padding: 8, fill: C.surface, cornerRadius: 8 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Icon, { name: "checkCircle", color: C.success, size: 13 }), /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: 700 }, showArchived ? "Completed & archived" : "Completed"), /* @__PURE__ */ figma.widget.h(CountBadge, { n: pool.length, color: C.success })), pool.length ? pool.map((t) => /* @__PURE__ */ figma.widget.h(DoneRow, { key: t.id, task: t })) : /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.faint, italic: true }, q || anyFilter ? "No completed tasks match." : "No completed tasks yet \u2014 mark a card done with its check circle.")));
    }
    function QuickAddPanel() {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 6, padding: 8, fill: C.accentSoft, cornerRadius: 8, stroke: C.accent, strokeWidth: 1 }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: null,
          placeholder: "New task title \u2014 press Enter to add, then type the next one",
          onTextEditEnd: (e) => createTask(e.characters, { status: draft.status, priority: draft.priority, due: draft.due, assignee: draft.assignee }),
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.faint, fontWeight: 400 },
          width: "fill-parent",
          inputBehavior: "wrap",
          inputFrameProps: { padding: { vertical: 6, horizontal: 8 }, fill: C.bg, stroke: C.accent, cornerRadius: 6 }
        }
      ), /* @__PURE__ */ figma.widget.h(IconBtn, { icon: "x", tooltip: "Close quick add", onClick: () => setQuickAddOpen(false) })), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 10, wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, ACTIVE_STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, label: STATUS_LABEL[s], icon: STATUS_ICON[s], active: draft.status === s, color: STATUS_COLOR[s], soft: STATUS_SOFT[s], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { status: s })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Chip, { label: "Today", active: draft.due === today, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === today ? null : today })) }), /* @__PURE__ */ figma.widget.h(Chip, { label: "Tomorrow", active: draft.due === addDaysISO(today, 1), onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === addDaysISO(today, 1) ? null : addDaysISO(today, 1) })) }), /* @__PURE__ */ figma.widget.h(Chip, { label: "Next Mon", active: draft.due === nextMondayISO(), onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { due: draft.due === nextMondayISO() ? null : nextMondayISO() })) }), /* @__PURE__ */ figma.widget.h(
        Chip,
        {
          label: draft.due && draft.due !== today && draft.due !== addDaysISO(today, 1) && draft.due !== nextMondayISO() ? weekdayDate(draft.due) : "Pick\u2026",
          icon: "calendar",
          active: !!draft.due && draft.due !== today && draft.due !== addDaysISO(today, 1) && draft.due !== nextMondayISO(),
          onClick: () => pickDate("New task", draft.due, (iso) => setDraft(__spreadProps(__spreadValues({}, draft), { due: iso })))
        }
      )), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, label: PRIORITY_LABEL[p], icon: p === "high" ? "flagFilled" : "flag", active: draft.priority === p, color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { priority: draft.priority === p ? null : p })) }))), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(
        Input,
        {
          value: draft.assignee || null,
          placeholder: "Assignee",
          onTextEditEnd: (e) => setDraft(__spreadProps(__spreadValues({}, draft), { assignee: e.characters.trim() })),
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: 500,
          fill: C.text,
          placeholderProps: { fill: C.faint, italic: true },
          width: 88,
          inputBehavior: "truncate",
          inputFrameProps: { padding: { vertical: 3, horizontal: 7 }, fill: C.bg, stroke: C.border, cornerRadius: 10 }
        }
      ), me ? /* @__PURE__ */ figma.widget.h(Chip, { label: "Me", icon: "user", active: draft.assignee === me, onClick: () => setDraft(__spreadProps(__spreadValues({}, draft), { assignee: draft.assignee === me ? "" : me })) }) : null)));
    }
    function FilterPanel() {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", width: "fill-parent", spacing: 6, padding: 8, fill: C.bg, cornerRadius: 8, stroke: C.border }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 10, wrap: true, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Quick" }, /* @__PURE__ */ figma.widget.h(Chip, { label: `Overdue (${overdueCount})`, icon: "alert", color: C.danger, soft: C.dangerSoft, active: filters.due === "overdue", onClick: () => toggleFilter("due", "overdue") }), /* @__PURE__ */ figma.widget.h(Chip, { label: `Unassigned (${unassignedCount})`, icon: "user", active: filters.assignee === "__none__", onClick: () => toggleFilter("assignee", "__none__"), dashed: true }), /* @__PURE__ */ figma.widget.h(Chip, { label: `Stale in To Do ${staleDays}d+ (${staleCount})`, icon: "clock", color: C.warn, soft: C.warnSoft, active: filters.stale, onClick: () => setFilter("stale", !filters.stale) })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Due" }, /* @__PURE__ */ figma.widget.h(Chip, { label: "Today", active: filters.due === "today", onClick: () => toggleFilter("due", "today") }), /* @__PURE__ */ figma.widget.h(Chip, { label: "This week", active: filters.due === "week", onClick: () => toggleFilter("due", "week") }), /* @__PURE__ */ figma.widget.h(Chip, { label: "No date", active: filters.due === "none", onClick: () => toggleFilter("due", "none") })), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Priority" }, PRIORITIES.map((p) => /* @__PURE__ */ figma.widget.h(Chip, { key: p, label: PRIORITY_LABEL[p], icon: p === "high" ? "flagFilled" : "flag", color: PRIORITY_COLOR[p], soft: PRIORITY_SOFT[p], active: filters.priority === p, onClick: () => toggleFilter("priority", p) }))), /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Status" }, STATUSES.map((s) => /* @__PURE__ */ figma.widget.h(Chip, { key: s, label: STATUS_LABEL[s], icon: STATUS_ICON[s], color: STATUS_COLOR[s], soft: STATUS_SOFT[s], active: filters.status === s, onClick: () => toggleFilter("status", s) }))), knownAssignees.length ? /* @__PURE__ */ figma.widget.h(FilterGroup, { label: "Assignee" }, knownAssignees.map((a) => /* @__PURE__ */ figma.widget.h(Chip, { key: a, label: a, icon: "user", active: filters.assignee === a, onClick: () => toggleFilter("assignee", a) }))) : null), anyFilter ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: "fill-parent", spacing: 6, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.muted }, `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}${search ? " + search" : ""} active`), /* @__PURE__ */ figma.widget.h(Btn, { small: true, tone: "ghost", icon: "x", label: "Clear all", onClick: clearFilters })) : null);
    }
    function FilterGroup({ label, children }) {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 4, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 9, weight: 700, color: C.faint }, label.toUpperCase()), children);
    }
    function ViewTab({ id, label, iconName, count }) {
      const on = view === id;
      return /* @__PURE__ */ figma.widget.h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 4,
          padding: { vertical: 4, horizontal: 8 },
          cornerRadius: 5,
          fill: on ? C.bg : void 0,
          stroke: on ? C.border : void 0,
          verticalAlignItems: "center",
          onClick: () => setView(id),
          hoverStyle: { fill: on ? C.bg : C.surfaceAlt }
        },
        /* @__PURE__ */ figma.widget.h(Icon, { name: iconName, color: on ? C.text : C.muted, size: 11 }),
        /* @__PURE__ */ figma.widget.h(Label, { size: 11, weight: on ? 600 : 500, color: on ? C.text : C.muted }, label),
        count !== void 0 && count > 0 ? /* @__PURE__ */ figma.widget.h(CountBadge, { n: count }) : null
      );
    }
    const summary = [
      `${active.length} active`,
      overdueCount ? `${overdueCount} overdue` : null,
      active.filter((t) => t.status === "blocked").length ? `${active.filter((t) => t.status === "blocked").length} blocked` : null,
      `${done.length} done`
    ].filter(Boolean).join(" \xB7 ");
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, padding: 10, fill: C.bg, cornerRadius: 12, stroke: C.border, strokeWidth: 1, width: "hug-contents" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: 8, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 0 }, /* @__PURE__ */ figma.widget.h(
      Input,
      {
        value: boardTitle,
        placeholder: "Board title",
        onTextEditEnd: (e) => setBoardTitle(e.characters.trim() || "Team tasks"),
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 700,
        fill: C.text,
        width: 180,
        inputBehavior: "truncate",
        inputFrameProps: { padding: 0 }
      }
    ), /* @__PURE__ */ figma.widget.h(Label, { size: 10, color: C.muted }, summary)), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 2, padding: 2, fill: C.surface, cornerRadius: 6 }, /* @__PURE__ */ figma.widget.h(ViewTab, { id: "board", label: "Board", iconName: "board" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "week", label: "Week", iconName: "week" }), /* @__PURE__ */ figma.widget.h(ViewTab, { id: "done", label: "Done", iconName: "checkCircle", count: done.length })), /* @__PURE__ */ figma.widget.h(AutoLayout, { width: "fill-parent", height: 1 }), /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, verticalAlignItems: "center", padding: { vertical: 4, horizontal: 8 }, fill: C.bg, stroke: search ? C.accent : C.border, cornerRadius: 6, width: 200 }, /* @__PURE__ */ figma.widget.h(Icon, { name: "search", color: search ? C.accent : C.faint, size: 12 }), /* @__PURE__ */ figma.widget.h(
      Input,
      {
        value: search || null,
        placeholder: "Search tasks\u2026",
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
        tooltip: "Filter by assignee, priority, due date, status"
      }
    ), /* @__PURE__ */ figma.widget.h(Btn, { label: "Add task", icon: "plus", tone: quickAddOpen ? "default" : "primary", onClick: () => setQuickAddOpen(!quickAddOpen), tooltip: "Quick add with optional details (or type directly into a column)" })), quickAddOpen ? /* @__PURE__ */ figma.widget.h(QuickAddPanel, null) : null, filtersOpen ? /* @__PURE__ */ figma.widget.h(FilterPanel, null) : null, live.length === 0 ? /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", width: BOARD_W, spacing: 8, padding: { vertical: 6, horizontal: 8 }, fill: C.surface, cornerRadius: 8, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Label, { size: 11, color: C.muted, width: "fill-parent" }, "Empty board. Type a title into any column, use \u201CAdd task\u201D, or load a few sample tasks to see how it works."), /* @__PURE__ */ figma.widget.h(Btn, { small: true, label: "Load sample tasks", onClick: addSamples })) : null, view === "board" ? /* @__PURE__ */ figma.widget.h(BoardView, null) : view === "week" ? /* @__PURE__ */ figma.widget.h(WeekView, null) : /* @__PURE__ */ figma.widget.h(DoneView, null));
  }
  widget.register(Widget);
})();
