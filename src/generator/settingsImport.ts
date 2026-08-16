/* The ONE settings-import door — the TopBar's Export-menu "Import
   settings…" and the projects home's "Import kit" button both feed the
   picked .json through here, so migration, healing and persistence apply
   identically wherever the file arrives. Full-document files carry the
   workspace (piece forks, shapes, icon swaps, nudges, boards) under
   __workspace and route through loadKitPayload — the same door a project
   open uses; bare settings files replace the config only. */

import { useGen, hydrate } from "./store";

/** Read a settings .json into the desk. Resolves true when the file
    loaded, false when it isn't a settings file (the caller decides how
    loudly to say so — the TopBar menu stays quiet, the home shows a
    note). Never throws. */
export function importSettingsFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(false);
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.presetId || !parsed.candy) { resolve(false); return; }
        const ws = parsed.__workspace as Record<string, unknown> | undefined;
        delete parsed.__workspace;
        if (ws && typeof ws === "object") {
          // boards ride the payload — loadKitPayload runs importBoards
          // itself now; a second call here raced it and double-vaulted
          // every backdrop (review catch)
          useGen.getState().loadKitPayload({ cfg: hydrate(parsed), ...ws }, { viewer: false, phase: "master" });
        } else {
          useGen.getState().replaceConfig(hydrate(parsed));
        }
        resolve(true);
      } catch { resolve(false); } // not a settings file
    };
    reader.readAsText(file);
  });
}
