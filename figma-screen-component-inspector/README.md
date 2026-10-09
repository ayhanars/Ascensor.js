# Screen Component Inspector (Figma Plugin — MVP)

A local, offline Figma plugin that inspects a selected screen/frame and
lists the design-system components and atoms it contains, aggregated by
usage count and classified via tags in each component's description.

This is an inspector only — it reads data from Figma and never modifies
your document.

## What it does

1. You select a frame (a "screen") in Figma and run the plugin.
2. It walks every component instance nested inside that frame.
3. Instances are grouped by their **underlying Figma component**, not by
   instance/layer name — two instances named "Button" that point at two
   different components are kept separate; four instances of the same
   component are collapsed into one row with a `× 4` count.
4. Each component's description is read (never written) and scanned for:
   - `[ds-component]` → classified as **DS Component**
   - `[ds-atom]` → classified as **DS Atom**
   - neither → **Unclassified**
5. Each row can be expanded to show:
   - **Tags** — every `[bracket]` label found in the description, shown
     individually (not just `[ds-component]`/`[ds-atom]`; if you also
     write e.g. `[status: stable]` or `[owner: design-team]`, those show
     up here too, label by label).
   - **Description** — the full raw description text, unchanged.
   - **Content** — the actual characters typed into each of the
     component's own text layers, per occurrence (e.g. a text layer
     still named "Label" whose displayed content was overridden to
     "Service" for that particular instance on the screen). If a
     component appears more than once, each occurrence gets its own
     "Instance N" grouping since their text can differ. Text nested
     inside a **DS Atom** instance (e.g. a Label or Icon atom used
     inside a Button component) is treated as belonging to the
     component and included here — atoms are hidden by default (see
     below), so this is usually the only place their text is visible.
     Text nested inside any *other* kind of instance (a DS Component or
     an unclassified one) is excluded — that instance gets its own row
     and its own Content section instead.
   - **Links** — both publish-time documentation links and Dev Mode "dev
     resources" links (see below).
6. The header shows the screen's name and a direct link to it in Figma.
7. For a variant (e.g. `Button` with `Size`/`State` variants), the row
   shows the component set's name with the specific variant (e.g.
   `Size=Large, State=Hover`) underneath it in a lighter color.
8. By default only **DS Component** rows are shown: "Hide atoms" is
   checked by default, and unclassified rows are hidden unless "Show
   unclassified" is checked. "Hide version numbers" (unchecked by
   default) strips version-style markers from the displayed
   component/variant name — e.g. `Button v2` → `Button`, `Card (v1.3)` →
   `Card`, and a variant property list like `Version=2, Size=Large` →
   `Size=Large` — a text transform on what's displayed/copied only. The
   other two checkboxes actually remove rows from the list. None of them
   touch the underlying Figma document, and grouping/counting is always
   keyed by real component identity regardless of any checkbox state.
   All three checkboxes only affect the already-fetched list — no
   re-analysis, and row order never changes.
9. A row whose component or variant name contains "local" (a plain,
   case-insensitive text match — not the Plugin API's separate
   local-vs-library-remote concept) is flagged, not hidden: its name is
   shown in orange and it gets an orange "Local" badge next to its
   classification badge, so components that only exist in this file
   (rather than coming from a shared library) stand out at a glance.
   **A local-named row always shows up, overriding "Show unclassified"
   and "Hide atoms"** — ad-hoc/local components frequently don't carry a
   `[ds-component]`/`[ds-atom]` tag yet (that's often exactly what makes
   them worth flagging in the first place), so without this override
   they'd silently disappear behind those two filters' defaults instead
   of being surfaced.
10. Rows are sorted by each component's **on-canvas position** — topmost
    occurrence first (top-to-bottom), then leftmost for ties — so the
    list reads in the same order as the screen itself. This is *not* the
    same as the node tree's child order (which is z-stacking/back-to-front
    and can be scrambled by reordering layers, "bring to front",
    copy-paste, etc.) — that's what earlier versions of this plugin used,
    which is why the order could look arbitrary.
11. Each row has a target/select button next to the expand arrow — click
    it to select every instance of that component on the canvas and
    scroll/zoom the viewport to fit them. This does not change what the
    plugin is inspecting (it keeps showing the current screen's
    inventory), it only changes your Figma selection on canvas.
12. A **content language** dropdown (EN/DE, defaults to DE) sits at the
    very top of the plugin. It only affects the "Copy to Technical Story"
    output below — it doesn't change anything else displayed in the
    plugin.
