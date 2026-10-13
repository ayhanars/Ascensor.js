# Blender Asset Studio: project rules

- **No paid third-party services.** The owner's Claude subscription is the only cost. Do not
  propose or integrate services that bill per use (Meshy, Tripo, cloud render farms, paid APIs).
  When a capability needs a model or engine, use free, local, open-weight tools that run on the
  owner's Mac (Apple M4, 16 GB) or tools the owner already has installed (Blender, Blender MCP
  addon, Claude Code CLI). Keep API-key based integrations optional and off by default.
- **Minimize token use.** Prefer doing work on the server over the Blender socket (no agent)
  when it does not need judgment, for example scene sampling, exports, renders, resets.
- **build.py is the single source of truth** for an asset version; imports (base meshes, kit
  textures) are recorded in it so every version can be rebuilt.
- After a `git pull` that changes `server/`, the owner restarts the server tab by hand; the dev
  server does not auto-restart on purpose.
