import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

/* Generates community seed kits with the app's OWN code: each payload is
   exactly what Save kit would store, built by the store's setPreset. */

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// board art from disk — the dev server answers image URLs with module
// wrappers, so the page gets the bytes as data URLs instead
import { readFileSync } from "node:fs";
const RAW_BOARDS = ["valley", "strategy", "tavern", "fps"].map((n) =>
  "data:image/jpeg;base64," + readFileSync(`src/marketing/assets/boards/${n}.jpg`).toString("base64"));

const kits = await page.evaluate(async (RAW_BOARDS) => {
  const storeMod = await import("/src/generator/store.ts");
  const modelMod = await import("/src/generator/model.ts");
  const bevelMod = await import("/src/generator/bevel.ts");
  const engMod = await import("/src/marketing/engine.ts");
  const { useGen, getDefault } = storeMod;
  const { PRESETS, applyKitDesign, applyKitTextFill } = modelMod;
  const { renderKit } = bevelMod;
  const { tightenSvg } = engMod;

  const authored = Object.keys(storeMod.PRESET_DEFAULTS ?? {});
  const starterIds = PRESETS.map((p) => p.id).filter((id) => !authored.includes(id));
  const pick = [...authored, ...starterIds].slice(0, 10);

  const LABELS = ["PLAY", "START", "GO!", "READY", "FIGHT", "RACE", "QUEST", "SPIN", "BOOST", "LAUNCH"];

  /* real board artwork from the repo, as travel-sized data URLs — the
     same downscale treatment the app's own background upload applies */
  const boardUrls = RAW_BOARDS;
  const toDataUrl = async (url) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img load failed: " + url)); i.src = url;
    });
    const s = Math.min(1, 1600 / img.width, 1600 / img.height);
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.width * s));
    cv.height = Math.max(1, Math.round(img.height * s));
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.8);
  };
  const stages = [];
  for (const u of boardUrls) stages.push(await toDataUrl(u));

  const out = [];
  for (let i = 0; i < pick.length; i++) {
    const id = pick[i];
    const st = useGen.getState();
    st.replaceConfig(getDefault());
    useGen.getState().setPreset(id);
    useGen.getState().update((c) => { c.content.label = LABELS[i % LABELS.length]; });
    const pname = PRESETS.find((p) => p.id === id)?.name?.split(" — ")[0]
      ?? id.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    useGen.getState().setKitName(pname);
    const payload = useGen.getState().kitPayload();
    // every 2nd-ish kit gets a real-artwork stage (owner: the wall should
    // show boards with real art, not only bare renders)
    if (i % 3 === 1 && stages.length) payload.bgImage = stages[Math.floor(i / 3) % stages.length];

    // prove the payload renders exactly as a community card will draw it
    const cfg = payload.cfg;
    const piece = (cid, size, v) =>
      tightenSvg(renderKit(applyKitTextFill(applyKitDesign(cfg, undefined), undefined), cid, size, "default", v, undefined, {}), 18);
    const hero = piece("primary", "l");
    const minis = [piece("progress", "s", 0.62), piece("toggle", "s", 1), piece("badge", "s")];
    out.push({ id, name: pname, payload, hero, minis });
  }
  // contact sheet in-page for the screenshot
  document.body.innerHTML = "";
  document.body.style.cssText = "background:#0b0b16;display:grid;grid-template-columns:repeat(5,1fr);gap:14px;padding:16px;";
  for (const k of out) {
    const d = document.createElement("div");
    d.style.cssText = "border:1px solid #333;border-radius:10px;padding:10px;color:#cbd5e1;font:12px sans-serif;text-align:center;";
    d.innerHTML = `<div style="max-width:100%">${k.hero}</div><div style="display:flex;gap:6px;justify-content:center">${k.minis.map((m) => `<span style="max-width:60px;display:inline-block">${m}</span>`).join("")}</div><b>${k.name}</b>`;
    for (const svg of d.querySelectorAll("svg")) { svg.style.maxWidth = "100%"; svg.style.height = "auto"; }
    document.body.append(d);
  }
  return out.map(({ id, name, payload }) => ({ id, name, payload }));
}, RAW_BOARDS);

await page.waitForTimeout(900);
await page.screenshot({ path: "seed-sheet.png", fullPage: true });
await browser.close();

/* slugs: same alphabet the app uses (no 0/o/1/l), fixed per kit so the
   SQL is idempotent via on conflict (share_slug) do nothing */
const alpha = "abcdefghijkmnpqrstuvwxyz23456789";
const slug = () => Array.from({ length: 9 }, () => alpha[Math.floor(Math.random() * 32)]).join("");
const used = new Set();
const mkSlug = () => { let s; do { s = slug(); } while (used.has(s)); used.add(s); return s; };

const rows = kits.map((k) => ({ ...k, slug: mkSlug() }));

const values = rows.map((k) =>
  `    (uid, '${k.name.replace(/'/g, "''")}', $seedkit$${JSON.stringify(k.payload)}$seedkit$::jsonb, true, '${k.slug}', true)`
).join(",\n");

const sql = `-- ═══════════════════════════════════════════════════════════════════
-- Community seed — official starter kits for the house account
--
-- WHAT THIS IS. ${rows.length} kits generated by the app's own engine (each doc is
-- exactly what "Save kit" stores — the starter presets as finished kits),
-- inserted as PUBLIC and LISTED, i.e. straight onto the Community Gallery,
-- attributed to YOUR house account. No users are created, no likes are
-- faked — hearts start at zero and stay honest.
--
-- HOW TO USE (once):
--   1. Create the house account on the site (a normal sign-up).
--   2. Open its Studio (#/studio) and set the public face: handle
--      (e.g. patternbreak), display name, avatar. That's the byline
--      every card will carry.
--   3. Replace the email on the line marked >>> below.
--   4. Paste this whole file into the Supabase SQL editor and Run.
--
-- Re-running is safe: fixed share slugs + on conflict do nothing.
-- To unlist one later: the Unlist button on #/community (as admin).
-- ═══════════════════════════════════════════════════════════════════

do $$
declare uid uuid;
begin
  -- >>> the house account's email:
  select id into uid from auth.users where email = 'HOUSE_ACCOUNT_EMAIL_HERE';
  if uid is null then
    raise exception 'No account with that email — sign it up on the site first, then edit the email above.';
  end if;

  insert into public.projects (user_id, name, doc, is_public, share_slug, listed)
  values
${values}
  on conflict (share_slug) do nothing;
end $$;

-- verify: expect ${rows.length} rows for the house account
-- select name, share_slug, listed from public.projects
--   where user_id = (select id from auth.users where email = 'HOUSE_ACCOUNT_EMAIL_HERE');
`;

writeFileSync("supabase/seed-community.sql", sql);
console.log("kits:", rows.map((r) => `${r.name} (${r.slug})`).join(" | "));
console.log("wrote supabase/seed-community.sql,", sql.length, "bytes");