13. Each row has a small checkbox at its left edge (default checked) —
    uncheck it to leave that component out of "Copy to Technical Story"
    without affecting anything else (it stays visible, still counted,
    etc.). Unlike "Hide atoms"/"Show unclassified", this state is
    per-component and resets to all-checked on every fresh analysis
    (selection change or Refresh), since a re-scan can't guarantee old
    ids still mean the same thing.
14. **Copy to Technical Story** (next to Refresh, in purple) copies a
    Confluence-paste-ready rich-text block to your clipboard, built from
    whatever is *currently visible and checked* in the list (respecting
    "Hide atoms" / "Show unclassified" / "Hide version numbers" and the
    per-row checkboxes above — the "Local" highlight from item 9 is
    purely visual and doesn't filter anything, so a local component is
    still included in the copy unless you uncheck it):
    - Screen name as an H3 heading, then the Figma link as bare text (not
      a hyperlink) on its own line/paragraph — see the note below on why
      this doesn't reliably turn into an embedded preview card on its own.
    - "UI elements & copy" as its own H3 heading.
    - One block per component **occurrence** — if a component is used 3
      times, it's written out 3 times, since each occurrence's text can
      differ. The component name (as "Component Name:") is hyperlinked
      to its first documentation link when one exists.
    - Underneath each occurrence, a real nested bullet list (one `<li>`
      per text layer) so the grouping survives Confluence's paste
      sanitizer — plain CSS indentation (`margin-left`) does not, which
      is why an earlier version of this didn't look indented once
      pasted. Each item is `DE: …` / `EN: …` — whichever language is
      selected in the dropdown gets the actual text (from that
      occurrence's Content, see above), the other is left blank for a
      translator to fill in directly in Confluence.
    A small toast confirms the copy. Paste directly into Confluence's
    editor (or Word/Google Docs/any rich-text target) to get real
    headings/links/underline instead of raw text — see the clipboard
    note below for how that's implemented.

The list re-analyzes automatically whenever your selection changes while
the plugin is open, and has a manual "Refresh" button for re-reading a
description or link you just edited.

## Installing locally (no build step required)

This plugin is plain JavaScript/HTML — there is nothing to compile or
`npm install`.

1. Open the **Figma desktop app** (local/unpublished dev plugins read
   files off your disk, which a figma.com browser tab cannot do — using
   the browser instead of desktop is a common cause of load errors here).
2. Go to **Menu → Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file in this folder.
4. Open any file, select a frame, and run **Plugins → Development →
   Screen Component Inspector**.

### Troubleshooting

- **`Unable to load code: ... web:getLocalFileExtensionSource: Unknown
  plugin`** — you're most likely running this from a figma.com browser
  tab rather than the desktop app (see step 1 above), or the desktop
  app's internal registration for this local plugin was reset (happens
  after long sessions, sleep/wake, or an app update). Fix: re-import via
  **Import plugin from manifest…** again, or fully quit and reopen Figma
  desktop.
- **`Manifest error: Expected "manifest.containsWidget" to have type
  true but got undefined instead`** or, on a different upload path,
  **`Manifest has unexpected extra property: containsWidget`** — these
  two errors directly contradict each other (one wants the field, the
  other rejects it), which is a sign they came from two different Figma
  validators depending on exactly how/where you're loading the plugin
  (local desktop import vs. some other browser/upload flow). This
  plugin's manifest deliberately does **not** set `containsWidget` at
  all — it's a plugin, not a widget, and the field isn't required for
  local import via the desktop app's **Import plugin from manifest…**,
  which is the only supported way to run this MVP (see step 1 above). If
  you're hitting either of these, double-check you're using the desktop
  app rather than a figma.com browser tab.
- **`Unable to load code: ... EPERM: operation not permitted, open
  '.../code.js'`** — this is macOS itself, not Figma or this plugin. On
  macOS, apps need an explicit one-time grant (separate from normal file
  permissions) to read inside the **Desktop**, **Documents**, or
  **Downloads** folders. If this plugin's folder lives inside one of
  those, Figma may not have that grant yet. Fix either by:
  - Moving the plugin's folder somewhere outside Desktop/Documents/
    Downloads (e.g. your home folder or a `~/dev`/`~/Projects` folder),
    then re-importing from the new location — this is the more reliable
    fix, or
  - Granting Figma access via **System Settings → Privacy & Security →
    Files and Folders** (or Full Disk Access), then fully quitting and
    reopening Figma — this setting can be flaky and sometimes needs a
    restart to actually take effect.
