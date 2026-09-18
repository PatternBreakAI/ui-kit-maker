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
   its `boards`) beside this file, import it, and add an entry below.

   ART A SHIPPED KIT'S BOARDS PLACE. A board can carry the maker's own
   uploaded logo, and an upload lives in that one browser's vault (or,
   signed in, that one account's bucket) — neither of which a stranger
   on this page has. So a shipped definition carries its own
   `userAssets` registry, and those entries point at art committed under
   `public/kit-art/<slug>/` — the road `/backdrops/…` already rides, a
   path that IS its own display url (assets.isBundledArt). It travels
   with the kit, paints on first visit, signed out, with no vault and no
   cloud round-trip. loadKitPayload sanitizes the registry into the
   session-only `kitAssets` (store.sanitizeKitAssets): a logo item reads
   the visitor's own drawer first and falls through to here, so the
   kit's art never lands in a stranger's My-assets or their
   localStorage.

   The registry's w/h are the FOOTPRINT the composition was authored
   against, not the shipped file's pixels — the big glyphs' tiered-raster
   contract. Skybound's wordmark was authored at 1444 × 954 and ships as
   a 722 × 477 WebP, which is the largest raster its three placements can
   ever ask for; the boards do not move. */

import brightsideKit from "./kit-brightside.json";
import standOnBusinessKit from "./kit-stand-on-business.json";
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
  /** A kit still in the staging bay (round 80): admin-only on every
   *  surface a shipped kit shows on (the Looks rack, the showcase's
   *  other-kits strip and its #/kit/<slug> route), exactly like a staged
   *  component. Absent or false = shipped to everyone. */
  staged?: boolean;
};

/** True when a shipped kit may be SHOWN to this visitor: released kits
 *  for everyone, staged kits only for the admin (the kitVisible rule,
 *  spoken for whole kits). */
export const namedKitVisible = (kit: NamedKitDef, admin: boolean): boolean => !kit.staged || admin;

/* ══ OWNER: PASTE THE UNITY ASSET STORE LISTING URL HERE ══════════════
   One line, one place, nothing else to change. Fill it and the kit's
   page turns its store line into a real "View the listing" button; leave
   it null and the page says the listing is coming rather than showing a
   button that goes nowhere. It must be the assetstore.unity.com listing
   itself — the page it sits on may never link to another marketplace. */
const BRIGHTSIDE_STORE_URL: string | null = null;

/* Brightside — the kit heading for the Unity Asset Store. The screens
   are the owner's own boards: seven game screens in the order a player
   walks them, then the bar-and-loader sampler the owner keeps beside
   them. Eight boards ship, eight cards render, and the copy says so. */
const BRIGHTSIDE: NamedKitDef = {
  slug: "brightside",
  name: "Brightside",
  lede: "Seven real game screens and a bar sampler, all built from one kit. Live on this page, not screenshots.",
  platform: "Composed for mobile portrait · 390 × 844",
  storeUrl: BRIGHTSIDE_STORE_URL, // ← the constant at the top of this file
  /* Captions describe what is ACTUALLY on each board — they were written
     against the rendered screens, piece by piece, and they must be
     re-read whenever the boards are re-captured. A caption that promises
     a timer the screen doesn't carry is the kind of small lie a store
     reviewer catches first. NO EM DASHES in anything a visitor reads
     (owner, round 65): a full stop and a second sentence, or a colon
     when a list follows. */
  screens: [
    { board: "Returning User Start Screen", title: "Home", caption: "Avatar, gems and coins across the top. The Crystal Pass ribbon over its level shield, then Continue with Level Select under it." },
    { board: "Level Select", title: "Level Select", caption: "A progress ring and five level buttons, 10 through 14. The season track shows its free and premium rails, with Play Now underneath." },
    { board: "Booster Select", title: "Booster Select", caption: "The pre-game loadout: a 24-move budget, three booster cards to carry in, the active booster on its own panel, then Start." },
    { board: "Gameplay HUD", title: "Gameplay HUD", caption: "In-play chrome: the gem count and a pause button up top, the GO! banner, and three boosters with count badges at the thumb line." },
    { board: "Pause", title: "Pause", caption: "The mid-run sheet: Music and SFX sliders, a haptics toggle, language and graphics dropdowns, then Resume, Restart and Quit." },
    { board: "Shop", title: "Shop", caption: "The storefront: three gem packs over their price buttons, the daily deals row with Claim All, and the bottom nav." },
    { board: "Victory", title: "Victory", caption: "The ceremony: three stars over the banner, both score lines, the reward counters and cards, chapter progress, then Next Level." },
    { board: "Progress & Loaders", title: "Progress & Loaders", caption: "Not a game screen. It is the kit's bars in one place: versus bar, segmented bar, loading bar, party frame, progress bar, ring and XP bar." },
  ],
  payload: brightsideKit as unknown as Record<string, unknown>,
};

