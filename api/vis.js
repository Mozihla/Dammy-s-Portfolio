// GET /api/vis            -> the live visibility map (cached at the CDN for 30s)
// GET /api/vis?preview=K  -> the draft map, when K is the preview key (never cached)
// Response: { mode: "live" | "draft", vis: { [projectKey]: "open" | "soon" | "hidden" } | null }
// vis is null until the first publish; the site then keeps the settings built into the page.
const { readAll, cleanMap, safeEqual, previewKey } = require("./_gc");

module.exports = async (req, res) => {
  const pk = (req.query && req.query.preview) || "";
  const draft = pk && safeEqual(pk, previewKey());
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-robots-tag", "noindex");
  res.setHeader("cache-control", draft || pk ? "private, no-store" : "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
  try {
    const all = await readAll();
    const src = draft ? all.vis_draft || all.vis_live : all.vis_live;
    res.status(200).send(JSON.stringify({ mode: draft ? "draft" : "live", vis: src ? cleanMap(src) : null }));
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(200).send(JSON.stringify({ mode: "live", vis: null, error: e.code || "unavailable" }));
  }
};