- **Component status shows "No status entry found" for everything, or
  the status banner says 0 rows loaded.** Open the **"details"** link
  in the status banner (next to the Brand dropdown) first — it shows
  exactly what the plugin found: the root node's name, and every row's
  layer name next to the name it actually parsed out of the Component
  cell. That tells you which of these it is:
  - **0 rows, or a `fetch-failed` / HTTP 404 error** — `STATUS_FILE_KEY`
    no longer resolves. If it was set from a **branch** URL (Figma
    branch links look like `.../design/<fileKey>/branch/<branchKey>/...`
    — the branch key, not the main file key, was used), merging or
    deleting that branch invalidates the branch key. Re-check the
    current URL to the Component Status page and update
    `STATUS_FILE_KEY`/`STATUS_ROOT_NODE_ID` in `code.js` if it changed.
  - **Rows found, but a given component's name never appears on the
    right-hand side of any line in "details"** — either that
    component genuinely isn't in the table yet, or its name in the
    table differs from its Figma component name by more than
    whitespace (the matching already tolerates spacing differences
    around `/` and elsewhere).
  - **Every row's parsed name is empty ("could not parse a name")** —
    the row's internal structure (a `Component` group with the name as
    its first text layer) has changed; `parseRowNode` in `code.js`
    needs updating to match the table's current structure.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest (entry points, permissions). |
| `code.js` | Main plugin thread — reads the document via the Figma Plugin API, classifies components, sends results to the UI. Also handles the Settings tab's token storage (via `figma.clientStorage`) and, going forward, the Component Status lookup — the only thing this plugin makes network requests for, and only to `api.figma.com`. |
| `ui.html` | The plugin's UI (HTML/CSS/vanilla JS, no dependencies, no CDN). |

## Tagging your components

Add one of these tokens anywhere in a component's **description** field
(Figma properties panel → Description, when you have the component or
component-set selected):

```
[ds-component]
```
```
[ds-atom]
```

For a variant set (e.g. `Button` with `Size`/`State` variants), you can
set the tag either on each individual variant's description or once on
the component set's description — the plugin falls back to the set's
description and documentation links when a specific variant has none of
its own.

## Component Status lookup

The plugin has two tabs: **Inspector** (everything above) and
**Settings**, which holds only the Figma access token now (see below).
The Inspector tab cross-references every component it finds against the
Component Status table in the CO/CO Design Library file, and shows that
component's Implemented / Update available / Not Started status for the
selected brand right inside its expanded detail — no setup beyond the
token is needed to see it.

**Where the table lives is fixed in `code.js`, not something each
person configures.** It's a file key and a stable container node id
(`STATUS_FILE_KEY` / `STATUS_ROOT_NODE_ID` near the top of the file),
set by whoever maintains this plugin — these aren't secrets, just a
pointer, so there's nothing sensitive about having them in source. If
that table ever moves to a different file or section, the maintainer
updates those two constants and redistributes the plugin; nobody using
it needs to find or paste in a file link or page name. The fetch reads
everything under that container and recursively collects every
`Row / ...` instance it finds, so it doesn't care about the exact
internal frame structure around the rows — only that stable top-level
container needs to stay put.

**Brand dropdown.** Top of the Inspector tab, next to the language
dropdown, with a small ↻ refresh icon beside it: **COBA** / **Purple**.
Switching brands re-renders the already-expanded rows' Status block —
no re-fetch needed, since both brands' data comes back in the same
table read.

