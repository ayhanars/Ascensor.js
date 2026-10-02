/// <reference types="@figma/plugin-typings" />

// ---------------------------------------------------------------------------
// Types shared with the UI
// ---------------------------------------------------------------------------

type ComponentType = "Atom" | "Component";

interface LibraryComponent {
  id: string;
  /** Cleaned display name: emojis and the version token removed. */
  name: string;
  /** The name exactly as it is in Figma. */
  rawName: string;
  type: ComponentType;
  version: string | null;
  pageName: string;
  /** Name of the other library file this component comes from (remote only). */
  source?: string;
  /** Link to the component in its file (remote only). */
  url?: string;
  /** Older history kept as version lines in the component description. */
  descriptionLog?: LogEntry[];
}

/** One change log entry for a component, from the canvas table or the description. */
interface LogEntry {
  /** Cleaned component name the entry belongs to. */
  name: string;
  version: string | null;
  /** dd.mm.yyyy or "" */
  date: string;
  /** Change type, e.g. "New Variant", "Bug Fix". */
  status: string;
  description: string;
  source: "changelog" | "description";
}

interface HistoryOptions {
  enabled: boolean;
  /** 0 = every entry. */
  limit: number;
}

/** Another library file scanned through the Figma REST API. */
interface RemoteFile {
  key: string;
  name: string;
}

/** Raw objects from GET /v1/files/:key/components and /component_sets. */
interface ApiComponent {
  node_id: string;
  name: string;
  description?: string;
  containing_frame?: {
    name?: string;
    pageName?: string;
    containingStateGroup?: { name: string; nodeId: string };
  };
}

/** Component name -> implemented version (null = not started). */
type Versions = { [componentName: string]: string | null };

/** One file per brand, both platforms inside. */
interface BrandFile {
  brand: "coba" | "purple";
  platforms: {
    ios: Versions;
    android: Versions;
  };
}

/** A manual link from a JSON component name to a library component. */
interface Mapping {
  jsonName: string;
  componentId: string;
}

type UIMessage =
  | {
      type: "generate";
      components: LibraryComponent[];
      coba: BrandFile;
      purple: BrandFile;
      mappings?: Mapping[];
      history?: HistoryOptions;
    }
  | { type: "changelog-from-selection" }
  | { type: "changelog-clear" }
  | { type: "rescan" }
  | { type: "save-token"; token: string }
  | { type: "save-files"; files: RemoteFile[] }
  | {
      type: "remote-parse";
      key: string;
      fileName: string;
      componentSets: ApiComponent[];
      components: ApiComponent[];
    }
  | { type: "close" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMN = { component: 220, version: 110, status: 160, link: 190 };
const PAD_X = 20;
const PAD_Y = 15;
const ROW_BATCH = 20;
const SCAN_YIELD_EVERY = 50;
const SCAN_PROGRESS_EVERY = 5;
const MAPPINGS_KEY = "componentStatusMappings";
const FILES_KEY = "componentStatusFiles";
const CHANGELOG_KEY = "componentStatusChangelog";
const CHANGELOG_ROW_RE = /change\s*log\s*row/i;
const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{4})/;
const SUBROW_FILL = "#FAFAF9";
const TOKEN_KEY = "componentStatusFigmaToken";

/**
 * Pages that never hold library components. Compared after stripping
 * emojis and markers such as "▸" or "🟣" and collapsing whitespace,
 * case-insensitively, so "🟣 WIP Purple" and "WIP Purple" both match.
 */
const SKIPPED_PAGES = [
  "WIP",
  "WIP Purple",
  "File template assets",
  "Annotations",
  "Text Resizing & Landscape",
  "Local components",
];

const COLOR = {
  white: "#FFFFFF",
  text: "#1C1C1A",
  muted: "#6B6B66",
  faint: "#8A8A84",
  version: "#44443F",
  border: "#E6E6E1",
  borderLight: "#EFEFEA",
  buttonStroke: "#DCDCD7",
};

const BRANDS = [
  { key: "coba", label: "COBA" },
  { key: "purple", label: "Purple" },
] as const;

const PLATFORMS = [
  { key: "ios", label: "iOS" },
  { key: "android", label: "Android" },
] as const;

type BrandKey = (typeof BRANDS)[number]["key"];
type PlatformKey = (typeof PLATFORMS)[number]["key"];

/** Accepts "v2.3.0", "2.3.0" and "v.2.3.0". */
const VERSION_RE = /version:\s*(v?\.?\d+\.\d+\.\d+)/i;
/** A version token inside a component name, e.g. "Button v2.3.0", "Card (1.2.0)" or "Tag v.1.1.3". */
const NAME_VERSION_RE = /(?:^|[^A-Za-z0-9.])(?:v\.?)?(\d+\.\d+\.\d+)(?![A-Za-z0-9.])/i;
/** Rows of components whose name contains "purple" get this background. */
const PURPLE_ROW_FILL = "#F4EFFB";
/** Emojis, pictographs, dingbats, geometric markers and the joiners around them. */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
const TYPE_RE = /type:\s*(atom|component)\b/i;

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

interface FontSet {
  regular: FontName;
  medium: FontName;
  semibold: FontName;
  mono: FontName;
}

type FontCandidates = { [K in keyof FontSet]: FontName[] };

const PRIMARY_FONTS: FontCandidates = {
  regular: [{ family: "IBM Plex Sans", style: "Regular" }],
  medium: [{ family: "IBM Plex Sans", style: "Medium" }],
  semibold: [
    { family: "IBM Plex Sans", style: "SemiBold" },
    { family: "IBM Plex Sans", style: "Semi Bold" },
  ],
  mono: [{ family: "IBM Plex Mono", style: "Regular" }],
};

