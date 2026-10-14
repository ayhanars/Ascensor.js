# Kanban Lite — FigJam task widget

A compact, interactive Kanban board that lives on a FigJam canvas. Create tasks by
typing a title, change status with one click, schedule with quick dates, and keep
completed work out of the way but searchable. All state is stored in the widget
itself and synced to every collaborator in the file — no backend, no external
services.

```
figjam-kanban-widget/
├── manifest.json        ← import this in Figma (Widgets → Development → Import widget from manifest…)
├── dist/
│   ├── code.js          ← compiled widget (prebuilt, ready to run)
│   └── ui.html          ← tiny iframe used only for the "Pick a date…" calendar
├── src/
│   ├── code.tsx         ← widget UI + logic (Figma Widget API, JSX)
│   ├── types.ts         ← Task / Filter types and status/priority constants
│   ├── dates.ts         ← date helpers (today, tomorrow, next Monday, overdue…)
│   ├── theme.ts         ← colours, status/priority glyphs, avatar palette
│   └── ui.html          ← source of the date-picker iframe
├── build.mjs            ← esbuild bundler script
├── package.json
└── tsconfig.json
```

## Install (no build needed)

1. Unzip the folder anywhere on your computer.
2. Open the **Figma desktop app** (widget development requires the desktop app).
3. Open any FigJam file → main menu **Widgets → Development → Import widget from manifest…**
4. Select `manifest.json` from the unzipped folder.
5. In the FigJam toolbar open **Widgets**, find **Kanban Lite** under *Development*, and drop it on the canvas.
6. Optional: use the widget's property menu → **Add sample tasks** to see it populated.

The widget is private to you until you publish it. To share with your team either
publish it to your organisation (Widgets → Development → Publish) or have teammates
import the same manifest. Once a widget instance is on a shared board, everyone
with edit access sees and changes the same tasks.

## Rebuild from source (optional)

```bash
npm install
npm run build      # → dist/code.js + dist/ui.html
npm run watch      # rebuild on save
npm run typecheck
```

Requires Node 18+. After rebuilding, Figma picks up the new `dist/code.js` automatically
on the next widget interaction (or re-import the manifest).

## How it maps to the brief

