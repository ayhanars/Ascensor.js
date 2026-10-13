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
│   ├── theme.ts         ← colours and inline SVG icons
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
| 1 Core layout | Four columns (To Do / In Progress / Blocked / Done), 248px wide, hug-height so there are never empty gaps. Chevron collapses a column to a 36px strip that still shows its count. Counts in every header. Done column is collapsed by default and shows the 4 most recent completions when expanded. |
| Task details (inspector) | Clicking a card title opens a **side inspector** to the right of the board (the card stays compact and highlighted). It holds title, description, status, due date (current value + quick picks), owner (photo/initials avatar, name field, **Me**, one-click avatars of known people), priority, **labels**, and a **subtask checklist** with progress bar. |
| Labels & subtasks | Tasks can carry project labels (free text, colour derived from the name, consistent across the board). Cards show up to three label pills; clicking one filters the board by that label. Subtasks show as a `2/5` progress pill on the card; the inspector lets you add, rename, tick and remove them. Search covers labels and subtask titles. |
| 2 Quick creation | A dashed **"+ Add task"** input at the bottom of every active column: type, press Enter, task appears, input clears for the next one. The **Add task** header button opens a quick-add bar with optional status / due / priority / assignee chips that stay set while you add several tasks in a row. Click a card to expand it and edit title, description, owner, due, priority inline. |
| 3 One-step status | Every card has a 4-icon status selector (○ To Do, ◐ In Progress, ⊘ Blocked, ✓ Done). Clicking re-files the card into the right column instantly; columns re-flow automatically. A toast confirms each move. |
| 4 Scheduling | Due chips: Today / Tomorrow / Next Mon / Pick date… (native calendar in a small iframe) / clear. The card shows "Today", "Tomorrow", "Thu 16", or "Oct 24". Overdue cards get a red left stripe and an "Overdue · <date>" badge with a warning icon. **Week** view groups active tasks by Overdue / Today / Tomorrow / next five days / Later / No due date. Sort by due date (default), priority or newest via the property menu. |
| 5 Assignees & priority | Owner is free text with a **Me** shortcut (uses your Figma name) and one-click avatars of people already on the board or active in the file. Avatars show the person's **Figma profile photo** when known, initials otherwise. Unassigned shows as a dashed "?" ring plus "Unassigned". Priority ↑ High / → Med / ↓ Low pills. Filter by both, plus by label. |
| 6 Completed & history | Marking Done plays a brief check animation, then the card leaves the active board. **Done** view lists completed tasks with owner, due date, completion date, priority; searchable; **Reopen** returns a task to To Do. **Archive** hides outdated tasks (toggle *Show archived* to browse, restore or permanently delete them). Property menu: *Archive done > 14 days*. Nothing is deleted automatically. |
| 7 Search & filters | Header search matches title, description, and owner. Filter panel: quick filters **Overdue**, **Unassigned**, **Stale in To Do** (threshold 3/7/14/30 days, set in property menu; stale cards also show an age badge like "12d"); plus Due (Today / This week / No date), Priority, Status, Assignee. "Clear all" resets everything. |
| 8 Team visibility | Status, owner, due and priority are on every card without opening it. Status is conveyed by icon + column + text label (never colour alone); blocked cards also get an orange stripe, overdue a red stripe with text. Header summary: "7 active · 2 overdue · 1 blocked · 3 done". Shared state via `useSyncedMap` (per-task last-writer-wins, safe for concurrent edits). |
| 9 Micro-interactions | Toast feedback on create / move / complete / schedule. Completing a task fills the check circle green, strikes through the title and shows "Done! Moving to Completed…" for ~0.65 s before the card moves. Hover styles on every control. No sound (see limitations). |
| 10 Visual design | Each column has its own identity: a coloured top bar, a tinted background (slate / blue / orange / green), a status glyph and a count pill. Cards are white on the tint with initials avatars, arrow-prefixed priority pills (↑ High, → Med, ↓ Low) and an indigo accent. 11–12px type, 6–10px spacing, 1px borders. The board is ~1060px wide with four expanded columns, less when columns are collapsed. |

## Performance notes

Figma re-renders the whole widget tree on every interaction, and SVG nodes are
the most expensive part of that tree because each SVG string is parsed on every
render. The widget therefore:

- draws every per-card glyph (status circles, check, avatar, priority, due) with
  native frames, ellipses and text — **zero SVG per card**; the only SVGs are the
  ~9 header/panel icons;
- renders panels (quick add, filters, card details) only while they are open;
- keeps the Done column collapsed by default and shows at most 4 recent rows
  when expanded (the full list lives in the Done view);
- avoids drop shadows on cards (one shadow on the outer frame, one on the active tab).

If a very large board (100+ active cards) still feels slow, collapse columns you
are not working in, or archive completed tasks from the Done view.

## Platform notes and limitations (honest list)

- **Drag-and-drop between columns is not possible inside a widget.** A FigJam widget is a single node; cards can't be dragged within it. The one-click status selector is the primary mechanism, which the brief asked for anyway.
- **Views, filters, search and expanded cards are shared state.** Widget state is per widget instance, not per viewer, so when you switch to Week view or apply a filter every collaborator sees it. This is a Widget API constraint. If different people need different views, duplicate the widget (⌘D) — tasks are not shared between copies.
- **No true animation API.** The completion "animation" is a two-step render (check state → moved) using a 650 ms timer; widgets can't tween.
- **Completion sound is not implemented.** Widgets can only play audio from a visible iframe, which would interrupt the workflow; the brief marks sound as optional/off by default, so it was left out.
- **Date picker uses a small iframe** because the widget canvas has no calendar control. Quick dates (Today / Tomorrow / Next Monday) never open it.
- **Profile photos come from `figma.currentUser` and `figma.activeUsers`**, which the Widget API only allows inside event handlers. Every interaction records the people currently in the file into a synced "people" map (name → photo URL), so photos appear for anyone who has touched the board or was in the file while someone did. People typed in by hand who have never been in the file get initials. Photos load from Figma's CDN, hence the `networkAccess.allowedDomains` entries in the manifest (`currentuser` and `activeusers` permissions are declared).
- **Assignees are matched by display name.** Two collaborators with identical Figma display names would share an avatar.
- **"Today" is each viewer's local date.** Overdue markers are computed on render with the viewer's clock.
- **Keyboard focus can't be moved programmatically**, so after adding a task the next click lands you back in the input. Still one click + typing per task.
- **The `id` in `manifest.json` is a placeholder.** Figma assigns a real one when you publish; for local development any numeric string works.
- No external network access is used (`networkAccess.allowedDomains: ["none"]`); no backend, no Outlook, no COCO sync.

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
