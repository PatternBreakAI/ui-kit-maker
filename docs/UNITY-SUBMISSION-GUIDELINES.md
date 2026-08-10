# Unity Asset Store Submission Guidelines — owner capture

Captured by the owner from
https://assetstore.unity.com/publishing/submission-guidelines on 2026-08-10
(page says "Last updated: May 20, 2026"). Stored because the container
cannot reach assetstore.unity.com; this text SUPERSEDES the second-hand
summaries the free-kit brief was first drafted from. Site navigation and
footer chrome stripped; the normative sections are verbatim.

## What this capture changed in our plans (delta log)

1. **In-package images must be lossless** (2.4.3.a: png/tga/psb/psd; the
   only category exceptions are Tools, Add-Ons, Audio). The backdrop
   plates therefore ship as PNG, not the JPEG q85 the backdrop spec first
   planned. Spec updated.
2. **The AI disclosure field has a name and rules** (1.6.a): the "AI
   description" field, plain terms, no marketing language, name the
   specific tools, describe the value-adding modifications. Our
   declaration will name the image tool for the demo backdrops and state
   that all UI art is deterministic procedural engine output.
3. **AI-assisted content may not be described with human-effort words**
   (1.6.c: "drawn", "hand drawn", "painted") anywhere in the submission.
   Store copy for the plates must avoid "painterly"-family language even
   though the generation prompts use it privately.
4. **Marketing-only AI needs no disclosure** (1.6.b) — Plate D (the store
   cover stage) never enters the package and needs no AI declaration.
5. Everything the brief's compliance box asserted from secondary sources
   held up: Third-Party Notices file + description notice line (1.2.a,
   exact wording matches), no GPL/LGPL/attribution licenses (1.2.b), no
   registration/DRM/artificial limits (1.4), publisher website required
   (4.1.a), no executables (1.5.a). The brief's caveat about unverified
   clause text is now closed.

## P2 submission checklist derived from the normative text

Package build gates (verify during P2, before submission):
- [ ] Console completely clean after import + setup (1.1.b).
- [ ] Demo scenes present — required for the Templates/2D categories (1.1.f). We ship six.
- [ ] One root folder; content sorted by type/relationship; no duplicate or redundant files (2.1.a-c).
- [ ] All file paths under 150 chars measured from "Assets/" (2.1.e) — audit the exporter's family names.
- [ ] All images lossless PNG (2.4.3.a) — sprites AND backdrop plates.
- [ ] Sprite sheets imported as "Sprite", sliced and named (2.4.2.a); GUI elements separated and named (2.4.3.j).
- [ ] Importer C# in our own namespace, consistent style, spellchecked (2.5.a, 2.5.e-f).
- [ ] Editor menu under "Window/<name>" or "Tools" (2.5.1.a).
- [ ] No auto-redirect outside the Editor on import or otherwise without user consent (2.5.1.d) — README links are user-clicked, importer must never auto-open the site.
- [ ] No Editor-internal APIs via reflection (2.5.g).
- [ ] Fast Enter Playmode (domain reload disabled) supported — mandatory from Editor 6.6 (2.5.h); audit StateFx/importer statics.
- [ ] No deprecated-API warnings on the latest supported Editor (2.5.i).
- [ ] Submit with Unity 2022.3 LTS (1.3.a); if ever submitted via 6.5+, URP support becomes mandatory (1.3.c) — uGUI content is pipeline-agnostic but demo scenes must open clean under URP.
- [ ] Documentation in .txt/.md/.pdf/.html/.rtf, comprehensive, local copy included (2.3.a-b).
- [ ] Description lists asset counts + technical details (sprite dimensions, formats) (3.1.b); dependencies disclosed (1.1.c); no purely AI-generated description (3.1.a).
- [ ] Third-Party Notices.txt in package + notice line in description (1.2.a): "Asset uses Bruno Ace under SIL OFL; see Third-Party Notices.txt file in package for details." *(font updated 2026-08-10 — launch kit is Salt Pink/Bruno Ace, not Titan One)*
- [ ] "AI description" field: name the image tool used for the three demo backdrop plates; state that all UI sprites, prefabs and fonts are deterministic procedural output of our engine, not generative AI (1.6.a).
- [ ] No human-effort words for AI content anywhere in the submission (1.6.c).
- [ ] Under 6GB (1.1.e) — we are megabytes, not gigabytes.

## The captured text (normative sections)

### 1. Content Restrictions

