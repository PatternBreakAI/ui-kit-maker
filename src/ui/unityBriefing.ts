/* ── The Unity briefing ────────────────────────────────────────────
   Loading-screen prep, owner mandate 2026-08-12: while the engine zip
   builds, a takeover modal "plays" cards that are REAL ANALYSIS of the
   file being exported — what translates 1:1, where the compromises are
   (backgrounds are placeholders, board text bakes, gloss vs nine-slice)
   — plus did-you-know material, like game loading-screen tips. Every
   card below is computed from THIS kit's actual state and only claims
   what the exporter actually does. */
import type { GenConfig, KitComponentId, KitDesign } from "@/generator/model";
import type { BoardDef, LibItem } from "@/generator/store";

export interface BriefCard {
  kicker: "HEADS-UP" | "DID YOU KNOW" | "YOUR SCENES";
  title: string;
  body: string;
}

interface BriefState {
  cfg: GenConfig;
  kitDesigns: Partial<Record<KitComponentId, KitDesign>>;
  boards?: BoardDef[];
  library?: LibItem[];
}

export function buildUnityBriefing(st: BriefState, scope: "free" | "full"): BriefCard[] {
  const cards: BriefCard[] = [];

  if (scope === "free") {
    cards.push(
      { kicker: "HEADS-UP", title: "This is the starter kit", body: "Three wired pieces — button, chip, progress — land in Assets/. The full kit extracts into this exact folder when you upgrade, and everything restyles in place." },
      { kicker: "DID YOU KNOW", title: "Labels are live text", body: "Component labels arrive as live text in your kit's display face — retype them right in Unity, no re-export needed." },
      { kicker: "DID YOU KNOW", title: "Re-downloads restyle in place", body: "Change the design on uikitmaker.com, download again, extract over the same folder — sprites and prefabs re-dress where they stand." },
    );
    return cards;
  }

  const boards = (st.boards ?? []).filter((b) => b.items.length || b.bgImage || b.bgVideo);
  const libIds = new Set((st.library ?? []).map((l) => l.id));
  const stamps = boards.reduce((n, b) => n + b.items.filter((it) => it.stamp).length, 0);
  const libUsed = boards.some((b) => b.items.some((it) => !it.kitId && !it.stamp && libIds.has(it.libId)));
  const backdrops = boards.filter((b) => b.bgImage || b.bgVideo).length;
  /* gloss check covers the master face AND per-piece design overrides —
     "off everywhere" genuinely skips the nine-slice card */
  const glossOn = st.cfg.candy.gloss.on
    || Object.values(st.kitDesigns).some((d) => (d as { candy?: { gloss?: { on?: boolean } } })?.candy?.gloss?.on);

  if (boards.length) {
    const named = boards.slice(0, 1).map((b) => b.name)[0];
    cards.push({
      kicker: "YOUR SCENES",
      title: boards.length === 1 ? `“${named}” becomes a Unity scene` : `Your ${boards.length} boards become ${boards.length} Unity scenes`,
      body: "Scenes are named after your boards and build themselves on import. After first generation a scene is YOURS — the importer never edits it again, so a renamed board arrives as a new scene beside your work.",
    });
  }
  if (backdrops) {
    cards.push({
      kicker: "HEADS-UP",
      title: backdrops === 1 ? "Your backdrop is a placeholder" : "Your backdrops are placeholders",
      body: "Scene backgrounds arrive exactly as graded on the board — wash, vignette, grain and framing baked into one image — but they're mock-up scenery to design against, not shipping game art. Swap in your own before release.",
    });
  }
  if (stamps) {
    cards.push({
      kicker: "HEADS-UP",
      title: stamps === 1 ? "Your board text is baked art" : `Your ${stamps} board texts are baked art`,
      body: "Splash and Plain stamps land as crisp pre-rendered sprites — the pixels you approved. To change the words, retype in the app and extract over the same folder. Component labels are different: those stay live text.",
    });
  }
  if (glossOn) {
    cards.push({
      kicker: "HEADS-UP",
      title: "Gloss vs. nine-slice stretching",
      body: "Stretching a sprite would smear its baked gloss sweep, so stretchable pieces ship extra layers: an under/over split that keeps the gloss ONE clean sweep at any width, and a flat tintable variant with no sheen at all.",
    });
  }
  cards.push({
    kicker: "DID YOU KNOW",
    title: "Labels are live text in your face",
    body: "Every component label is real engine text wearing your kit's display face — retype anything right in Unity. Hover and press dress is pre-wired on the example prefabs.",
  });
  if (libUsed) {
    cards.push({
      kicker: "HEADS-UP",
      title: "Saved gallery pieces ride as sprites",
      body: "Assets placed from your library arrive as baked sprites at their design size — they keep the look they had on the board, but they don't restyle with the kit on re-import.",
    });
  }
  cards.push(
    {
      kicker: "DID YOU KNOW",
      title: "Re-downloads restyle in place",
      body: "Redesign on uikitmaker.com, download again, extract over the same folder. Sprites and example prefabs re-dress where they stand — your own prefabs and your scenes are never touched.",
    },
    {
      kicker: "DID YOU KNOW",
      title: "There's a Playground scene inside",
      body: "The kit ships a press-Play Playground — every wired piece responding to hover and click on one screen. It's the fastest way to feel the kit before you build with it.",
    },
  );
  return cards;
}