| Brief section | Where it lives |
| --- | --- |
| 1 Core layout | Four columns (To Do / In Progress / Blocked / Done), 248px wide, hug-height so there are never empty gaps. Chevron collapses a column to a 36px strip that still shows its count. Counts in every header. Done column is expanded by default and shows the 5 most recent completions as compact rows; the rest live in the Done tab. |
| Task details (editor) | Clicking a card title **expands the card in place**, inside its own column. The compact row (owner · due · subtasks · status control) stays as the single set of controls — nothing is shown twice — and the editor adds description, due quick picks, people (**more than one person can be assigned**: avatar stack, name field with prefix matching, **Me** toggles you on/off, one-click chips for every known person — the first person is the owner, the others co-assignees), priority, labels, team sync and a subtask checklist with progress bar, plus archive/delete. Works the same in Week view and on rows in the Done and Sync views. It holds title, description, status, due date (current value + quick picks), owner (photo/initials avatar, name field, **Me**, one-click avatars of known people), priority, **labels**, and a **subtask checklist** with progress bar. |
| Labels & subtasks | Tasks can carry project labels (free text, colour derived from the name, consistent across the board). Cards show up to three label pills; clicking one filters the board by that label. Subtasks show as a `2/5` progress pill on the card; the inspector lets you add, rename, tick and remove them. Search covers labels and subtask titles. |
| Team sync agenda | Any task can be flagged **Discuss in team sync** (in the expanded card) with an optional talking point. Flagged cards show a "Sync" pill, and the **Sync** tab lists the agenda with status, owner, due date, labels and the note. **Create agenda on canvas** creates a dated section (`Team sync · Tue, Oct 13`) to the right of the widget with one FigJam sticky per flagged task, colour-coded by status, so the meeting can run on the canvas. Ticking an agenda row removes it after it has been discussed; "Clear agenda" resets everything for the next meeting. |
| 2 Quick creation | A dashed **"+ Add task"** input at the bottom of every active column: type, press Enter, task appears, input clears for the next one. The **Add task** header button creates a blank card **at the top of the To Do column, already expanded** with the full editor (title, description, due, owner, priority, labels, subtasks, team sync). Type the title and press Enter; close it empty and it is discarded. The card stays pinned to the top until you close it. Click a card to expand it and edit title, description, owner, due, priority inline. |
| 3 One-step status | Every card has one status control: three glyph buttons (○ To Do, ◐ In Progress, ⊖ Blocked) and the check circle at the start of the title for Done — the same control in the compact card, the expanded card and the editor. Clicking re-files the card instantly; columns re-flow automatically. Where there is no column to tell the status (Week, People, Done, Sync views) the control also shows the current status as text. |
| 4 Scheduling | Due chips: Today / Tomorrow / Next week / Pick date… (native calendar in a small iframe) / clear. The card shows "Today", "Tomorrow", "Thu 16", or "Oct 24". Overdue cards get a red left stripe and an "Overdue · <date>" badge with a warning icon. **Week** view groups active tasks by Overdue / Today / Tomorrow / next five days / Later / No due date. Sort by due date (default), priority or newest via the property menu. |
| 5 Assignees & priority | Owner is free text with a **Me** shortcut (uses your Figma name) and one-click avatars of people already on the board or active in the file. Avatars show the person's **Figma profile photo** when known, initials otherwise. Unassigned shows as a dashed "?" ring plus "Unassigned". Priority ↑ High / → Med / ↓ Low pills. Filter by both, plus by label. |
| 6 Completed & history | Marking Done plays a brief check animation, then the card leaves the active board. **Done** view lists completed tasks with owner, due date, completion date, priority; searchable; **Reopen** returns a task to To Do. **Archive** hides outdated tasks (toggle *Show archived* to browse, restore or permanently delete them). Property menu: *Archive done > 14 days*. Nothing is deleted automatically. |
| 7 Search & filters | Header search matches title, description, and owner. Filter panel: quick filters **Overdue**, **Unassigned**, **Stale in To Do** (threshold 3/7/14/30 days, set in property menu; stale cards also show an age badge like "12d"); plus Due (Today / This week / No date), Priority, Status, Assignee. "Clear all" resets everything. |
| 8 Team visibility | Status, owner, due and priority are on every card without opening it. Status is conveyed by icon + column + text label (never colour alone); blocked cards also get an orange stripe, overdue a red stripe with text. Header summary: "7 active · 2 overdue · 1 blocked · 3 done". Shared state via `useSyncedMap` (per-task last-writer-wins, safe for concurrent edits). |
| 9 Micro-interactions | Toast feedback on create / move / complete / schedule. Completing a task fills the check circle green, strikes through the title and shows "Done! Moving to Completed…" for ~0.65 s before the card moves. Hover styles on every control. No sound (see limitations). |
| 10 Visual design | Each column has its own identity: a coloured top bar, a tinted background (slate / blue / orange / green), a status glyph and a count pill. Cards are white on the tint with initials avatars, arrow-prefixed priority pills (↑ High, → Med, ↓ Low) and an indigo accent. 11–12px type, 6–10px spacing, 1px borders. The board is ~1060px wide with four expanded columns, less when columns are collapsed. |

## Personal boards and the team board (same file)

Every board instance in a FigJam file shares one task store, kept in the file's
document data. Place as many instances as you like:

- **Team board** (default) shows every task in the file. Its **People** tab
  groups active tasks by owner, one column per person, with overdue counts.
- **My board** (header button **Make this my board**, or property menu → *Board scope*) shows only the tasks
  assigned to you, with your photo in the header. Tasks you add there are
  assigned to you automatically. Assigning one of your tasks to someone else
  moves it to their board; assigning a task to you on the team board makes it
  appear on yours.
- All instances write every change straight to the store. Per-task "newest edit
  wins", deletions use tombstones (pruned after 30 days), and the people directory (names + photos) is
  shared too, so a teammate found on one board is known on all of them.
- The store carries a version stamp. A render costs one read of that stamp and
  skips the merge entirely while it matches what the board last merged; only a
  write from another board triggers a full merge. Pushes carry the stamp too, so
  a board that just received a push does not re-merge.