**1.1 General**
- 1.1.a Content submitted is professionally designed, constructed, and suitable for use in a professional development pipeline. The marketing presentation, visual quality of the content, and functional quality of the content are also subject to review.
- 1.1.b Packages do not throw any errors or warnings that originate from package content after setup is complete. Handled exceptions, or errors and warnings that do not affect the usability of the package, or errors and warnings that are due to Unity engine bugs, are acceptable; such cases are transparently and completely disclosed in the package's marketing data and documentation, with explanations or workarounds explained where applicable.
- 1.1.c Assets that depend on other products or packages must disclose this information in the description. Packages that depend on standard Unity Registry UPM packages must have this dependency correctly set up in the manifest. Assets that rely on other Asset Store packages must have this dependency correctly set up in the Publisher Portal.
- 1.1.d Your product's title, description, keywords, folders, scripts, and documentation do not contain an excessive amount of spelling or grammatical mistakes.
- 1.1.e Submissions are not more than 6GB in size. UPM offerings must not exceed 700MB.
- 1.1.f Submissions to the 3D, 2D, VFX, Animation, and Template categories include demo scenes that showcase the package's content. Tool submissions that manipulate external assets include sample assets for demonstration.
- 1.1.g Packages are rejected if they include potentially non-secure content, such as proxy servers, handling of sensitive or identifying information, unsafe code, or other areas of an asset where safety cannot be reasonably guaranteed.
- 1.1.h Publication on the Asset Store is not guaranteed and is contingent on the Asset Store Content Operations team's approval of each asset, in Unity's sole discretion.
- 1.1.i The display of the Asset must not impact the integrity of Unity servers.
- 1.1.j Packages that include MCP or AI-connected functionality may only access or use developer, project, or customer data as necessary to provide the disclosed functionality to that developer or organization.
- 1.1.k Packages are rejected if developer, project, or customer data is used to train external or general-purpose models without explicit developer consent.
- 1.1.l Packages are rejected if their MCP or AI-connected functionality causes unreasonable degradation of Unity Editor performance or interferes with other Unity services or tooling.

**1.2 Legal**
- 1.2.a Your submission includes a Third-Party Notices text file listing fonts, audio, and other third-party components with dependent licenses. You are responsible for ensuring that dependent licenses are compatible with the Asset Store EULA and include a license file detailing the component that it is covering. The product description on the Asset Store also contains a notice stating the third-party licensing included in the package. For example: "Asset uses [name of component] under [name of license]; see Third-Party Notices.txt file in package for details."
- 1.2.b Submissions do not contain dependent licenses that require a product to maintain open-sourced or limited usability in commercial products, such as GPL, LGPL, or any Creative Commons/Apache 2.0 license that requires attribution.
- 1.2.c SDKs connecting to external subscription services: SDK code stays under the Asset Store EULA; alternative terms require Unity's written agreement and must be surfaced in the description and documentation.
- 1.2.d All submissions must comply with the use restrictions in Section 17 of the Unity Terms of Service.

**1.3 Versions of Unity**
- 1.3.a New assets and updates use Unity version 2022.3 or newer.
- 1.3.b If a package cannot be compatible across Unity versions, upload using multiple versions or explain the incompatibility in the description.
- 1.3.c New assets and updates submitted using Unity Editor 6.5 or newer must support URP or HDRP. Recommendation: base on URP, with an optional .unitypackage for other pipelines.

**1.4 Restrictive Content and Lite products**
- 1.4.a No functionality that restricts users from using content or features to their full extent: no DRM, time restrictions, registration, or extra costs. (Exception: SaaS-connected SDKs may require account registration and subscriptions, transparently disclosed.)
- 1.4.b Packages do not include watermarks or otherwise obstruct the use of the product.
- 1.4.c No artificial limits on functionality or usability. A "lite" version with fewer features is allowed provided each included feature has identical functionality to the main product.

**1.5 Applications and Services**
- 1.5.a No executables (.exe, .apk, etc.), embedded or as external dependencies.
- 1.5.b Third-party API keys must not be stored in ways that would incorporate the key into project builds.
- 1.5.c Terms of API usage and additional costs clearly portrayed at the top of the listing's description and in the documentation.
- 1.5.d Online services where variable money changes hands post-download: consider the Verified Solutions program.
- 1.5.e Analytics collection must be opt-in, and customers must be permitted to opt out at any time.

**1.6 Generative AI**
- 1.6.a Submissions made with AI-aided generation tools have significant value and usability in a professional development pipeline. Content generated with the aid of AI, completely or in part, must transparently disclose this information in the marketing data. The specific AI tools used and the content generated using AI must be disclosed in the "AI description" field in plain terms, without marketing language, and describing all modifications made that add value beyond the result of the generation.
- 1.6.b Usage of generative AI for marketing material is allowed only if the primary essence or functionality of the package is accurately reflected. You may use generative AI to generate logos, background elements, or supplemental visuals for a coherent visual aesthetic. Disclosure of AI assistance is not required in this case, but disclosure is still mandatory if any functional part of the asset is generated by or with the assistance of AI.
- 1.6.c Content generated by AI or AI-assisted content cannot use keywords or terms that would imply human effort (e.g., "drawn", "hand drawn", "painted") in any part of the submission.
- 1.6.d Unity reserves the right to reject submissions that are mass-produced using AI and lack sufficient differentiation or unique value relative to the publisher's existing catalog.