**When it loads.** The status table is fetched once per plugin session,
automatically, the first time a screen is analyzed — not re-fetched on
every screen switch or brand change. Click the ↻ icon to force a fresh
read (e.g. after the table's been updated).

**Loading/error feedback shows in the Inspector tab itself** (a banner
right under the Brand/Language row), not hidden in Settings where it'd
go unnoticed — Settings is only visited once, for the token. Unlike
earlier versions, a successful load still leaves a small persistent
line ("Component status: N rows loaded") rather than disappearing
entirely — a fetch that technically "succeeds" but parses **zero** rows
(wrong root node, table restructured, etc.) is treated as an error
instead, since it would otherwise look identical to a real success
while every component silently shows "No status entry found". Both the
error and success banners have a **"details"** link that expands a raw
dump of what was actually found — the root node's name/type, and, for
every row, its layer name next to the name the plugin actually parsed
out of its Component cell — so a mismatch can be diagnosed from inside
the plugin itself rather than from a screenshot.

**How matching works.** Each row's **Component** cell text, normalized
(whitespace around `/` and elsewhere collapsed, lowercased) and matched
against each component's base name (not the variant name) normalized
the same way — this is deliberately the same text the status table
itself displays, not the Figma layer name of either side, since layer
names can drift from what's actually shown, and deliberately not a
strict byte-for-byte match, since minor spacing differences (e.g.
"Button / Standard" vs "Button/Standard") shouldn't break the lookup. A
component that isn't found in the table shows "No status entry found"
(with the loaded row count, so you know whether it's a naming mismatch
or nothing loaded at all) rather than silently omitting anything.

**Version cell.** Looks for a group literally named `Version` first;
if that's empty, falls back to scanning the whole row for a short text
layer that looks like a version string (`v1.2.0`, `2.3`, etc.), since
this table's exact "version" cell location isn't fully nailed down yet.

**What each row's Status block shows:** iOS and Android status pills for
the selected brand (green = Implemented, amber = Update available with
its "on vX.X.X" note, gray = Not Started), the library version from the
table, and a "Go to Component ↗" link when the table row has one (read
from the real Figma hyperlink on that row's "Go to Component" text, not
guessed).

**Why a token at all:** the Figma Plugin API can only read the file it's
currently running in — it has no way to reach into a different file, by
design (a sandboxing boundary, not a limitation of this plugin). Reading
the Component Status table, which lives in a separate file, requires
Figma's REST API instead, which needs a personal access token.

**How it's stored:** entered once via the Settings tab, saved with
`figma.clientStorage` — local to your own Figma install on this machine
only. It is never written into `code.js`, `manifest.json`, or any other
file in this plugin, and therefore never ends up in version control or
in a copy of the plugin folder shared with someone else. It's sent
nowhere except directly to `api.figma.com`, which is the only domain
`manifest.json`'s `networkAccess` allows.

**Generating a token** (Settings tab walks through this too, in-app):
Figma → your profile picture (top-left) → Settings → Security tab →
Personal access tokens → Generate new token → name it, set the **File
content** scope to **Read-only** (leave everything else off) → Generate
→ copy it immediately (Figma only shows it once) → paste into the
Settings tab here and click Save.

**On "why does everyone use the same token" if that's how your team
rolled this out:** a personal access token only grants the API the same
access its creator already has in Figma — it doesn't grant new access to
anyone. If your organization shares a single admin-generated token
across many people rather than everyone generating their own, this is a
deliberate tradeoff (traded individual revocation/audit for simpler
onboarding) made by whoever administers this plugin for your team, not
something the plugin itself decides. Whatever the case, the mechanism
here (settings field → `clientStorage`) is the same either way, and
never involves committing the token to source.

**Token validation.** Rather than guessing whether a token will still
work, the plugin actually tests it: every time the plugin opens (if a
token is already saved) and right after you click Save, it calls
Figma's `GET /v1/me` — the cheapest authenticated endpoint, it just
returns the token owner's identity — and shows the real result in
Settings:
- ✓ green — "Connected as `<handle>`."
- ✗ red — "This token isn't working (invalid or expired)." — and a red
  banner appears at the top of **both** tabs with a "Fix in Settings"
  shortcut, so a broken token doesn't fail silently while you're using
  the Inspector tab.

There's also a softer, separate nudge: Figma tokens can be created with
an expiration as short as 90 days, but the API gives no way to ask a
token when it expires — so the plugin tracks when you *saved* it
locally, and once a currently-still-working token is 80+ days old, shows
an amber "this was added N days ago, consider generating a fresh one"
note. That's a heuristic based on your own save date, not a confirmed
expiry — the ✗ red check above is the actual, authoritative signal.

## Technical notes & known limitations (MVP)

- **Component links.** Figma exposes two independent, unrelated link
  features, and this plugin reads both, merging them into one "Links"
  list per component:
  - `documentationLinks` on `ComponentNode`/`ComponentSetNode` — the
    links attached via the "Add link" control in the component's
    properties panel (the same data used when preparing a component for
    library publishing).
  - **Dev Mode links ("dev resources")** — the links you attach via the
    link/paperclip control in the **Dev Mode Inspect panel** on a
    component. These are read via `figma.getDevResourcesAsync()`, a
    separate Plugin API not used in the first version of this plugin —
    this is what was missing when links weren't showing up for
    components tagged from Dev Mode. Reading these does **not** require
    the plugin itself to be running in Dev Mode.
  In both cases the plugin only displays links it read from Figma; it
  never infers, guesses, or fetches links from anywhere else. Dev
  resources also require a Figma plan with Dev Mode enabled on the
  file — on a plan/file without it, `getDevResourcesAsync` returns
  nothing and the plugin silently falls back to documentation links
  only.
- **Figma screen link.** The "Open in Figma" link is built to match what
  Figma's own "Copy link to selection" (Cmd/Ctrl+L) produces:
  `https://www.figma.com/design/<fileKey>/<fileName>?node-id=<id>`. The
  `<fileKey>` comes from `figma.fileKey`. Root cause of it showing
  "unavailable": `figma.fileKey` is a **private-plugin API** — Figma
  only populates it when the manifest sets `"enablePrivatePluginApi":
  true` (confirmed against Figma's own developer docs/forum, not a
  guess this time). That flag is now set in `manifest.json`. This
  applies to local/dev-only plugins like this one with no extra setup;
  the tradeoff is that a plugin using it can't later be published
  publicly to the Figma Community without removing this property and
  finding another way to get a file key (e.g. asking the user to paste
  a file link) — not a concern here since this MVP is explicitly local
  and not meant for Community distribution.
  **You must reimport the plugin from the manifest again** (or fully
  quit and reopen Figma) for a `manifest.json` permissions change like
  this to take effect — just re-running an already-imported plugin does
  not reread it.
- **Scope of analysis.** The plugin walks the *entire* descendant tree of
  the selected frame and counts every component instance it finds,
  including instances nested inside other instances (e.g. an icon inside
  a button). Deeper atom-hierarchy visualization (component → atom tree)
  is out of scope for this MVP per the PRD and is a candidate for a
  future version.
- **Multiple tags.** If a description contains both `[ds-component]` and
  `[ds-atom]`, the plugin classifies it as **DS Component** and lists
  both detected tags in the expanded detail view — the PRD does not
  define a precedence rule, so this is a deliberate, documented default.
- **Rich-text clipboard copy.** "Copy to Technical Story" writes HTML to
  the clipboard via a hidden `contenteditable` element plus
  `document.execCommand('copy')` on a DOM selection, rather than the
  newer async `navigator.clipboard.write`/`ClipboardItem` API. Browsers
  populate both `text/html` and `text/plain` automatically from a DOM
  selection copy, and this route is more reliably supported from inside
  a sandboxed plugin UI iframe. A target that only accepts plain text
  (e.g. a plain textarea) still gets readable output; a rich-text target
  like Confluence, Word, or Google Docs renders the heading/link/
  underline/list formatting. Before copying, the hidden container's
  styles are reset (`all: initial`) so this page's own theme (fonts,
  colors) doesn't get baked into the clipboard HTML as extra inline
  styles/spans — Chrome's copy serialization otherwise tends to do that
  for anything inheriting page CSS.