const FALLBACK_FONTS: FontCandidates = {
  regular: [{ family: "Inter", style: "Regular" }],
  medium: [{ family: "Inter", style: "Medium" }],
  semibold: [
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "SemiBold" },
  ],
  mono: [{ family: "Roboto Mono", style: "Regular" }],
};

/** Inter Regular ships with every Figma install, so this always loads. */
const LAST_RESORT_FONTS: FontCandidates = {
  regular: [{ family: "Inter", style: "Regular" }],
  medium: [{ family: "Inter", style: "Regular" }],
  semibold: [{ family: "Inter", style: "Regular" }],
  mono: [{ family: "Inter", style: "Regular" }],
};

async function loadFontSet(candidates: FontCandidates): Promise<FontSet | null> {
  const out: Partial<FontSet> = {};
  const keys: (keyof FontSet)[] = ["regular", "medium", "semibold", "mono"];
  for (const key of keys) {
    let loaded: FontName | null = null;
    for (const font of candidates[key]) {
      try {
        await figma.loadFontAsync(font);
        loaded = font;
        break;
      } catch (e) {
        // try the next candidate
      }
    }
    if (!loaded) return null;
    out[key] = loaded;
  }
  return out as FontSet;
}

async function loadFonts(): Promise<FontSet> {
  const sets = [PRIMARY_FONTS, FALLBACK_FONTS, LAST_RESORT_FONTS];
  for (const set of sets) {
    const loaded = await loadFontSet(set);
    if (loaded) return loaded;
  }
  throw new Error("No usable font could be loaded.");
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function post(message: { type: string; [key: string]: unknown }): void {
  figma.ui.postMessage(message);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function solid(hex: string): SolidPaint[] {
  return [{ type: "SOLID", color: hexToRgb(hex) }];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** "2.3.0" / "V2.3.0" / "v.2.3.0" / " v2.3.0 " -> "v2.3.0" */
function normalizeVersion(version: string): string {
  const v = version.trim().replace(/^v\.?/i, "");
  return "v" + v;
}

function isPurpleName(name: string): boolean {
  return /purple/i.test(name);
}

/** Remove emojis and leading/trailing separators, collapse whitespace. */
function stripDecorations(name: string): string {
  return name
    .replace(EMOJI_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|/:,.•·]+/, "")
    .replace(/[\s\-–—|/:,•·]+$/, "")
    .trim();
}

/** "▸  WIP " -> "wip", "🟣 WIP Purple" -> "wip purple" */
function normalizePageName(name: string): string {
  return stripDecorations(name).toLowerCase();
}

/**
 * Pull a version out of a component name, e.g. "🔵 Button v2.3.0",
 * "Card (1.2.0)" or "Modal - v2.0.0". Returns the cleaned display name and
 * the version found (null when the name has none).
 */
function splitNameAndVersion(rawName: string): { name: string; version: string | null } {
  let name = rawName;
  let version: string | null = null;
  const match = NAME_VERSION_RE.exec(name);
  if (match) {
    version = normalizeVersion(match[1]);
    const full = match[0];
    // The match may start with the separator before the version; keep that char.
    const keep = /^[A-Za-z0-9.]/.test(full) ? "" : full.charAt(0);
    name = name.slice(0, match.index) + keep + " " + name.slice(match.index + full.length);
    // Drop empty brackets left behind, e.g. "Card ()".
    name = name.replace(/[(\[]\s*[)\]]/g, " ");
  }
  name = stripDecorations(name);
  // Collapse separators left dangling in the middle, e.g. "Button -  Primary".
  name = name.replace(/\s+([\-–—|/])\s+/g, " $1 ").replace(/\s{2,}/g, " ");
  return { name, version };
}

const SKIPPED_PAGE_KEYS = SKIPPED_PAGES.map(normalizePageName);

function isSkippedPage(pageName: string): boolean {
  return SKIPPED_PAGE_KEYS.indexOf(normalizePageName(pageName)) !== -1;
}

function loadSavedMappings(): Mapping[] {
  try {
    const raw = figma.root.getPluginData(MAPPINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMappings(mappings: Mapping[]): void {
  try {
    figma.root.setPluginData(MAPPINGS_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.warn("Could not save mappings: " + errorMessage(e));
  }
}

function loadSavedFiles(): RemoteFile[] {
  try {
    const raw = figma.root.getPluginData(FILES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveFiles(files: RemoteFile[]): void {
  try {
    figma.root.setPluginData(FILES_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn("Could not save files: " + errorMessage(e));
  }
}

async function loadToken(): Promise<string> {
  try {
    const token = await figma.clientStorage.getAsync(TOKEN_KEY);
    return typeof token === "string" ? token : "";
  } catch (e) {
    return "";
  }
}

async function saveToken(token: string): Promise<void> {
  await figma.clientStorage.setAsync(TOKEN_KEY, token);
}

function compareByName(a: { name: string }, b: { name: string }): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  if (x < y) return -1;
  if (x > y) return 1;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Step 1: scan the library
// ---------------------------------------------------------------------------

function isHiddenName(name: string): boolean {
  const n = name.trim();
  return n.startsWith(".") || n.startsWith("_");
}

function parseVersion(description: string): string | null {
  const match = VERSION_RE.exec(description);
  return match ? normalizeVersion(match[1]) : null;
}

function parseType(description: string, pageName: string, ancestorNames: string[]): ComponentType {
  const match = TYPE_RE.exec(description);
  if (match) {
    return match[1].toLowerCase() === "atom" ? "Atom" : "Component";
  }
  const haystack = [pageName, ...ancestorNames];
  const isAtom = haystack.some((n) => n.toLowerCase().includes("atom"));
  return isAtom ? "Atom" : "Component";
}

function ancestorsOf(node: SceneNode): { pageName: string; ancestorNames: string[] } {
  const ancestorNames: string[] = [];
  let pageName = "";
  let parent: BaseNode | null = node.parent;
  while (parent) {
    if (parent.type === "PAGE") {
      pageName = parent.name;
      break;
    }
    if (parent.type === "DOCUMENT") break;
    ancestorNames.push(parent.name);
    parent = parent.parent;
  }
  return { pageName, ancestorNames };
}

/**
 * Older history kept in the description as lines starting with a version:
 *   v1.2.0 - Added outlined variant
 *   1.1.0 (12.03.2024) Fixed padding
 * Lines that follow without a version continue the previous entry.
 */
function parseDescriptionLog(description: string, componentName: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lineRe = /^\s*(?:v\.?)?(\d+\.\d+\.\d+)\b\s*(.*)$/i;
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(version|type)\s*:/i.test(line)) continue;
    const match = lineRe.exec(line);
    if (match) {
      let rest = match[2];
      let date = "";
      const dateMatch = DATE_RE.exec(rest);
      if (dateMatch) {
        date = normalizeDate(dateMatch[0]);
        rest = rest.replace(dateMatch[0], " ");
      }
      rest = rest
        .replace(/[(\[]\s*[)\]]/g, " ")
        .replace(/^[\s\-–—:|.]+/, "")
        .replace(/[\s\-–—:|]+$/, "")
        .trim();
      entries.push({ name: componentName, version: normalizeVersion(match[1]), date, status: "", description: rest, source: "description" });
    } else if (entries.length > 0) {
      const last = entries[entries.length - 1];
      last.description = (last.description ? last.description + " " : "") + line;
    }
  }
  return entries;
}

function normalizeDate(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) return date.trim();
  const pad = (n: string) => (n.length < 2 ? "0" + n : n);
  return `${pad(m[1])}.${pad(m[2])}.${m[3]}`;
}

function describeComponent(node: ComponentNode | ComponentSetNode): LibraryComponent {
  const description = node.description || "";
  const { pageName, ancestorNames } = ancestorsOf(node);
  const split = splitNameAndVersion(node.name);
  return {
    id: node.id,
    name: split.name || node.name.trim(),
    rawName: node.name,
    type: parseType(description, pageName, ancestorNames),
    // The version in the name wins; the description is the fallback.
    version: split.version || parseVersion(description),
    pageName,
    descriptionLog: parseDescriptionLog(description, split.name || node.name.trim()),
  };
}

async function scanComponents(): Promise<void> {
  post({ type: "scan-progress", count: 0, scanned: 0, total: 0, pageName: "" });

  await figma.loadAllPagesAsync();

  const skippedPages: string[] = [];
  const pagesToScan: PageNode[] = [];
  for (const page of figma.root.children) {
    if (isSkippedPage(page.name)) skippedPages.push(page.name);
    else pagesToScan.push(page);
  }

  const components: LibraryComponent[] = [];
  let scanned = 0;
  let lastPosted = -1;
  const pageNodes = pagesToScan.map((page) => ({
    page,
    nodes: page.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] }),
  }));
  const total = pageNodes.reduce((sum, entry) => sum + entry.nodes.length, 0);

  for (const entry of pageNodes) {
    const pageName = entry.page.name;
    for (const node of entry.nodes) {
      scanned++;
      const isVariant =
        node.type === "COMPONENT" && node.parent !== null && node.parent.type === "COMPONENT_SET";
      if (!isVariant && !isHiddenName(node.name) && !isHiddenName(stripDecorations(node.name))) {
        components.push(describeComponent(node));
      }
      if (scanned % SCAN_PROGRESS_EVERY === 0 && components.length !== lastPosted) {
        lastPosted = components.length;
        post({ type: "scan-progress", count: components.length, scanned, total, pageName });
      }
      if (scanned % SCAN_YIELD_EVERY === 0) {
        await yieldToUI();
      }
    }
  }

  components.sort(compareByName);
  post({ type: "scan-progress", count: components.length, scanned, total, pageName: "" });
  post({ type: "scan-done", components, skippedPages, mappings: loadSavedMappings() });
}

// ---------------------------------------------------------------------------
// Step 1b: components of other files (data fetched by the UI from the REST API)
// ---------------------------------------------------------------------------

function describeRemote(item: ApiComponent, file: RemoteFile): LibraryComponent {
  const description = item.description || "";
  const frame = item.containing_frame || {};
  const pageName = frame.pageName || "";
  const split = splitNameAndVersion(item.name);
  return {
    id: `${file.key}/${item.node_id}`,
    name: split.name || item.name.trim(),
    rawName: item.name,
    type: parseType(description, pageName, frame.name ? [frame.name] : []),
    version: split.version || parseVersion(description),
    pageName,
    source: file.name,
    url: `https://www.figma.com/design/${file.key}?node-id=${encodeURIComponent(item.node_id)}`,
    descriptionLog: parseDescriptionLog(description, split.name || item.name.trim()),
  };
}

// ---------------------------------------------------------------------------
// Change log table on the canvas
// ---------------------------------------------------------------------------

/** Parsed entries of the remembered change log frames, kept for generation. */
let changelogEntries: LogEntry[] = [];

function loadChangelogIds(): string[] {
  try {
    const raw = figma.root.getPluginData(CHANGELOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveChangelogIds(ids: string[]): void {
  try {
    figma.root.setPluginData(CHANGELOG_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn("Could not save change log frames: " + errorMessage(e));
  }
}

function absoluteY(node: SceneNode): number {
  try {
    return node.absoluteTransform[1][2];
  } catch (e) {
    return 0;
  }
}

function textNamed(root: SceneNode & ChildrenMixin, pattern: RegExp): string {
  const found = root.findOne((n) => n.type === "TEXT" && pattern.test(n.name));
  return found && found.type === "TEXT" ? found.characters.trim() : "";
}

function textInside(root: SceneNode & ChildrenMixin, cellPattern: RegExp): string {
  const cell = root.findOne((n) => "children" in n && cellPattern.test(n.name));
  if (!cell || !("children" in cell)) return "";
  const texts = cell.findAllWithCriteria({ types: ["TEXT"] });
  return texts.length ? texts[0].characters.trim() : "";
}

function parseChangelogRow(row: SceneNode & ChildrenMixin, date: string): LogEntry | null {
  const rawName = textNamed(row, /^name$/i) || textInside(row, /component table cell/i);
  if (!rawName) return null;
  const nameSplit = splitNameAndVersion(rawName);
  const versionText = textNamed(row, /^version$/i) || textInside(row, /version table cell/i);
  const versionMatch = /(?:v\.?)?(\d+\.\d+\.\d+)/i.exec(versionText);
  const version = versionMatch ? normalizeVersion(versionMatch[1]) : nameSplit.version;
  const status = textInside(row, /status table cell/i);
  const description = textNamed(row, /^description$/i) || textInside(row, /description table cell/i);
  return {
    name: nameSplit.name || stripDecorations(rawName),
    version,
    date,
    status: stripDecorations(status),
    description: description.replace(/\s+/g, " ").trim(),
    source: "changelog",
  };
}

/** Parse every "Change log Row" inside the given frames; dates come from the nearest "Published on" text above. */
function parseChangelogFrames(frames: SceneNode[]): { entries: LogEntry[]; rows: number } {
  const entries: LogEntry[] = [];
  let rows = 0;
  for (const frame of frames) {
    if (!("children" in frame)) continue;
    const headers: { y: number; date: string }[] = [];
    for (const text of frame.findAllWithCriteria({ types: ["TEXT"] })) {
      if (/published\s+on/i.test(text.characters)) {
        const m = DATE_RE.exec(text.characters);
        if (m) headers.push({ y: absoluteY(text), date: normalizeDate(m[0]) });
      }
    }
    headers.sort((a, b) => a.y - b.y);
    const rowNodes = frame
      .findAll((n) => "children" in n && CHANGELOG_ROW_RE.test(n.name))
      .filter((n) => {
        // Keep only the outermost rows (a row never contains another row).
        let p = n.parent;
        while (p && p.type !== "PAGE") {
          if (CHANGELOG_ROW_RE.test(p.name)) return false;
          p = p.parent;
        }
        return true;
      }) as (SceneNode & ChildrenMixin)[];
    if (CHANGELOG_ROW_RE.test(frame.name)) rowNodes.push(frame as SceneNode & ChildrenMixin);
    for (const row of rowNodes) {
      rows++;
      const y = absoluteY(row);
      let date = "";
      for (const h of headers) {
        if (h.y <= y + 1) date = h.date;
        else break;
      }
      const entry = parseChangelogRow(row, date);
      if (entry) entries.push(entry);
    }
  }
  return { entries, rows };
}

async function loadChangelogFromIds(ids: string[]): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];
  for (const id of ids) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && node.type !== "DOCUMENT" && node.type !== "PAGE" && !node.removed) nodes.push(node as SceneNode);
    } catch (e) {
      // removed or inaccessible; skip
    }
  }
  return nodes;
}

function postChangelog(entries: LogEntry[], rows: number, frames: number): void {
  changelogEntries = entries;
  post({ type: "changelog", entries, rows, frames });
}

async function changelogFromSelection(): Promise<void> {
  const selection = figma.currentPage.selection.filter((n) => "children" in n);
  if (selection.length === 0) {
    throw new Error("Select the change log frame(s) on the canvas first, then click “Use selection”.");
  }
  const parsed = parseChangelogFrames(selection);
  if (parsed.rows === 0) {
    throw new Error("No “Change log Row” layers found inside the selection.");
  }
  saveChangelogIds(selection.map((n) => n.id));
  postChangelog(parsed.entries, parsed.rows, selection.length);
}

async function restoreChangelog(): Promise<void> {
  const ids = loadChangelogIds();
  if (ids.length === 0) return;
  const frames = await loadChangelogFromIds(ids);
  if (frames.length === 0) {
    saveChangelogIds([]);
    return;
  }
  const parsed = parseChangelogFrames(frames);
  postChangelog(parsed.entries, parsed.rows, frames.length);
}

/** Entries for one component: change log first, then description lines, newest first, deduped by version. */
function historyFor(component: LibraryComponent, keys: string[], byName: Map<string, LogEntry[]>, limit: number): LogEntry[] {
  const entries: LogEntry[] = [];
  const seenVersions: { [v: string]: true } = {};
  const add = (entry: LogEntry) => {
    const key = entry.version ? entry.version.toLowerCase() : "__" + entries.length;
    if (seenVersions[key]) return;
    seenVersions[key] = true;
    entries.push(entry);
  };
  for (const key of keys) {
    for (const entry of byName.get(key) || []) add(entry);
  }
  for (const entry of component.descriptionLog || []) add(entry);
  entries.sort(compareEntriesNewestFirst);
  return limit > 0 ? entries.slice(0, limit) : entries;
}

function dateValue(date: string): number {
  const m = DATE_RE.exec(date);
  return m ? parseInt(m[3], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[1], 10) : 0;
}

function versionValue(version: string | null): number {
  if (!version) return -1;
  const parts = version.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  return parts[0] * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
}

function compareEntriesNewestFirst(a: LogEntry, b: LogEntry): number {
  const v = versionValue(b.version) - versionValue(a.version);
  if (v !== 0) return v;
  return dateValue(b.date) - dateValue(a.date);
}

function buildChangelogIndex(entries: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = normalizeName(entry.name);
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

function parseRemote(
  file: RemoteFile,
  componentSets: ApiComponent[],
  components: ApiComponent[]
): { components: LibraryComponent[]; skippedPages: string[] } {
  const out: LibraryComponent[] = [];
  const skipped: { [page: string]: true } = {};
  const seen: { [id: string]: true } = {};

  const consider = (item: ApiComponent, isVariant: boolean) => {
    if (isVariant || !item || !item.name) return;
    const pageName = (item.containing_frame && item.containing_frame.pageName) || "";
    if (pageName && isSkippedPage(pageName)) {
      skipped[pageName] = true;
      return;
    }
    if (isHiddenName(item.name) || isHiddenName(stripDecorations(item.name))) return;
    if (seen[item.node_id]) return;
    seen[item.node_id] = true;
    out.push(describeRemote(item, file));
  };

  for (const set of componentSets || []) consider(set, false);
  for (const component of components || []) {
    const inSet = !!(component.containing_frame && component.containing_frame.containingStateGroup);
    consider(component, inSet);
  }
  out.sort(compareByName);
  return { components: out, skippedPages: Object.keys(skipped) };
}

// ---------------------------------------------------------------------------
// Status logic
// ---------------------------------------------------------------------------

type StatusKind = "not-started" | "implemented" | "update";

interface Status {
  kind: StatusKind;
  glyph: string;
  label: string;
  color: string;
  labelColor: string;
  implementedVersion: string | null;
}

function computeStatus(libraryVersion: string | null, implemented: string | null | undefined): Status {
  if (implemented === null || implemented === undefined || String(implemented).trim() === "") {
    return {
      kind: "not-started",
      glyph: "○",
      label: "Not Started",
      color: "#A3A39D",
      labelColor: "#8A8A84",
      implementedVersion: null,
    };
  }
  const implementedNorm = normalizeVersion(String(implemented));
  const isCurrent =
    libraryVersion === null ||
    normalizeVersion(libraryVersion).toLowerCase() === implementedNorm.toLowerCase();
  if (isCurrent) {
    return {
      kind: "implemented",
      glyph: "●",
      label: "Implemented",
      color: "#3F9558",
      labelColor: COLOR.text,
      implementedVersion: implementedNorm,
    };
  }
  return {
    kind: "update",
    glyph: "◐",
    label: "Update available",
    color: "#C9932F",
    labelColor: COLOR.text,
    implementedVersion: implementedNorm,
  };
}

/** Build a case-insensitive, trimmed lookup from a version map. */
function buildLookup(versions: Versions | undefined): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!versions || typeof versions !== "object") return map;
  for (const key of Object.keys(versions)) {
    const value = versions[key];
    map.set(normalizeName(key), typeof value === "string" ? value : null);
  }
  return map;
}

type Lookups = { [B in BrandKey]: { [P in PlatformKey]: Map<string, string | null> } };

function buildLookups(coba: BrandFile, purple: BrandFile): Lookups {
  const files: { [B in BrandKey]: BrandFile } = { coba, purple };
  const lookups = {} as Lookups;
  for (const brand of BRANDS) {
    const file = files[brand.key];
    const perPlatform = {} as { [P in PlatformKey]: Map<string, string | null> };
    for (const platform of PLATFORMS) {
      perPlatform[platform.key] = buildLookup(
        file && file.platforms ? file.platforms[platform.key] : undefined
      );
    }
    lookups[brand.key] = perPlatform;
  }
  return lookups;
}

/** componentId -> extra JSON names (normalised) that map to it. */
type Aliases = Map<string, string[]>;

function buildAliases(mappings: Mapping[] | undefined): Aliases {
  const aliases: Aliases = new Map();
  if (!mappings) return aliases;
  for (const mapping of mappings) {
    if (!mapping || !mapping.componentId || !mapping.jsonName) continue;
    const list = aliases.get(mapping.componentId) || [];
    list.push(normalizeName(mapping.jsonName));
    aliases.set(mapping.componentId, list);
  }
  return aliases;
}

/** The component's own name first, then any manually mapped JSON names. */
function lookupVersion(
  lookup: Map<string, string | null>,
  keys: string[]
): string | null | undefined {
  for (const key of keys) {
    if (lookup.has(key)) return lookup.get(key);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Node builders (Auto Layout only)
// ---------------------------------------------------------------------------

interface Sides {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

function autoFrame(name: string, direction: "HORIZONTAL" | "VERTICAL"): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = direction;
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 0;
  frame.itemSpacing = 0;
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;
  return frame;
}

function setBorders(node: FrameNode, hex: string, sides: Sides): void {
  node.strokes = solid(hex);
  node.strokeAlign = "INSIDE";
  node.strokeWeight = 1;
  node.strokeTopWeight = sides.top ? 1 : 0;
  node.strokeRightWeight = sides.right ? 1 : 0;
  node.strokeBottomWeight = sides.bottom ? 1 : 0;
  node.strokeLeftWeight = sides.left ? 1 : 0;
}

interface TextOptions {
  letterSpacingPercent?: number;
  uppercase?: boolean;
}

function makeText(
  characters: string,
  font: FontName,
  size: number,
  hex: string,
  options: TextOptions = {}
): TextNode {
  const text = figma.createText();
  text.fontName = font;
  text.characters = characters;
  text.fontSize = size;
  text.fills = solid(hex);
  if (options.letterSpacingPercent !== undefined) {
    text.letterSpacing = { unit: "PERCENT", value: options.letterSpacingPercent };
  }
  if (options.uppercase) {
    text.textCase = "UPPER";
  }
  return text;
}

/** Make a text node fill the width of its auto-layout parent and wrap. */
function fillWidth(text: TextNode): void {
  text.textAutoResize = "HEIGHT";
  text.layoutSizingHorizontal = "FILL";
}

interface CellOptions {
  /** Horizontal alignment of the cell content. */
  align?: "MIN" | "CENTER" | "MAX";
  /** Vertical alignment of the cell content. */
  verticalAlign?: "MIN" | "CENTER" | "MAX";
  gap?: number;
  paddingTop?: number;
  paddingBottom?: number;
  borders?: Sides;
  borderColor?: string;
}

/**
 * A fixed-width, vertically stacked cell appended to a horizontal row.
 * Height hugs its content; `equalizeHeights` fixes it to the row height later.
 */
function makeCell(parent: FrameNode, name: string, width: number, options: CellOptions = {}): FrameNode {
  const cell = autoFrame(name, "VERTICAL");
  cell.paddingLeft = PAD_X;
  cell.paddingRight = PAD_X;
  cell.paddingTop = options.paddingTop !== undefined ? options.paddingTop : PAD_Y;
  cell.paddingBottom = options.paddingBottom !== undefined ? options.paddingBottom : PAD_Y;
  cell.itemSpacing = options.gap !== undefined ? options.gap : 2;
  cell.counterAxisAlignItems = options.align || "MIN";
  cell.primaryAxisAlignItems = options.verticalAlign || "MIN";
  parent.appendChild(cell);
  cell.resize(width, 1);
  cell.layoutSizingHorizontal = "FIXED";
  cell.layoutSizingVertical = "HUG";
  if (options.borders) {
    setBorders(cell, options.borderColor || COLOR.border, options.borders);
  }
  return cell;
}

/**
 * Auto layout cannot "fill" the height of a hugging parent without a sizing
 * cycle, so once a row is complete every cell is fixed to the row height.
 * That keeps left/right borders spanning the full row.
 */
function equalizeHeights(row: FrameNode, cells: FrameNode[]): void {
  const height = row.height;
  for (const cell of cells) {
    cell.layoutSizingVertical = "FIXED";
    cell.resize(cell.width, height);
  }
}

// ---------------------------------------------------------------------------
// Table: header
// ---------------------------------------------------------------------------

function headerLabel(parent: FrameNode, label: string, fonts: FontSet): TextNode {
  const text = makeText(label, fonts.medium, 11, COLOR.muted, { letterSpacingPercent: 6, uppercase: true });
  parent.appendChild(text);
  return text;
}

function buildHeader(table: FrameNode, fonts: FontSet): void {
  const header = autoFrame("Header", "HORIZONTAL");
  table.appendChild(header);
  setBorders(header, COLOR.border, { bottom: true });

  const spanning: FrameNode[] = [];

  const componentCell = makeCell(header, "Component", COLUMN.component, { verticalAlign: "MAX" });
  headerLabel(componentCell, "Component", fonts);
  spanning.push(componentCell);

  const versionCell = makeCell(header, "Version", COLUMN.version, { verticalAlign: "MAX" });
  headerLabel(versionCell, "Version", fonts);
  spanning.push(versionCell);

  for (const brand of BRANDS) {
    const group = autoFrame(`Group / ${brand.label}`, "VERTICAL");
    header.appendChild(group);
    group.layoutSizingHorizontal = "HUG";
    group.layoutSizingVertical = "HUG";
    setBorders(group, COLOR.border, { left: true });

    const brandCell = makeCell(group, brand.label, COLUMN.status * 2, {
      paddingTop: PAD_Y,
      paddingBottom: 10,
      borders: { bottom: true },
      borderColor: COLOR.borderLight,
    });
    const brandText = makeText(brand.label, fonts.semibold, 13, COLOR.text);
    brandCell.appendChild(brandText);

    const pair = autoFrame("Platforms", "HORIZONTAL");
    group.appendChild(pair);
    const platformCells: FrameNode[] = [];
    for (const platform of PLATFORMS) {
      const cell = makeCell(pair, platform.label, COLUMN.status, { paddingTop: 10, paddingBottom: PAD_Y });
      cell.appendChild(makeText(platform.label, fonts.medium, 12, COLOR.muted));
      platformCells.push(cell);
    }
    equalizeHeights(pair, platformCells);
  }

  const linkCell = makeCell(header, "Link", COLUMN.link, { verticalAlign: "MAX", borders: { left: true } });
  headerLabel(linkCell, "Link", fonts);
  spanning.push(linkCell);

  equalizeHeights(header, spanning);
}

// ---------------------------------------------------------------------------
// Table: body rows
// ---------------------------------------------------------------------------

function buildStatusCell(row: FrameNode, name: string, status: Status, borderLeft: boolean, fonts: FontSet): FrameNode {
  const cell = makeCell(row, name, COLUMN.status, {
    verticalAlign: "CENTER",
    gap: 2,
    borders: borderLeft ? { left: true } : undefined,
  });

  const line = autoFrame("Status", "HORIZONTAL");
  line.itemSpacing = 6;
  line.counterAxisAlignItems = "CENTER";
  cell.appendChild(line);
  line.layoutSizingHorizontal = "FILL";
  line.layoutSizingVertical = "HUG";

  const glyph = makeText(status.glyph, fonts.semibold, 13, status.color);
  line.appendChild(glyph);

  const label = makeText(status.label, fonts.regular, 13, status.labelColor);
  line.appendChild(label);
  fillWidth(label);

  if (status.kind === "update" && status.implementedVersion) {
    const sub = makeText(`on ${status.implementedVersion}`, fonts.mono, 11, COLOR.faint);
    cell.appendChild(sub);
    fillWidth(sub);
  }
  return cell;
}

function buildRow(component: LibraryComponent, lookups: Lookups, aliases: Aliases, fonts: FontSet): FrameNode {
  const row = autoFrame(`Row / ${component.name}`, "HORIZONTAL");
  setBorders(row, COLOR.borderLight, { bottom: true });
  if (isPurpleName(component.name)) row.fills = solid(PURPLE_ROW_FILL);
  row.setPluginData("componentId", component.id);

  const cells: FrameNode[] = [];

  // Component
  const componentCell = makeCell(row, "Component", COLUMN.component, {
    verticalAlign: "CENTER",
    borders: { right: true },
  });
  const nameText = makeText(component.name, fonts.medium, 14, COLOR.text);
  componentCell.appendChild(nameText);
  fillWidth(nameText);
  const typeLine = component.source ? `${component.type} · ${component.source}` : component.type;
  const typeText = makeText(typeLine, fonts.regular, 12, COLOR.faint);
  componentCell.appendChild(typeText);
  fillWidth(typeText);
  cells.push(componentCell);

  // Version
  const versionCell = makeCell(row, "Version", COLUMN.version, { verticalAlign: "CENTER" });
  const versionText = makeText(component.version || "—", fonts.mono, 12, COLOR.version);
  versionCell.appendChild(versionText);
  fillWidth(versionText);
  cells.push(versionCell);

  // Status cells
  const keys = [normalizeName(component.name)].concat(aliases.get(component.id) || []);
  for (const brand of BRANDS) {
    for (let p = 0; p < PLATFORMS.length; p++) {
      const platform = PLATFORMS[p];
      const implemented = lookupVersion(lookups[brand.key][platform.key], keys);
      const status = computeStatus(component.version, implemented);
      cells.push(buildStatusCell(row, `${brand.label} ${platform.label}`, status, p === 0, fonts));
    }
  }

  // Link
  const linkCell = makeCell(row, "Link", COLUMN.link, {
    align: "MAX",
    verticalAlign: "CENTER",
    borders: { left: true },
  });
  const button = autoFrame("Go to Component", "HORIZONTAL");
  button.paddingLeft = 12;
  button.paddingRight = 12;
  button.counterAxisAlignItems = "CENTER";
  button.cornerRadius = 6;
  button.fills = solid(COLOR.white);
  button.strokes = solid(COLOR.buttonStroke);
  button.strokeWeight = 1;
  button.strokeAlign = "INSIDE";
  linkCell.appendChild(button);
  const buttonText = makeText("Go to Component →", fonts.medium, 12, COLOR.text);
  button.appendChild(buttonText);
  button.layoutSizingHorizontal = "HUG";
  button.layoutSizingVertical = "FIXED";
  button.resize(button.width, 30);
  try {
    const link: HyperlinkTarget = component.url
      ? { type: "URL", value: component.url }
      : { type: "NODE", value: component.id };
    buttonText.setRangeHyperlink(0, buttonText.characters.length, link);
  } catch (e) {
    console.warn(`Could not link to component ${component.name}: ${errorMessage(e)}`);
  }
  cells.push(linkCell);

  equalizeHeights(row, cells);
  return row;
}

const TABLE_WIDTH = COLUMN.component + COLUMN.version + COLUMN.status * 4 + COLUMN.link;

/** A full-width band under a component row with one line per change log entry. */
function buildHistoryRow(component: LibraryComponent, entries: LogEntry[], fonts: FontSet): FrameNode {
  const band = autoFrame(`History / ${component.name}`, "VERTICAL");
  band.fills = solid(SUBROW_FILL);
  setBorders(band, COLOR.borderLight, { bottom: true });
  band.paddingLeft = PAD_X * 2;
  band.paddingRight = PAD_X;
  band.paddingTop = 8;
  band.paddingBottom = 8;
  band.itemSpacing = 4;
  band.resize(TABLE_WIDTH, 1);
  band.layoutSizingHorizontal = "FIXED";
  band.layoutSizingVertical = "HUG";

  for (const entry of entries) {
    const line = autoFrame("Entry", "HORIZONTAL");
    line.itemSpacing = 12;
    line.counterAxisAlignItems = "MIN";
    band.appendChild(line);
    line.layoutSizingHorizontal = "FILL";
    line.layoutSizingVertical = "HUG";

    const fixed = (text: TextNode, width: number) => {
      text.textAutoResize = "HEIGHT";
      text.layoutSizingHorizontal = "FIXED";
      text.resize(width, text.height);
    };

    const version = makeText(entry.version || "—", fonts.mono, 11, COLOR.version);
    line.appendChild(version);
    fixed(version, 70);

    const date = makeText(entry.date || "", fonts.regular, 11, COLOR.faint);
    line.appendChild(date);
    fixed(date, 78);

    const status = makeText(entry.status || (entry.source === "description" ? "Description" : ""), fonts.medium, 11, COLOR.muted);
    line.appendChild(status);
    fixed(status, 100);

    const description = makeText(entry.description || "", fonts.regular, 12, COLOR.text);
    line.appendChild(description);
    fillWidth(description);
  }
  return band;
}

// ---------------------------------------------------------------------------
// Table: root
// ---------------------------------------------------------------------------

function findExistingTable(page: PageNode): FrameNode | null {
  for (const child of page.children) {
    if (child.type === "FRAME" && child.getPluginData("componentStatus") === "table") return child;
  }
  const nested = page.findOne(
    (node) => node.type === "FRAME" && node.getPluginData("componentStatus") === "table"
  );
  return nested && nested.type === "FRAME" ? nested : null;
}

async function generateTable(
  components: LibraryComponent[],
  coba: BrandFile,
  purple: BrandFile,
  mappings: Mapping[],
  history: HistoryOptions
): Promise<void> {
  const fonts = await loadFonts();
  const lookups = buildLookups(coba, purple);
  const aliases = buildAliases(mappings);
  const changelogIndex = buildChangelogIndex(changelogEntries);
  saveMappings(mappings);
  const sorted = components.slice().sort(compareByName);
  const page = figma.currentPage;
  const existing = findExistingTable(page);

  const table = autoFrame("Component Status", "VERTICAL");
  table.fills = solid(COLOR.white);
  table.strokes = solid(COLOR.border);
  table.strokeWeight = 1;
  table.strokeAlign = "INSIDE";
  table.cornerRadius = 8;
  table.clipsContent = true;
  table.setPluginData("componentStatus", "table");

  try {
    buildHeader(table, fonts);

    const body = autoFrame("Rows", "VERTICAL");
    table.appendChild(body);

    post({ type: "generate-progress", done: 0, total: sorted.length });
    for (let i = 0; i < sorted.length; i += ROW_BATCH) {
      const batch = sorted.slice(i, i + ROW_BATCH);
      for (const component of batch) {
        body.appendChild(buildRow(component, lookups, aliases, fonts));
        if (history.enabled) {
          const keys = [normalizeName(component.name)].concat(aliases.get(component.id) || []);
          const entries = historyFor(component, keys, changelogIndex, history.limit);
          if (entries.length > 0) body.appendChild(buildHistoryRow(component, entries, fonts));
        }
      }
      post({ type: "generate-progress", done: Math.min(i + ROW_BATCH, sorted.length), total: sorted.length });
      await yieldToUI();
    }

    if (existing && existing.parent) {
      const parent = existing.parent;
      const index = parent.children.indexOf(existing);
      const x = existing.x;
      const y = existing.y;
      parent.insertChild(index >= 0 ? index : parent.children.length, table);
      table.x = x;
      table.y = y;
      existing.remove();
    } else {
      const center = figma.viewport.center;
      table.x = Math.round(center.x - table.width / 2);
      table.y = Math.round(center.y - table.height / 2);
    }
  } catch (e) {
    // Leave the previous table untouched if anything went wrong mid-build.
    if (!table.removed) table.remove();
    throw e;
  }

  figma.currentPage.selection = [table];
  figma.viewport.scrollAndZoomIntoView([table]);
  figma.notify(`Table generated — ${sorted.length} components`);
  post({ type: "generate-done", count: sorted.length });
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

figma.showUI(__html__, { width: 420, height: 560, themeColors: true });

figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    switch (msg.type) {
      case "rescan":
        await scanComponents();
        break;
      case "changelog-from-selection":
        await changelogFromSelection();
        break;
      case "changelog-clear":
        saveChangelogIds([]);
        postChangelog([], 0, 0);
        break;
      case "save-token":
        await saveToken(msg.token || "");
        post({ type: "token-saved", hasToken: !!msg.token });
        break;
      case "save-files":
        saveFiles(Array.isArray(msg.files) ? msg.files : []);
        break;
      case "remote-parse": {
        const file: RemoteFile = { key: msg.key, name: msg.fileName };
        const parsed = parseRemote(file, msg.componentSets, msg.components);
        post({
          type: "remote-done",
          key: msg.key,
          fileName: msg.fileName,
          components: parsed.components,
          skippedPages: parsed.skippedPages,
        });
        break;
      }
      case "generate":
        await generateTable(
          msg.components,
          msg.coba,
          msg.purple,
          msg.mappings || [],
          msg.history || { enabled: false, limit: 0 }
        );
        break;
      case "close":
        figma.closePlugin();
        break;
    }
  } catch (e) {
    const message = errorMessage(e);
    console.error(e);
    post({ type: "error", message });
    figma.notify(message, { error: true });
  }
};

(async () => {
  try {
    post({ type: "init", token: await loadToken(), remoteFiles: loadSavedFiles() });
    await scanComponents();
    await restoreChangelog();
  } catch (e) {
    const message = errorMessage(e);
    console.error(e);
    post({ type: "error", message });
  }
})();