### 2. Product Specifications

**2.1 Organization**
- 2.1.a Packages are nested under one "root" folder (exceptions: Unity special folders).
- 2.1.b Assets sorted into appropriate folders named by type ("Mesh", "Script", "Material") or by relationship.
- 2.1.c No duplicate, unusable, or redundant files.
- 2.1.d No content in folders named "AssetStoreTools" (auto-removed on upload).
- 2.1.e File paths under 150 characters (for .unitypackage, measured from and including "Assets/").
- 2.1.f No largely identical duplicate submissions; render-pipeline variants exempt.
- 2.1.g Bundles contain the entirety of the marketed content, or the Lite Edition upgrade system is set up.
- 2.1.h Resubmitting rejected content without modification may warrant publisher account termination.

**2.2 Compressed Files**
- 2.2.a No .unitypackage or archive files that obscure the majority of the content (exceptions: setup preferences, settings, supplemental files, alternative render pipeline content).
- 2.2.b .zip acceptable only for files that do not natively function in the Editor; name with "source".

**2.3 Documentation**
- 2.3.a Documentation required if the package includes code or shaders, has configuration options, or requires setup; must be comprehensive. Local (offline) documentation strongly recommended.
- 2.3.b Documentation file types: .txt, .md, .pdf, .html, or .rtf.
- 2.3.c Video documentation not included in the package (host online).

**2.4 Art** (selected — the GUI-relevant rules)
- 2.4.2.a Sprite sheets are imported with the "Sprite" import settings, correctly sliced and named.
- 2.4.2.b Sprite animations are spliced, named, and set up as proper clips.
- 2.4.2.c Particle systems are saved as prefabs.
- 2.4.3.a Image files are in a lossless compression format such as .png, .tga, .psb, or .psd. Exceptions are assets in the Tools, Add-Ons, and Audio categories.
- 2.4.3.c Tileable textures tile without any seams or obvious edges.
- 2.4.3.d Textures and materials are optimized and usable.
- 2.4.3.h Dimensions of textures have pixel counts that are a power of 2 when appropriate.
- 2.4.3.j GUI components have their elements separated and named either before import or through the Sprite Editor settings.
- 2.4.l Models or images do not contain genitalia; characters have sufficient coverage.

**2.5 Scripts**
- 2.5.a All code in user-declared namespaces; never official Unity namespaces or trademarked names.
- 2.5.b Android-supporting assets target 64-bit architecture.
- 2.5.c No unsupported programming languages.
- 2.5.d Script files editable, readable, modifiable; unreadable code may be rejected.
- 2.5.e Consistent code style and casing.
- 2.5.f User-facing code entity names spelled correctly.
- 2.5.g No Unity Editor internal APIs via reflection or similar.
- 2.5.h From Unity Editor 6.6, all packages must support entering Play mode with Domain Reload disabled (Fast Enter Playmode).
- 2.5.i No deprecated/obsolete API warnings on the latest supported Editor version.
- 2.5.1.a File menus under an existing menu ("Window/<PackageName>") or a custom "Tools" menu.
- 2.5.1.b Unique windows for practical purposes only, not solely marketing.
- 2.5.1.d No scripts that automatically or without user consent redirect users outside the Unity Editor. InitializeOnLoad methods must serve a functional purpose and may not forward users outside the Editor directly.
- 2.5.1.e No programmatic add/update/remove of packages in user projects, except packages in the offering's own product.

**2.6 Essentials and Templates**
- 2.6.a Designed as instructional, tutorial, or framework products.
- 2.6.b Visual content or functionality displayed in a demo scene.
- 2.6.c Documentation includes in-depth information about design and how users can edit and expand the project.

**2.8 Platform Compatibility**
- 2.8.a Offerings designed for Unity Supported Platforms.

### 3. Product Marketing
- 3.1.a Description accurately covers all important aspects and key features, including dependencies, intended functionality, and requirements. Unexpected limitations clearly disclosed; failure may warrant refund and deprecation. Purely AI-generated descriptions can be rejected.
- 3.1.b Description for art assets lists the number of unique assets or asset types, plus technical details (sprite dimensions, supported render pipelines, etc.).
- 3.1.c Multi-edition packages include a feature comparison.

### 4. Publisher Guide
- 4.1.a Publishers have an active email address and an actively maintained website that shows relevant work and skill sets.
- 4.1.b Inactive links may be grounds for package deprecation with no prior warning.

### 5. UPM
(Not our path for v1 — .unitypackage submission planned. Noted: UPM requires third-party identity verification, 700MB cap, manifest field rules 5.2.e-k.)
