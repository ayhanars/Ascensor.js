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
   unclassified" is checked. Both checkboxes only filter the
   already-fetched list — no re-analysis, and row order never changes.
9. Rows are sorted by each component's **on-canvas position** — topmost
   occurrence first (top-to-bottom), then leftmost for ties — so the list
   reads in the same order as the screen itself. This is *not* the same
   as the node tree's child order (which is z-stacking/back-to-front and
   can be scrambled by reordering layers, "bring to front", copy-paste,
   etc.) — that's what earlier versions of this plugin used, which is
   why the order could look arbitrary.
10. Each row has a target/select button next to the expand arrow — click
    it to select every instance of that component on the canvas and
    scroll/zoom the viewport to fit them. This does not change what the
    plugin is inspecting (it keeps showing the current screen's
    inventory), it only changes your Figma selection on canvas.
11. A **content language** dropdown (EN/DE) sits at the very top of the
    plugin. It only affects the "Copy to Technical Story" output below —
    it doesn't change anything else displayed in the plugin.
12. Each row has a small checkbox at its left edge (default checked) —
    uncheck it to leave that component out of "Copy to Technical Story"
    without affecting anything else (it stays visible, still counted,
    etc.). Unlike "Hide atoms"/"Show unclassified", this state is
    per-component and resets to all-checked on every fresh analysis
    (selection change or Refresh), since a re-scan can't guarantee old
    ids still mean the same thing.
13. **Copy to Technical Story** (next to Refresh, in purple) copies a
    Confluence-paste-ready rich-text block to your clipboard, built from
    whatever is *currently visible and checked* in the list (respecting
    "Hide atoms" / "Show unclassified" and the per-row checkboxes above):
    - Screen name as an H3 heading, then the Figma link as bare text (not
      a hyperlink) on its own line/paragraph — pasted that way, most
      Confluence editors auto-detect it and offer to turn it into an
      embedded Figma preview card, which a pre-wrapped `<a>` link would
      prevent.
    - An underlined "UI elements & copy" label.
    - One block per component **occurrence** — if a component is used 3
      times, it's written out 3 times, since each occurrence's text can
      differ. The component name is hyperlinked to its first
      documentation link when one exists.
    - Underneath each occurrence, indented slightly to the right so it
      reads as a group under its name line, one entry per text layer
      found on it, as a `DE: …` / `EN: …` pair — whichever language is
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

1. Open the Figma desktop app.
2. Go to **Menu → Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file in this folder.
4. Open any file, select a frame, and run **Plugins → Development →
   Screen Component Inspector**.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest (entry points, permissions). |
| `code.js` | Main plugin thread — reads the document via the Figma Plugin API, classifies components, sends results to the UI. Runs sandboxed, no network access. |
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
  underline formatting.
- **No network access.** `manifest.json` declares
  `"networkAccess": { "allowedDomains": ["none"] }` — the plugin cannot
  make any network requests, matching the privacy requirement that all
  analysis stays local to your Figma session.

## Out of scope (by design, per PRD)

No code generation, no AI analysis, no design-token extraction, no
design-system validation, no external backend/auth/storage. This plugin
only reads and displays.
