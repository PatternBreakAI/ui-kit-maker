# Building the Asset Store submission as a .unitypackage

Written 2026-10-01. Companion to `jimi-unity-round-2026-09.md` (the 9/30
section introduced the Asset Store build) and to
`UNITY-SUBMISSION-GUIDELINES.md` (the owner's capture of the store rules).

## Why the zip is not the submission

The kit page's admin-only download, **"Unity kit, Asset Store build
(ZIP)"**, is the right content for the store but the wrong container.
The store's rule 2.2.b allows a .zip only for files that do not work
natively in the Editor, and everything in our zip does. Rule 2.2.a also
forbids archives that hide the bulk of the content from the reviewer.

The zip has a second problem for a reviewer: it ships no prefabs and no
Playground. Those are built inside the project on first import, because
a prefab can only point at a sprite through the GUID the project assigns
the PNG when it lands (the README says this under "Why aren't the
prefabs just in the zip?"). A reviewer unzipping into a fresh project
would watch a build run in the Console before seeing anything.

A `.unitypackage` solves both. It is the store's native container, and
it carries every asset's `.meta` file, so the GUIDs travel with it. That
means a project that has already imported the zip can export the
finished result, prefabs, Playground scene, font assets and the import
receipt included, and the reviewer gets a kit that is already built. On
their side the importer finds a receipt that matches the manifest and
has nothing to do.

## What is in the finished kit

After the zip has imported into a project, the kit occupies one root
folder, `Assets/UIKitMaker/`, with two kinds of children:

- **`Assets/UIKitMaker/<slug>/`**, the kit itself (slug is the kit's
  name in file form, for example `brightside`). From the zip: the sprite
  folders, `fonts/` (the TTFs), `kit-manifest.json`, `settings.json`,
  `UNITY-README.md`, `Documentation/` (QuickStart and the README
  figures), `LICENCE.txt` and `Third-Party Notices.txt`. Generated on
  import: `Prefabs/` (shelved by chapter), `Playground.unity`,
  `fonts/KitFace SDF.asset` and its siblings (the TextMeshPro faces and
  materials), and `kit.lock.json`, the import receipt.
- **`Assets/UIKitMaker/Editor/`** and **`Assets/UIKitMaker/Runtime/`**,
  the shared scripts and their two assembly definitions.

The importer also imports Unity's own **TMP Essential Resources** into
`Assets/TextMesh Pro/` the first time, if the project lacks them. That
folder is Unity's, not ours, and it stays out of the package.

## The recipe

Do this in a fresh Unity project made for the purpose. A project that
has had other kits, boards or test art in it will leak them into the
export.

### 1. Make the host project

1. Create a new project from the **Universal 2D** (or **2D**) template in
   the Unity version the listing will be submitted from. See
   "Which Unity" below.
2. Before anything else, open **Window > TextMeshPro > Import TMP
   Essential Resources** and import them. Doing it now keeps the kit
   import's Console clean of the one-time "importing TextMeshPro
   Essential Resources" line.
3. Save the project once.

### 2. Import the Asset Store build

1. On uikitmaker.com, on the kit's page, download **"Unity kit, Asset
   Store build (ZIP)"** (admin-only). The file name ends in
   `-asset-store.zip`.
2. Unzip it and drag the whole **UIKitMaker** folder into the project's
   **Assets/** folder. Wait for the import to finish. Do not enter Play
   mode while it runs.
3. Read the Console. Expected: one receipt line, "UI Kit Maker — '<kit>'
   imported: N sprites (N new …) … Wired prefabs are ready in
   Assets/UIKitMaker/<slug>/Prefabs … [export build <sha>]". The build
   stamp should match the deploy you expect. There should be no yellow
   or red lines. If there are, stop: the submission should not carry a
   kit that warns on import, and the warning is a bug for the app lane.
4. Run **Tools > PatternBreak > Kit Status**. It should name the kit,
   say "(Asset Store build: components only, no board scenes, no
   uploaded pictures)", and say "imported". The Tools > PatternBreak menu
   should hold exactly four entries (Kit Status, Reapply Kit Import
   Settings, Regenerate Example Prefabs, Rebuild Kit Playground Scene).
   A fifth, Rebuild Kit Board Scenes, means a zip with boards was
   imported by mistake.

### 3. Check the built kit before packing it

This is the reviewer's first impression, so look at it the way they
will.

- Open `Assets/UIKitMaker/<slug>/Playground.unity`, press Play. It opens
  at the top, every piece is captioned, nothing overlaps, hover and
  press work (click the Game view once first; the editor's input gate is
  explained in the QuickStart). Stop Play.
- Confirm the folders: `Prefabs/` with one folder per chapter plus
  Glyphs and Labels, **no** `Prefabs/Art` and **no** `Scenes/`. Those
  two mean the maker's pictures or boards got in.
- Confirm `kit.lock.json` exists beside `kit-manifest.json`. That is the
  receipt that tells the reviewer's importer the kit is already built.
- Save the scene if Unity marked it dirty, then save the project
  (**File > Save Project**). Everything the package carries comes from
  disk.

### 4. Export the .unitypackage

Either road produces the same file. The uploader's own road is the one
to use for the submission; the manual export is for checking the result
in another project first.

**With Unity's own exporter (for a dry run):**

1. In the Project window select the **UIKitMaker** folder under Assets.
2. **Assets > Export Package…**. In the dialog, every item under
   `Assets/UIKitMaker` should be ticked and nothing else.
3. Turn **Include dependencies** off. With it on, Unity pulls in
   `Assets/TextMesh Pro/` because the font assets reference its shaders,
   and that folder must not ship (it is Unity's, and rule 2.1.c forbids
   redundant files). If the list still shows anything under
   `Assets/TextMesh Pro`, untick it.
4. Export. Name the file after the kit and the kit version shown by Kit
   Status, for example `UIKitMaker-Brightside-v12.unitypackage`.

**With the Asset Store Tools (the submission):**

1. Install the publishing tools into the same project: on the Asset
   Store, add **Asset Store Publishing Tools** to your assets, then
   **Window > Package Manager > My Assets**, Download and Import. The
   tools land in a folder named `AssetStoreTools`; the store strips that
   folder from uploads itself (rule 2.1.d), so it never ships.
2. Open **Asset Store Tools > Asset Store Uploader** and sign in with
   the publisher account. Pick the package draft created on the
   Publisher Portal.
3. Upload type **From Assets Folder**, and choose `Assets/UIKitMaker` as
   the folder. Leave **Include Dependencies** off for the same reason as
   above. The uploader packs the folder into a `.unitypackage` on the
   way up, so this is the same file the manual export makes.
4. Run **Asset Store Tools > Asset Store Validator** on that folder
   before pressing Upload and clear anything it flags. It checks the
   same rules the reviewer will (path length, file types, missing
   documentation, scripts outside a namespace).
5. Upload, then finish the listing on the Publisher Portal and submit.

If the uploader's labels differ from the names above, the tools have
changed since this was written; the shape of the task is the same.
Pick the folder-based upload, exclude dependencies, validate, upload.

### 5. Prove it in a second project

Before submitting, import the exported `.unitypackage` into another
fresh project (same template, TMP Essential Resources imported first)
and read the Console. Expected:

- The scripts compile with no warnings.
- The kit's one Console line reads "updated: N sprites (0 new, 0
  restyled, N unchanged; settings: 0 applied, N already right)". That
  is the importer confirming the receipt matches and leaving the kit
  alone. No "Wired prefabs are ready" phrase: the prefabs were already
  there.
- Open the Playground and press Play. Every prefab, sprite slot, font
  and material is wired, because the GUIDs came with the package.

If instead the line says "imported" with prefabs built fresh, the
receipt did not ship or does not match the manifest. Check that
`kit.lock.json` was ticked in the export and that the host project was
saved after the import finished.

## Which Unity

The guidelines capture says to submit with 2022.3 LTS (1.3.a) and that a
submission made from Editor 6.5 or newer must support URP (1.3.c). Two
facts about our kit bear on that choice:

- The styled SDF face and the re-import word heal are 2023.2+ features
  of the kit. On 2022.3 the Playground still works, but labels wear the
  plain TTF and the Words seats are plain TMP. A package built on 2022.3
  shows the reviewer the undressed version of the kit.
- The kit is uGUI only. It has no materials, shaders or render pipeline
  content of its own, so it works the same under the built-in pipeline
  and URP. A host project from the Universal 2D template satisfies the
  URP rule by construction.

The owner's call. The default this document assumes is the Unity 6
editor Chevon and Jimi test with, since that is where every receipt in
the Jimi rounds was taken, and the Universal 2D template as the host.
If the store asks for 2022.3, rebuild the host on 2022.3 and accept the
plainer type; nothing else in the recipe changes.

## Keeping it in sync with the kit

The package is a snapshot of one export. When the kit changes on
uikitmaker.com, download a fresh Asset Store zip, drag it over the same
`Assets/UIKitMaker` folder in the host project, let the receipt line
report what restyled, re-check step 3, and export again. The GUIDs do
not change across re-imports, so a customer who imports the new package
over the old one keeps every scene reference, the same way Jimi's kept
projects do.

## Store-side checklist this build answers

From `UNITY-SUBMISSION-GUIDELINES.md`, the gates this package build is
responsible for. The rest (description, AI disclosure, publisher site)
live on the Publisher Portal.

- One root folder, `Assets/UIKitMaker` (2.1.a); content sorted by type
  and chapter (2.1.b).
- No `.zip` inside the package and no nested `.unitypackage` (2.2).
- A demo scene the reviewer can open without a build step:
  `Playground.unity`, pre-built (1.1.f, 2.6.b).
- Documentation in the package as Markdown: `UNITY-README.md` and
  `Documentation/QuickStart.md` (2.3.a, 2.3.b).
- `Third-Party Notices.txt` at the kit root (1.2.a).
- Console clean after import (1.1.b), verified in step 5.
- Paths under 150 characters from `Assets/` (2.1.e); the Validator
  checks this, and the kit's plain prefab names keep well under it.
- Nothing in an `AssetStoreTools` folder (2.1.d).
