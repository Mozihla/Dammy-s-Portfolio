// Shared helpers for the Site Controls pipeline (Vercel Global Config).
// Files starting with "_" inside /api are not deployed as endpoints.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   GLOBAL_CONFIG     added automatically when the Global Config store is connected to this project
//                     (older stores use EDGE_CONFIG; both are read)
//   VERCEL_API_TOKEN  a Vercel access token, used only to write draft/live
//   ADMIN_PASSWORD    the password for /admin
//   VERCEL_TEAM_ID    optional; found automatically if missing
const crypto = require("crypto");

const STATUSES = new Set(["open", "soon", "hidden"]);

function conn() {
  const raw = process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const id = u.pathname.replace(/^\/+|\/+$/g, "");
    const token = u.searchParams.get("token");
    if (!id || !token) return null;
    return { origin: u.origin, id, token };
  } catch (e) {
    return null;
  }
}

// One read: all items in the store ({vis_draft, vis_live, draft_at, live_at})
async function readAll() {
  const c = conn();
  if (!c) throw Object.assign(new Error("Global Config is not connected to this project"), { code: "no_store" });
  const r = await fetch(`${c.origin}/${c.id}/items?token=${encodeURIComponent(c.token)}`, { headers: { accept: "application/json" } });
  if (r.status === 404) return {};
  if (!r.ok) throw Object.assign(new Error(`Global Config read failed (${r.status})`), { code: "read_failed" });
  return r.json();
}

let teamCache;
async function teamIds(apiToken) {
  if (process.env.VERCEL_TEAM_ID) return [process.env.VERCEL_TEAM_ID];
  if (teamCache) return teamCache;
  const out = [null];
  try {
    const r = await fetch("https://api.vercel.com/v2/teams?limit=20", { headers: { authorization: `Bearer ${apiToken}` } });
    if (r.ok) (await r.json()).teams.forEach((t) => out.push(t.id));
  } catch (e) {}
  return (teamCache = out);
}

// One write: upsert several items in a single PATCH (counts as 1 write)
async function writeItems(items) {
  const c = conn();
  const apiToken = process.env.VERCEL_API_TOKEN;
  if (!c) throw Object.assign(new Error("Global Config is not connected to this project"), { code: "no_store" });
  if (!apiToken) throw Object.assign(new Error("VERCEL_API_TOKEN is not set"), { code: "no_token" });
  const body = JSON.stringify({ items: Object.entries(items).map(([key, value]) => ({ operation: "upsert", key, value })) });
  let last = 0;
  for (const team of await teamIds(apiToken)) {
    const q = team ? `?teamId=${encodeURIComponent(team)}` : "";
    const r = await fetch(`https://api.vercel.com/v1/global-config/${c.id}/items${q}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body,
    });
    if (r.ok) { if (team) teamCache = [team]; return true; }
    last = r.status;
    if (r.status !== 403 && r.status !== 404) break;
  }
  throw Object.assign(new Error(`Global Config write failed (${last})`), { code: "write_failed", status: last });
}

function cleanMap(v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, s] of Object.entries(v)) {
    if (typeof k === "string" && k.length <= 200 && STATUSES.has(s)) out[k] = s;
  }
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// Preview key is derived from the admin password, so there is one secret to manage
function previewKey() {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) return null;
  return crypto.createHmac("sha256", p).update("portfolio-preview-v1").digest("base64url").slice(0, 24);
}

module.exports = { readAll, writeItems, cleanMap, safeEqual, previewKey };