/* Stand on Business (round 80) — the chrome for a card battler, designed
   on request from the game's own coordinating session: one look (gilded
   navy, Cinzel display, Crimson Pro reading voice) and eleven boards, one
   per screen, on the 1920 × 1080 stage. STAGED: the owner tweaks and
   blesses it board by board before anyone else sees it; the game's
   importer reads the export, never these boards directly. Captions
   describe what is on each board as rendered. NO EM DASHES in anything a
   visitor reads. */
const STAND_ON_BUSINESS: NamedKitDef = {
  slug: "stand-on-business",
  name: "Stand on Business",
  lede: "Eleven screens of chrome for a card battler, from one gilded-navy kit. Every window the game draws into is a named placeholder.",
  platform: "Composed for landscape · 1920 × 1080",
  storeUrl: null,
  staged: true,
  screens: [
    { board: "landing", title: "Landing", caption: "The first screen: a wordmark slot, four big buttons with icon tiles, the deck picker, the wallet, the speaker button with its menu open, five card holes and the teaser hole." },
    { board: "match", title: "Match", caption: "The main board: both profile plates, the Stand button with the Legacy coin and the plan timer, three Locations (one hidden, one won), the hand hole, Sit Down, Lock In, the toast and the replay banner." },
    { board: "sheets", title: "Sheets", caption: "Every bottom sheet once: the bare sheet, the two confirms, the Threat, the Location, the profile, the turn log and the chat." },
    { board: "result", title: "Result", caption: "The verdict banner with its Legacy line, three Location results with their winner chips, the ledger rows and the three buttons." },
    { board: "compendium", title: "Compendium", caption: "The Cards screen: filter tabs, a row of card holes, two Location plates, the Legacy plate, the rank ladder, the promote button and the References sheet." },
    { board: "rules", title: "Rules", caption: "A long read: a title, three headed plates of the game's own sentences, a scrollbar and a Back tab." },
    { board: "settings", title: "Settings", caption: "The full settings sheet: three switches, two volume rows, text size and colour-blind tints, and Done." },
    { board: "tutorial", title: "Tutorial", caption: "The guide's chrome over a faint board: the coach plate with Next, two spotlight rings and the lesson plate with its picture window." },
    { board: "deck-builder", title: "Deck builder", caption: "Era and archetype tabs, ten card holes, the 24-slot tray with filled and invalid slots, the validity line in both poses, Save deck, Reset and three steppers." },
    { board: "store", title: "Store", caption: "The finishes store: the wallet, four catalogue tiles across their four states, the empty state and the Buy confirm with its cost line." },
    { board: "history", title: "History", caption: "The profile plate with its portrait window, five match rows with won, lost and draw chips, and the empty state." },
  ],
  payload: standOnBusinessKit as unknown as Record<string, unknown>,
};

export const NAMED_KITS: Record<string, NamedKitDef> = {
  [BRIGHTSIDE.slug]: BRIGHTSIDE,
  [STAND_ON_BUSINESS.slug]: STAND_ON_BUSINESS,
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
