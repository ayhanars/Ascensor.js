import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { api } from "./routes.js";
import { store } from "./store.js";

fs.mkdirSync(path.join(config.dataDir, "assets"), { recursive: true });

// Anything left "running" from a previous server process can never finish.
for (const a of store.list()) {
  for (const v of a.versions) {
    if (v.status === "running" || v.status === "queued") {
      store.updateVersion(a.id, v.n, (x) => {
        x.status = "failed";
        x.error = "server restarted while this version was in progress";
      });
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", api);
app.use("/files", express.static(path.join(config.dataDir, "assets"), { fallthrough: true, index: false }));

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(config.webDist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Blender Asset Studio server on http://localhost:${config.port}`);
  console.log(`data dir: ${config.dataDir}`);
  console.log(`blender socket: ${config.blenderHost}:${config.blenderPort}`);
  if (!fs.existsSync(config.webDist)) console.log(`web UI not built; run "npm run dev:web" or "npm run build"`);
});
