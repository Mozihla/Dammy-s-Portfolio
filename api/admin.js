// POST /api/admin   header: x-admin-password
//   { action: "get" }                 -> { draft, live, draftAt, liveAt, previewKey }
//   { action: "save", draft: {...} }  -> saves the draft (1 Global Config write)
//   { action: "publish" }             -> copies the saved draft to live (1 write)
const { readAll, writeItems, cleanMap, safeEqual, previewKey } = require("./_gc");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
  const send = (code, obj) => res.status(code).send(JSON.stringify(obj));

  if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
  if (!process.env.ADMIN_PASSWORD) return send(503, { error: "no_password", message: "ADMIN_PASSWORD is not set in Vercel." });
  if (!safeEqual(req.headers["x-admin-password"], process.env.ADMIN_PASSWORD)) {
    await wait(900); // slows down guessing
    return send(401, { error: "wrong_password" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  try {
    if (body.action === "get") {
      const all = await readAll();
      return send(200, {
        draft: all.vis_draft ? cleanMap(all.vis_draft) : null,
        live: all.vis_live ? cleanMap(all.vis_live) : null,
        draftAt: all.draft_at || null,
        liveAt: all.live_at || null,
        previewKey: previewKey(),
      });
    }
    if (body.action === "save") {
      const draft = cleanMap(body.draft);
      if (!Object.keys(draft).length) return send(400, { error: "empty_draft" });
      const at = new Date().toISOString();
      await writeItems({ vis_draft: draft, draft_at: at });
      return send(200, { ok: true, draftAt: at });
    }
    if (body.action === "publish") {
      const all = await readAll();
      if (!all.vis_draft) return send(400, { error: "no_draft", message: "Save a draft before publishing." });
      const at = new Date().toISOString();
      await writeItems({ vis_live: cleanMap(all.vis_draft), live_at: at });
      return send(200, { ok: true, liveAt: at });
    }
    return send(400, { error: "unknown_action" });
  } catch (e) {
    return send(502, { error: e.code || "failed", message: e.message });
  }
};
