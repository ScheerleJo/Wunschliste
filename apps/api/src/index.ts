import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api } from "./app.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";

await runMigrations();

const server = new Hono();
server.route("/", api);

// In Produktion liefert die API auch die gebaute Web-App aus (ein Container).
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  const indexHtml = await readFile(`${webDist}/index.html`, "utf8");
  server.use("/*", serveStatic({ root: webDist }));
  // SPA-Fallback: alle unbekannten Pfade (außer /api) bekommen die index.html
  server.get("*", (c) => (c.req.path.startsWith("/api/") ? c.notFound() : c.html(indexHtml)));
}

serve({ fetch: server.fetch, port: env.port }, (info) => {
  console.log(`Wunschliste-API läuft auf http://localhost:${info.port}`);
});
