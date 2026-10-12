# Blender Asset Studio

Describe an asset, drop a reference image, and let Claude build it in Blender. Every version
is a Blender Python script the agent wrote, so you can refine one part without losing the rest,
and every top-level Blender object shows up as a clickable part in the web viewer.

```
reference image + description
        │
        ▼
  Claude Code (your subscription login, headless `claude -p`)
        │   writes build.py, runs it in Blender over Blender MCP,
        │   screenshots the viewport, compares to the reference, repeats
        ▼
  Blender (GUI, with the Blender MCP addon connected)
        │
        ▼  deterministic finalize over the addon socket
  model.glb · views/*.png · scene.blend · build.py · parts.json
        │
        ▼
  Web viewer: orbit, click a part to refine it, tweak position/scale/color,
  queue the next version, see cost and time per version
```

## Requirements (all on the machine that runs Blender)

| Piece | Why | Check |
| --- | --- | --- |
| Blender 4.x with the [Blender MCP addon](https://github.com/ahujasid/blender-mcp) | the agent and the finalize step talk to it on port 9876 | sidebar → BlenderMCP → **Connect to MCP server** |
| [uv](https://docs.astral.sh/uv/) | `uvx blender-mcp` runs the MCP server for Claude Code | `uvx --version` |
| [Claude Code](https://docs.claude.com/en/docs/claude-code) logged in | the agent | `claude auth status` shows `loggedIn: true` |
| Node 20+ | server and web UI | `node --version` |

Runs use the login the Claude CLI already has, so a Claude subscription covers them. The server
removes `ANTHROPIC_API_KEY` from the agent's environment on purpose, so a key in your shell never
switches a run to API billing. The cost shown per version is what the API would have charged.

## Run it

```bash
npm install
npm run doctor        # checks the CLI login, uvx, and the Blender socket
npm run dev           # server on :8787 and web UI on :5173 together (or dev:server / dev:web in two tabs)
```

Open http://localhost:5173, press **New**, drop an image, describe the asset, pick an effort,
and generate v1. Keep Blender visible: you can watch the agent build and screenshot in it.

For a single-port build: `npm run build && npm start`, then open http://localhost:8787.

After a `git pull` that changes files under `server/`, restart the server (Ctrl+C in its tab, then
`npm run dev` again) once no generation is running. The server does not restart itself on code
changes on purpose: a restart kills the agent run in progress. Web changes reload on their own.

## How a version works

1. The server creates `data/assets/<id>/v<n>/` with `reference.png` and, for iterations, a copy of
   the parent's `build.py` plus any manual tweaks appended.
2. It spawns `claude -p` in that folder with `mcp.json` (the `blender` MCP server), the conventions
   in `agent/SYSTEM_PROMPT.md`, and only these tools allowed: Read, Write, Edit, Glob, Grep and the
   four Blender MCP tools. Effort sets the number of compare-and-fix passes and the turn limit.
3. When the agent is done, the server itself runs plain `bpy` over the addon socket: lists the
   top-level objects as parts, exports `model.glb`, renders a hero, six turntable views and a top
   view with Workbench, and saves `scene.blend`. Nothing depends on the agent remembering to export.
4. The web UI loads the GLB. Clicking a part scopes the next change request to that object name.
   The inspector applies position, rotation, scale and base-color edits straight into Blender,
   re-exports the GLB and records them in `tweaks.py`, which the next version folds into its script.

Effort levels: **quick** 1 to 2 passes, **standard** 2 to 3, **thorough** 4 to 6, **max** unbounded.
Only one generation runs at a time because Blender holds a single scene; later requests queue.

### Change lists, models, materials, usage

- **Several changes at once.** The iterate panel keeps a list. Click a part in the viewer to scope
  the next change to it, press "+ Add to list", and generate. By default the agent applies the whole
  list in one version; tick "One version per change" to get a chain of versions, each built on the
  previous one, so you can compare and roll back step by step.
- **Model.** Default, Opus, Sonnet or Haiku per run, passed to the CLI as `--model`.
- **Materials.** *Flat* colors; *Procedural* node textures (visible in the rendered views, the GLB
  keeps base colors); *PBR textures* from Poly Haven through the Blender MCP tools, packed into the
  GLB. PBR needs the addon's Poly Haven option switched on in its Blender sidebar panel; if the
  tools are missing the agent falls back to procedural and says so. Non-flat versions render with
  EEVEE and add two close-up detail views.
- **Several reference images.** The first is the main view; the rest are extra angles or close-ups
  of materials and details.
- **Usage, not money.** The top bar shows the 5-hour and 7-day subscription windows as the CLI
  reports them after each run. The API-equivalent cost of a version is only in a tooltip.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | server port |
| `DATA_DIR` | `./data` | where assets and versions are stored |
| `BLENDER_HOST` / `BLENDER_PORT` | `127.0.0.1` / `9876` | Blender MCP addon socket |
| `CLAUDE_BIN` | `claude` | path to the Claude Code CLI |
| `CLAUDE_MODEL` | CLI default | force a model alias such as `opus` or `sonnet` |
| `MCP_CONFIG` | `./mcp.json` | MCP servers passed to the agent |
| `RENDER_SIZE` | `768` | pixel size of the rendered views |

## Layout

```
agent/SYSTEM_PROMPT.md   conventions the agent follows (naming, units, scene reset, build.py rules)
mcp.json                 Blender MCP server definition handed to claude -p
server/src
  claude.ts              spawns claude -p, parses stream-json into a live log
  blender.ts             tiny client for the addon's TCP socket
  finalize.ts            bpy for parts listing, GLB export, turntable renders, tweaks
  jobs.ts                sequential queue, per-version log, finalize step
  routes.ts              REST + SSE API
  prompts.ts             task prompt for fresh builds and iterations
web/src
  components/Viewer.tsx  three.js GLB viewer with part picking and highlight
  components/*           library, new-asset form, iterate panel, inspector, versions, log
```

## API

```
GET    /api/health
GET    /api/assets
POST   /api/assets                       multipart: name, prompt, effort, model, materials, tags, references[]
GET    /api/assets/:id
PATCH  /api/assets/:id                   { name?, tags?, currentVersion? }
DELETE /api/assets/:id
POST   /api/assets/:id/versions          multipart: changes (JSON [{text, part}]) or prompt, effort, model, materials,
                                         parent, fromScratch, chain, references[]
POST   /api/assets/:id/versions/:n/cancel
GET    /api/assets/:id/versions/:n/log
GET    /api/assets/:id/versions/:n/events   server-sent events
POST   /api/assets/:id/versions/:n/load     re-run build.py in Blender
POST   /api/assets/:id/versions/:n/tweak    { object, location?, rotation?, scale?, color?, reload? }
POST   /api/assets/:id/versions/:n/render   re-render views
GET    /files/:id/v:n/<file>                model.glb, views/*.png, scene.blend, build.py, reference.png
```

## Troubleshooting

- **Blender offline** in the top bar: open Blender, enable the addon, press Connect. `npm run doctor` says the same.
- **Blender MCP server status: failed** in the log: `uvx blender-mcp` could not start. Run it once by hand in a terminal.
- **Agent run with no screenshots**: `get_viewport_screenshot` needs a visible 3D viewport in the Blender window.
- **Permission denied / tool not allowed** in the log: the agent asked for a tool outside the allowed list. That is intended; the task should be solvable with Blender code alone.