- **Figma link auto-embed is not guaranteed.** The plugin pastes the
  screen's Figma URL as bare, unlinked text specifically so a paste-time
  "turn this into an embedded card" detector has a chance to match it —
  but whether that actually happens is entirely up to the paste target,
  not this plugin. Confluence's embed/unfurl behavior for a pasted URL
  depends on things outside the Plugin API's reach: whether your
  Confluence workspace has a Figma smart-link integration enabled at
  all, which exact paste path its editor took (typed/plain-text paste is
  generally more reliable for triggering it than a rich HTML paste,
  which is what a multi-block copy like this necessarily is), and
  internal implementation details of Confluence's editor that can change
  between versions. If it still comes through as plain inline text,
  that's a Confluence-side limitation this plugin cannot force past —
  try pasting just that one link on its own (e.g. with "paste as plain
  text") if you specifically want the embed card, or use Confluence's
  own link/embed picker on the pasted URL afterward.
- **No network access.** `manifest.json` declares
  `"networkAccess": { "allowedDomains": ["none"] }` — the plugin cannot
  make any network requests, matching the privacy requirement that all
  analysis stays local to your Figma session.

## Out of scope (by design, per PRD)

No code generation, no AI analysis, no design-token extraction, no
design-system validation, no external backend/auth/storage. This plugin
only reads and displays.