- **Manual sync (default) vs. Live sync.** In manual mode a board merges
  changes from the others the moment you touch it (any click). The **Sync**
  button goes further: it merges this board and then pushes the
  result into every other board on the page, so one click brings the whole
  page up to date. In live mode every write also pushes straight into every other
  board on the page, which re-renders all of them on each click — instant, but
  noticeably heavier with several boards or many tasks. Toggle it for the whole
  file from the **Manual sync / Live sync** pill in the header or the property
  menu. Choose live for a workshop where everyone watches the boards, manual
  for day-to-day use.
- Views, filters, size and collapsed columns stay per instance, so each person
  can keep their own layout.
- Existing single-board data migrates automatically: the first render after
  this update seeds the store from the board's own tasks.

This works within one file only. Boards in different files would need an
external backend, which this prototype deliberately avoids.

## Size, export and other controls

- **Widget size** — property menu → *Size: compact / comfortable / large*. Comfortable (default) is sized to sit well next to FigJam sticky notes; compact is the original dense layout; large is for presenting. Every dimension scales together, so nothing wraps differently.
- **Export / backup** — the **Export** button next to *Filters*, or property menu → *Export CSV / backup*. The dialog offers **Download .csv** (this board's scope, for spreadsheets) and **Download backup .json** (every task in the file plus the people directory, full fidelity).
- **Import backup** — the **Import** button next to Export, or property menu → *Import backup*. Drop or choose a `.json` backup (or paste JSON). Tasks are matched by id: a newer edit in the file wins, unknown ids are added, nothing is deleted, so a restore after an accident or a move to a fresh file is one click. A plain JSON array of `{title, status, assignee, due, priority, labels}` objects also imports.
- **Property menu** is kept short: Sort, Stale threshold, Size, the Live-sync toggle, and actions (export, import, agenda, expand/collapse all, clear filters, archive old, sample tasks). Scope and view are switched in the header. The CSV has one row per task (active, completed and archived) with: id, title, description, status, assignee (owner), co_assignees, due, priority, labels, subtasks done/total, subtask list, created/updated/completed timestamps (ISO 8601), archived. Values are RFC 4180 quoted, UTF-8 with BOM so Excel opens it cleanly.
- **Tooltips** always render below the hovered element; the Widget API only takes a tooltip string and Figma decides the placement. They are kept to one or two words, labelled buttons have none, and the status control has none, so they cover as little as possible.
- **Teammate discovery** happens when someone opens a card, creates a task, uses **Me**, or presses the people icon — not on every click, to keep interactions cheap.

## Performance notes

How a click works in a FigJam widget, per Figma's documentation: the sandbox
cold-starts, evaluates the bundle, renders the whole tree, runs effects, runs
the handler, re-renders and runs effects again — all on the editor's main
thread. Every JSX element becomes a real canvas sublayer. Figma documents
blurs/shadows and complex SVG as the expensive rendering features, and
`documentAccess: "dynamic-page"` as required to avoid loading the whole file.
The widget is built around that:

- **No shadows, no clipping on cards, no SVG anywhere on the board.** Every
  glyph is a frame, ellipse or text — the header actions are text buttons
  (Sync / Export / Import) and the only SVG left in the whole widget is the
  people icon inside an open card's Owner row (1 node, only while a card is
  open). Open/blocked/overdue state is a border colour.
- **Fewest nodes that still look right.** A compact card is ~18 sublayers (was
  ~31): the status control is three glyph buttons that are their own hit
  targets, pills on cards are plain coloured text, clickable text carries its own
  click handler instead of a wrapper frame. Board with 8 tasks: 222 sublayers
  (was 316); with 30 tasks: 616 (was 977); Week view with 30 tasks: 643 (was 1084);
  one card open on an 8-task board: 313.
- **One commit per click.** A handler writes once to the store and bumps one
  version stamp at the end, pushes to other boards at most once (live mode only,
  and only to boards that can see the change), and no longer re-reads
  collaborators on every click. The completion animation timer (two renders +
  a live handler per completion) is gone.
- **Version-gated merge.** A render reads one store key; the full merge only
  runs when another board has written.
- **Bounded trees.** Columns and groups show 10 cards before a "Show N more"
  toggle, so a 100-task board does not render 100 cards on every click.
