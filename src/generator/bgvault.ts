/* ── The background vault ─────────────────────────────────────────────
   Unity wants the big image; the browser doesn't (owner: "require a user
   upload the big image… render it smaller in-browser so it doesn't kill
   the processor"). The split:

   - The ORIGINAL upload bytes land here, in IndexedDB, untouched — 4K
     PNG stays 4K PNG. IndexedDB because localStorage (and the cloud doc
     that mirrors it) must never carry megabytes of pixels.
   - The BOARD shows the existing ≤1920 JPEG data-URL proxy
     (fileToBgDataUrl) — light enough to drag against, persisted exactly
     as before, and still what the free PNG mockup composites.
   - EXPORT asks the vault for the original by `bgAssetId`; a missing
     original (another device — the vault is per-browser; or a cleared
     asset restored by undo) falls back to the proxy, loudly, never
     silently upscaled.

   No dependency: raw IndexedDB, one object store, three verbs. */

const DB_NAME = "pb-bg-vault";
const STORE = "bg";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((res) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => res(req.result);
    // private windows / storage pressure: the vault is a nice-to-have,
    // never a crash — callers fall back to the proxy
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((res) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => res(req.result as T);
      req.onerror = () => res(null);
    }).finally(() => db.close());
  });
}

/** Normalize an upload into the SHIP COPY (owner research, 2026-08-10:
 *  backdrops aren't presented as reusable assets, so 1920 on the long side
 *  is the ceiling). At or under the ceiling the bytes pass through
 *  untouched — no recompression, ever; over it, one downscale re-encode
 *  (PNG/WebP go to lossless PNG, JPEG stays JPEG at high quality). */
export async function normalizeShipCopy(file: File | Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    if (long <= 1920) { bmp.close(); return file; }
    const s = 1920 / long;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(bmp.width * s));
    cv.height = Math.max(1, Math.round(bmp.height * s));
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    const jpeg = /jpe?g$/.test(file.type);
    const out = await new Promise<Blob | null>((r) => cv.toBlob(r, jpeg ? "image/jpeg" : "image/png", jpeg ? 0.92 : undefined));
    return out ?? file;
  } catch {
    return file; // undecodable? vault what we got rather than nothing
  }
}

/** Store an upload's original bytes; returns the vault id to pin on the board. */
export async function putBgOriginal(file: File | Blob, name?: string): Promise<string | null> {
  const id = "bg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const rec = { blob: file, name: name ?? (file instanceof File ? file.name : "background"), type: file.type, size: file.size, at: Date.now() };
  const ok = await tx("readwrite", (s) => s.put(rec, id));
  return ok === null ? null : id;
}

export async function getBgOriginal(id: string): Promise<{ blob: Blob; name: string; type: string } | null> {
  const rec = await tx<{ blob: Blob; name: string; type: string }>("readonly", (s) => s.get(id) as IDBRequest<{ blob: Blob; name: string; type: string }>);
  return rec?.blob ? rec : null;
}

export async function hasBgOriginal(id: string): Promise<boolean> {
  return (await getBgOriginal(id)) !== null;
}

/** Drop an original (background replaced/cleared, board deleted). */
export async function delBgOriginal(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
