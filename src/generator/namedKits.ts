/* ── Named kits: the short, permanent addresses ────────────────────────
   A named kit is a kit we SHIP — its whole definition (master config,
   per-piece design forks, words, icon swaps, clones and its demo boards)
   lives in this repo as one JSON file, and one short hash opens it:

       uikitmaker.com/#/kit/brightside

   Why a named route and not a share link. `#share=` carries the entire
   kit state in the URL (deflate + base64) and `#p=` resolves a cloud row
   — the first is thousands of characters long and changes every time the
   kit is re-shared, the second dies the day a Supabase row is edited or
   the project is unpublished. Neither can go in a Unity Asset Store
   listing, which we cannot casually edit once it is submitted. A named
   route is a CONSTANT: the slug is code, the definition is a committed
   file, and the address keeps working for as long as the site does. No
   sign-in, no cloud round-trip, no paywall — the JSON is part of the
   bundle, so a signed-OUT visitor gets the real kit on first paint.

   Adding a kit: drop `kit-<slug>.json` (a `kitPayload()` snapshot plus
   its `boards`) beside this file, import it, and add an entry below. */

import brightsideKit from "./kit-brightside.json";
import type { BoardDef, BoardItem } from "./store";

/** One demo screen in the showcase strip, in the order a player meets it. */
export type NamedKitScreen = {
  /** the board's own name in the shipped definition */
  board: string;
  /** what the card calls it — a stranger reads this first */
  title: string;
  /** one line saying what the screen is doing */
  caption: string;
};

export type NamedKitDef = {
  slug: string;
  /** the kit's name as the owner made it */
  name: string;
  /** one sentence for the showcase header */
  lede: string;
  /** the engine the demo boards were composed for — shown on the header */
  platform: string;
  /** the kit's Unity Asset Store listing, or null while there isn't one —
   *  see the OWNER banner above each kit's entry */
  storeUrl: string | null;
  screens: NamedKitScreen[];
  payload: Record<string, unknown>;
};

/* ══ OWNER: PASTE THE UNITY ASSET STORE LISTING URL HERE ══════════════
   One line, one place, nothing else to change. Fill it and the kit's
   page turns its store line into a real "View the listing" button; leave
   it null and the page says the listing is coming rather than showing a
   button that goes nowhere. It must be the assetstore.unity.com listing
   itself — the page it sits on may never link to another marketplace. */
const BRIGHTSIDE_STORE_URL: string | null = null;

/* Brightside — the kit heading for the Unity Asset Store. The seven
   screens are the owner's own boards, in the order a player walks them. */
const BRIGHTSIDE: NamedKitDef = {
  slug: "brightside",
  name: "Brightside",
  lede: "Seven real game screens, built entirely from one kit — live on this page, not screenshots.",
  platform: "Composed for mobile portrait · 390 × 844",
  storeUrl: BRIGHTSIDE_STORE_URL, // ← the constant at the top of this file
  /* Captions describe what is ACTUALLY on each board — they were written
     against the rendered screens, piece by piece, and they must be
     re-read whenever the boards are re-captured. A caption that promises
     a timer the screen doesn't carry is the kind of small lie a store
     reviewer catches first. */
  screens: [
    { board: "Returning User Start Screen", title: "Home", caption: "Profile and wallet up top, the chapter card, and the one big way back in." },
    { board: "Level Select", title: "Level Select", caption: "The trail's next five nodes, the season track's free and premium rails, and Play." },
    { board: "Booster Select", title: "Booster Select", caption: "Pre-game loadout: the move budget, three boosters to carry in, then Start." },
    { board: "Gameplay HUD", title: "Gameplay HUD", caption: "In-play chrome — wallet, pause, the round banner, and the booster tray at the thumb line." },
    { board: "Pause", title: "Pause", caption: "The mid-run sheet: two sliders, a toggle, two dropdowns, three ways out." },
    { board: "Shop", title: "Shop", caption: "The storefront — gem packs over price buttons, the daily row, and the nav bar." },
    { board: "Victory", title: "Victory", caption: "The ceremony: stars, the score line, the reward fan, chapter progress, Next Level." },
  ],
  payload: brightsideKit as unknown as Record<string, unknown>,
};

export const NAMED_KITS: Record<string, NamedKitDef> = {
  [BRIGHTSIDE.slug]: BRIGHTSIDE,
};

/** `#/kit/<slug>` → the slug, for any shipped kit. Anything else → null.
 *  A route may carry its own query string, exactly like the other routes. */
export function namedKitSlug(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  const qi = raw.indexOf("?");
  const path = qi === -1 ? raw : raw.slice(0, qi);
  const m = /^\/kit\/([a-z0-9-]{1,40})$/.exec(path);
  return m && NAMED_KITS[m[1]] ? m[1] : null;
}

/** The kit a `#/kit/<slug>` hash names, or null. */
export function namedKitFromHash(hash: string): NamedKitDef | null {
  const slug = namedKitSlug(hash);
  return slug ? NAMED_KITS[slug] : null;
}

/** The shipped boards, in showcase order, paired with their card copy.
 *  A screen whose board is missing from the definition is skipped rather
 *  than rendering an empty frame; a board the screen list doesn't name
 *  rides along at the end, so nothing the owner adds goes invisible. */
export function namedKitScreens(kit: NamedKitDef): { screen: NamedKitScreen; board: BoardDef }[] {
  const raw = Array.isArray(kit.payload.boards) ? (kit.payload.boards as unknown[]) : [];
  const boards = raw.filter((b): b is BoardDef => !!b && typeof b === "object" && Array.isArray((b as BoardDef).items));
  const named = new Set(kit.screens.map((s) => s.board));
  const out: { screen: NamedKitScreen; board: BoardDef }[] = [];
  for (const s of kit.screens) {
    const b = boards.find((x) => x.name === s.board);
    if (b) out.push({ screen: s, board: b });
  }
  for (const b of boards) {
    if (!named.has(b.name)) out.push({ screen: { board: b.name, title: b.name, caption: "" }, board: b });
  }
  return out;
}

/** Every piece the demo boards place, deduped — the "built from N pieces"
 *  line under the showcase counts real placements, never a claimed number. */
export function namedKitPieceCount(kit: NamedKitDef): { placed: number; distinct: number } {
  const raw = Array.isArray(kit.payload.boards) ? (kit.payload.boards as BoardDef[]) : [];
  const ids = new Set<string>();
  let placed = 0;
  for (const b of raw) {
    for (const it of (b.items ?? []) as BoardItem[]) {
      if (!it.kitId) continue;
      placed++;
      ids.add(String(it.kitId));
    }
  }
  return { placed, distinct: ids.size };
}