- **Smaller bundle, lazy document.** Minified bundle (58 KB, was 108 KB) is
  evaluated on every click; `documentAccess: "dynamic-page"` stops the
  first interaction from loading every page of the file.

Node counts come from the Node harness (`smoke/histogram.js`); Figma does not
publish per-node costs, so treat them as a proxy and judge the feel in FigJam.

## Platform notes and limitations (honest list)

- **Drag-and-drop between columns is not possible inside a widget.** A FigJam widget is a single node; cards can't be dragged within it. The one-click status selector is the primary mechanism, which the brief asked for anyway.
- **Views, filters, search and expanded cards are shared state.** Widget state is per widget instance, not per viewer, so when you switch to Week view or apply a filter every collaborator sees it. This is a Widget API constraint. If different people need different views, duplicate the widget (⌘D) — tasks are not shared between copies.
- **No true animation API.** The completion "animation" is a two-step render (check state → moved) using a 650 ms timer; widgets can't tween.
- **Completion sound is not implemented.** Widgets can only play audio from a visible iframe, which would interrupt the workflow; the brief marks sound as optional/off by default, so it was left out.
- **Date picker uses a small iframe** because the widget canvas has no calendar control. Quick dates (Today / Tomorrow / Next Monday) never open it.
- **Profile photos come from `figma.currentUser` and `figma.activeUsers`**, which the Widget API only allows inside event handlers. Every interaction records the people currently in the file into a synced "people" map (name → photo URL), so photos appear for anyone who has touched the board or was in the file while someone did. People typed in by hand who have never been in the file get initials. Photos load from Figma's CDN, hence the `networkAccess.allowedDomains` entries in the manifest (`currentuser` and `activeusers` permissions are declared).
- **Assignees are matched by display name.** Two collaborators with identical Figma display names would share an avatar.
- **Working on a task together.** A task can have several people: type another name in the *Assigned to* field, press **Me**, or click a person chip to add or remove them. The card shows the avatars overlapping (up to three, then "+N"), the task appears on every assigned person's personal board and in each of their People-view columns, the Assignee filter and search match any of them, and the CSV has an `assignee` (owner) and a `co_assignees` column.
- **Tagging other people.** Type any name in the Assigned to field and press Enter; it becomes a chip for every task from then on. Typing a prefix of a known name ("jon") resolves to the full name ("Jon Park"). The Widget API has **no access to the file's member list or your team directory**, so there is no @-mention picker. What it does expose is who is in the file *right now*: the people icon next to **Me** ("Find teammates who are in this file right now") records everyone currently present, with their photo, and they appear as chips immediately. Practical flow: during a session where the team is in the board, press that button once; afterwards everyone can be assigned with one click and keeps their photo. Anyone who was never in the file can still be typed by name and gets initials.
- **Label autocomplete.** The widget Input only reports text when you press Enter (no keystroke events), so there is no dropdown while typing. Instead, a typed prefix resolves to an existing label ("web" → "Website") and all existing labels are shown as one-click pills.
- **Done column** is expanded by default and shows the 5 most recently completed tasks; the Done tab lists all of them with search and archive controls.
- **Agenda stickies are plain FigJam stickies.** Once created they are ordinary canvas objects: move, edit or delete them freely. Creating the agenda again makes a new dated section rather than updating the old one.
- **"Today" is each viewer's local date.** Overdue markers are computed on render with the viewer's clock.
- **Keyboard focus can't be moved programmatically**, so after adding a task the next click lands you back in the input. Still one click + typing per task.
- **The `id` in `manifest.json` is a placeholder.** Figma assigns a real one when you publish; for local development any numeric string works.
- The only network access is Figma's own CDN for profile photos (`networkAccess.allowedDomains` in the manifest); no backend, no Outlook, no COCO sync.

## Data model

```ts
interface Task {
  id: string
  title: string
  description: string
  status: 'todo' | 'inprogress' | 'blocked' | 'done'
  assignee: string          // free text, '' = unassigned
  due: string | null        // 'YYYY-MM-DD'
  priority: 'low' | 'medium' | 'high' | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
  archived: boolean
}
```

Tasks live in `useSyncedMap('tasks')`; UI state (view, filters, collapsed columns,
open card, quick-add draft) in `useSyncedState`.
