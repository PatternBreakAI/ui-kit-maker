/* Approved front-door markup, generated from the design artifact.
   __FD_*__ tokens are replaced with bundled asset URLs at mount. */
export const LANDING_HTML = `</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="bg-stack" aria-hidden="true">
    <div class="bg-base"></div>
    <div class="bg-grid"></div>
    <svg class="bg-arcs" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <circle cx="330" cy="420" r="370" fill="none" stroke="currentColor" stroke-width="1"/>
      <circle cx="330" cy="420" r="248" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 8"/>
      <circle cx="1280" cy="230" r="420" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1 9"/>
      <path d="M0 420h150M330 140v80M1280 620v100" stroke="currentColor" stroke-width="1"/>
    </svg>
    <div class="bg-ruler">
      <span style="top:9%">PX</span><span style="top:20%">100</span><span style="top:31%">200</span>
      <span style="top:42%">300</span><span style="top:53%">400</span><span style="top:64%">600</span>
      <span style="top:75%">700</span><span style="top:86%">800</span>
    </div>
    <div class="bg-cross"><i style="top:16%;right:2%">+</i><i style="top:34%;right:1%">+</i><i style="top:52%;right:2.4%">+</i><i style="top:70%;right:1.2%">+</i><i style="top:86%;right:2%">+</i></div>
    <div class="bg-readout bg-readout--xy" id="xyReadout">X: 0&nbsp;&nbsp;Y: 0</div>
    <div class="bg-readout bg-readout--wh" id="whReadout">W: 1440&nbsp;&nbsp;H: 900</div>
  </div>
  <div class="cursor-aura" aria-hidden="true"></div>
  <div class="page-noise" aria-hidden="true"></div>

  <header class="site-header" id="siteHeader">
    <nav class="nav" aria-label="Primary">
      <a class="brand" href="#top" aria-label="UI Kit Maker home">
<img class="brand-mark" src="data:image/png;base64,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" alt="" width="30" height="30">
        <span>UI Kit Maker</span>
        <small>by PatternBreak</small>
      </a>
      <div class="nav-actions">
        <select class="lang-sel" id="langSel" aria-label="Language">
          <option value="en">EN</option><option value="zh">中文</option><option value="fr">FR</option>
          <option value="es">ES</option><option value="it">IT</option><option value="de">DE</option><option value="ja">日本語</option>
        </select>
        <button class="icon-btn" id="themeToggle" type="button" aria-label="Switch to light theme">
          <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <g class="sun"><circle cx="12" cy="12" r="3.3"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></g>
            <path class="moon" d="M20 15.1A8 8 0 0 1 8.9 4a8.2 8.2 0 1 0 11.1 11.1Z"/>
          </svg>
        </button>
        <button class="nav-btn sign-in" type="button" data-cta="sign-in">Sign in</button>
        <a class="nav-btn primary" href="#generator" data-cta="open-generator">Open the generator →</a>
      </div>
    </nav>
  </header>

  <main id="main">
    <section class="hero" id="top">
      <div class="shell hero2">
        <div class="hero2-copy">
          <div class="eyebrow reveal-in e1">BROWSER-BASED GAME UI TOOL</div>
          <h1 class="h1b reveal-in e2">Design a <br>UI kit in <br><span class="seconds-grad">seconds!</span></h1>
          <p class="hero2-sub reveal-in e3">Tweak a real button right here — color, shape, shine — then push it into a whole production-ready kit. Every pixel comes from a <em class="hl hl-w">deterministic</em> engine, <em class="hl">not AI</em>, so what you make is <em class="hl hl-w">yours</em> to ship, sell, and own.</p>
          <div class="hero2-actions reveal-in e4">
            <a class="cta primary" href="#generator" data-cta="open-generator">Open the generator →</a>
            <button class="cta" type="button" data-cta="sign-in">Sign in</button>
          </div>
          <div class="trust2 reveal-in e6">
            <div class="trust2-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
              <span><b>Deterministic Engine</b><i>Pixel-perfect output you can rely on.</i></span>
            </div>
            <div class="trust2-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg>
              <span><b>Yours to Own</b><i>Export, edit, sell, and ship with full ownership.</i></span>
            </div>
            <div class="trust2-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 22l6-6M19 19l2 2M9.5 6.5 21 18v3h-3L6.5 9.5"/></svg>
              <span><b>Built for Creators</b><i>Made for game devs, designers, and studios.</i></span>
            </div>
          </div>
        </div>

        <div class="studio2 reveal-in e3" id="studio2" aria-label="Live UI button studio">
          <div class="st2-narr"><span id="narrTxt"></span><button class="cust-btn" id="custBtn" type="button" hidden>⛭ <span id="custTxt">CUSTOMIZE</span></button><span class="pv-ctl">
              <span class="st2-status" id="stStatus" aria-live="polite">LIVE PREVIEW</span>
            </span></div>
          <div class="pv-steps" id="pvSteps" role="group" aria-label="Onboarding steps">
            <button type="button" data-step="1" class="on">01 MASTER</button>
            <button type="button" data-step="2" disabled>02 KIT</button>
            <button type="button" data-step="3" disabled>03 BOARD</button>
          </div>
          <div class="st2-preview" id="previewField">
            <span class="pv-label" id="pvLabel">MASTER / 01</span>
            <span class="pv-bracket tl"></span><span class="pv-bracket tr"></span>
            <span class="pv-bracket bl"></span><span class="pv-bracket br"></span>
            <span class="pv-axis pv-axis--h"></span><span class="pv-axis pv-axis--v"></span>
            <div class="master-wrap" id="masterWrap">
              <div class="master-svg" id="masterSvg" aria-hidden="true"></div>
              <span class="master-label" id="masterLabelEl">LET&rsquo;S GO</span>
              <button class="master-hit" id="masterHit" type="button" aria-label="Live master component"></button>
            </div>
            <div class="pv-kit" id="pvKit" hidden></div>
            <div class="pv-board" id="pvBoard" hidden>
              <div class="b2-tabs" id="b2Tabs">
                <span class="b2-tabset" id="b2TabSet"></span>
                <button class="b2-addtab" id="b2Add" type="button">+ BOARD</button>
                <span class="b2-actions"><button class="b2-act" id="b2Png" type="button">⭳ PNG</button><button class="b2-act" id="b2Share" type="button">⤴ SHARE</button></span>
              </div>
              <aside class="b2-lib">
                <div class="b2-cap">LIBRARY</div>
                <div class="b2-items" id="b2Lib"></div>
                <div class="b2-hint">drag onto<br>the stage</div>
              </aside>
              <div class="b2-stage" id="b2Stage">
                <img class="b2-bg" src="__FD_boards_valley__" alt="">
                <div class="b2-dimmer" id="b2Dim"></div>
                <div class="b2-veil" id="b2Veil"></div>
                <div class="b2-chip" id="b2Chip" hidden>⭱ yourworld.png</div>
                <div class="b2-dimctl"><span id="dimLbl">VIGNETTE</span><input type="range" id="dimR" class="slider" min="0" max="75" value="50" style="--fill:67%" aria-label="Vignette strength"></div>
                <div class="b2-pieces" id="b2Pieces"></div>
              </div>
            </div>
            <div class="bd-call" id="bdCall" hidden aria-hidden="true"><b id="bdCall1">STAGE UNLOCKED</b><span id="bdCall2">Playtest your kit over real screenshots — your game, your frames.</span></div>
            <div class="pv-ship" id="pvShip" hidden>
              <div class="ship-wrap">
              <div class="ship-card">
                <div class="ship-head"><i>⬢</i><b id="shipDoneTxt">EXPORT COMPLETE</b></div>
                <div class="ship-sub">your-kit.zip · every component × 4 states</div>
                <div class="ship-rows">
                  <div class="ship-row" style="--i:0"><em>✓</em><b>engine/</b><span>unity.json · unreal.json</span></div>
                  <div class="ship-row" style="--i:1"><em>✓</em><b>web/</b><span>kit.html · kit.css</span></div>
                  <div class="ship-row" style="--i:2"><em>✓</em><b>vector/</b><span>SVG — every component</span></div>
                  <div class="ship-row" style="--i:3"><em>✓</em><b>raster/</b><span>PNG @1× · @2×</span></div>
                  <div class="ship-row" style="--i:4"><em>✓</em><b>boards/</b><span>board-1.png · 1920 × 1080</span></div>
                </div>
                <div class="ship-line" id="shipLineTxt">Yours to ship — in any game or product you sell.</div>
              </div>
              <div class="ship-list">
                <div class="ship-list-head"><b>⇣</b><span id="shipCount">0 / 0</span></div>
                <div class="ship-list-scroll" id="shipList"></div>
              </div>
              </div>
            </div>
            <span class="kit-ready" id="kitReady" aria-hidden="true">KIT READY</span>
          </div>

          <div class="st2-controls">
            <div class="c-split c-row3">
              <div class="c-color-row">
                <span class="c-cap">STYLE</span>
                <div class="palette2" id="palette2" role="group" aria-label="Candy palette"></div>
              </div>
              <div class="c-group">
                <label class="c-label" for="roundR"><span>ROUNDNESS</span><span class="c-val" id="roundVal">62%</span></label>
                <input class="range" id="roundR" type="range" min="0" max="100" value="62" style="--range:62%">
              </div>
              <div class="c-group">
                <label class="c-label" for="shineR"><span>SHINE</span><span class="c-val" id="shineVal">82%</span></label>
                <input class="range" id="shineR" type="range" min="0" max="100" value="82" style="--range:82%">
              </div>
            </div>
            <div class="c-split c-split--pl">
              <div class="c-group">
                <div class="c-label"><span>PATTERN</span></div>
                <div class="pat-tiles" id="patTiles" role="group" aria-label="Surface pattern"></div>
              </div>
              <div class="c-group">
                <label class="c-label" for="labelIn"><span>LABEL</span></label>
                <div class="label-row2">
                  <input class="text-input" id="labelIn" type="text" value="LET&rsquo;S GO" maxlength="12" autocomplete="off">
                </div>
              </div>
              <template id="randTpl">
                  <button class="rand-btn" id="randBtn" type="button" aria-label="Randomize the design">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.6" cy="8.6" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.35" fill="currentColor" stroke="none"/></svg>
                    RANDOMIZE
                  </button>
              </template>
            </div>
            <div class="c-bottom">
              <div class="c-group c-states">
                <div class="c-label"><span>STATES (LIVE PREVIEW)</span></div>
                <div class="states-tabs" id="stateTabs" role="tablist" aria-label="Component states">
                  <button type="button" class="on" data-state="default" role="tab">DEFAULT</button>
                  <button type="button" data-state="hover" role="tab">HOVER</button>
                  <button type="button" data-state="pressed" role="tab">PRESSED</button>
                </div>
                <div class="state-big" id="stateBig"></div>
              </div>
              <div class="c-group c-font">
                <div class="c-label"><span id="fontCap">FONT</span></div>
                <div class="font-chips" id="fontChips" role="group" aria-label="Label font"></div>
              </div>
              <div class="c-group c-more">
                <div class="more-grid">
                  <div class="mg-full">
                    <div class="c-label"><span id="tcolCap">FONT COLOR</span></div>
                    <div class="bg-chips" id="tcolChips" role="group" aria-label="Label color"></div>
                  </div>
                  <div>
                    <label class="c-label" for="extrR"><span id="extrCap">EXTRUSION</span><span class="c-val" id="extrVal">15px</span></label>
                    <input class="range" id="extrR" type="range" min="0" max="48" value="15" style="--range:31%">
                  </div>
                  <div>
                    <div class="c-label"><span id="dsgnCap">DESIGN</span></div>
                    <div class="act-row" id="actRow"></div>
                  </div>
                </div>
              </div>
              </div>
            </div>
            <button class="push2" id="pushBtn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m12 3 8 4.5-8 4.5-8-4.5z"/><path d="M4 12.5 12 17l8-4.5M4 17l8 4.5 8-4.5"/></svg>
              <span id="pushLabel">CREATE YOUR KIT</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="scroll-cue">Scroll to multiply</div>
    </section>

    

    <section class="stats-band" aria-label="What you get">
      <div class="shell">
        <div class="sb-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg><span><b id="sb1t">1 MASTER COMPONENT</b><i id="sb1s">Infinite variations.</i></span></div>
        <div class="sb-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 2 9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/></svg><span><b id="sb2t">46 COMPONENTS</b><i id="sb2s">Every essential.</i></span></div>
        <div class="sb-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg><span><b id="sb3t">4 STATES</b><i id="sb3s">Always in sync.</i></span></div>
        <div class="sb-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V5M8 8l4-4 4 4M4 21h16"/></svg><span><b id="sb4t">EXPORT ANYWHERE</b><i id="sb4s">Engines, web, PNG, SVG.</i></span></div>
      </div>
    </section>

    <section class="audience-section" aria-labelledby="audienceTitle">
      <div class="shell">
        <div class="audience-head reveal">
          <div>
            <p class="section-label">From side quest to shipped</p>
            <h2 class="section-title" id="audienceTitle">Built for anyone who ships</h2>
          </div>
          <p>No gatekeeping, no install, no waiting for a specialist to free up. Just a real design system you can play.</p>
        </div>
        <div class="ppl-grid">
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_gamedev__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#d946ef"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 11v2M6 12h2M15.5 11.5h.01M18 13.5h.01"/></svg></span><b>GAME DEVS</b></div>
            <p>Ship polished UI that levels up your game.</p>
          </figure>
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_indie__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#3b82f6"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15.5 5.8a3.2 3.2 0 0 1 0 6.4M17 14.7c2 .6 3.2 1.9 3.6 4.3"/></svg></span><b>INDIE &amp; SMALL STUDIOS</b></div>
            <p>Punch above your weight with a cohesive UI system.</p>
          </figure>
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_hobbyist__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#f59e0b"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span><b>HOBBYISTS &amp; MAKERS</b></div>
            <p>Make the side project look shipped, not sketched.</p>
          </figure>
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_students__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#22d3ee"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m22 9-10-5L2 9l10 5 10-5zM6 11v5c0 1.3 3 3 6 3s6-1.7 6-3v-5"/></svg></span><b>STUDENTS</b></div>
            <p>Learn design systems by building with a real one.</p>
          </figure>
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_uiartists__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#ec4899"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 19 7-7-4-9-9 4-2 8 8-2 5-5"/><path d="m2 22 6.5-6.5"/></svg></span><b>UI ARTISTS</b></div>
            <p>Super-charge your workflow. Design faster. Explore more.</p>
          </figure>
          <figure class="ppl-card reveal">
            <div class="ppl-photo"><img src="__FD_people_prototypers__" alt="" loading="lazy"></div>
            <div class="ppl-head"><span class="ppl-ic" style="--ic:#f97316"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg></span><b>PROTOTYPERS &amp; NO-CODE</b></div>
            <p>Drop beautiful, exportable UI into any tool or engine.</p>
          </figure>
        </div>
      </div>
    </section>


    <section class="app-gallery" aria-labelledby="galleryTitle">
      <div class="shell">
        <div class="math-header reveal">
          <p class="section-label">Straight from the app</p>
          <h2 class="section-title" id="galleryTitle">The real thing, three screens deep.</h2>
        </div>

        <div class="gal-grid">
          <!-- 1 · THE EDITOR -->
          <figure class="gal-card reveal gal-wide">
            <div class="app-frame">
              <div class="af-bar"><span class="af-brand">UI Kit Maker</span><span class="af-save">✓ All changes saved</span></div>
              <div class="af-editor">
                <div class="af-panel">
                  <div class="af-cap">GLOBAL · DEFAULT</div>
                  <div class="af-sl"><span>Brightness</span><i style="--f:62%"></i><b>8</b></div>
                  <div class="af-sl"><span>Saturation</span><i style="--f:81%"></i><b>81</b></div>
                  <div class="af-sl"><span>Glow</span><i style="--f:12%"></i><b>0%</b></div>
                  <div class="af-cap" style="margin-top:12px">PRESETS</div>
                  <div class="af-presets">
                    <button type="button" class="af-preset" data-pid="retro-diner"><span class="rt"></span>Retro Diner</button>
                    <button type="button" class="af-preset" data-pid="hard-candy"><span class="rt"></span>Hard Candy</button>
                    <button type="button" class="af-preset on" data-pid="grape-jelly"><span class="rt"></span>Grape Jelly</button>
                    <button type="button" class="af-preset" data-pid="neon-versus"><span class="rt"></span>Neon Versus</button>
                  </div>
                </div>
                <div class="af-canvas">
                  <div class="af-hero"><span class="real-hero" id="realHero"></span></div>
                </div>
                <div class="af-states">
                  <div class="af-st on">Default · editing</div><div class="af-st">Hover</div><div class="af-st">Pressed</div><div class="af-st">Disabled</div>
                </div>
              </div>
            </div>
            <figcaption><b>The Editor.</b> Every dial from the hero — and a hundred more. States live on the right, presets one click away.</figcaption>
          </figure>

          <!-- 2 · THE KIT SHEET -->
          <figure class="gal-card reveal">
            <div class="app-frame af-amber">
              <div class="af-bar"><span class="af-brand">UI Kit Maker</span><span class="af-save">Saved · Export ▾</span></div>
              <div class="af-kit">
                <div class="af-kit-copy">
                  <span class="af-chip">DESIGN SYSTEM</span>
                  <b>The Hero Chisel Kit</b>
                  <div class="af-stats"><span><b>5</b> LEVELS</span><span><b>90+</b> COMPONENTS</span><span><b>20+</b> ASSEMBLIES</span></div>
                  <span class="af-export">⭳ Export — Engine kit (ZIP)</span>
                </div>
                <div class="af-explode" aria-hidden="true">
                  <i class="x1"></i><i class="x2"></i><i class="x3"></i><i class="x4"></i>
                  <em>Highlight · Bevel · Pattern · Inner Fill · Glow · Shadow</em>
                </div>
              </div>
            </div>
            <figcaption><b>The Kit.</b> Your design becomes a living guideline sheet — layers, roles, and every component documented.</figcaption>
          </figure>

          <!-- 3 · THE BOARD -->
          <figure class="gal-card reveal">
            <div class="app-frame af-warm">
              <div class="af-bar"><span class="af-brand">The Board</span><span class="af-save">16:9 · 1920 × 1080 · Export PNG</span></div>
              <div class="af-board">
                <div class="af-banner"><span class="shot-svg" data-c="#f59e0b" data-r="20" data-p="Stripes" data-w="190" data-h="40"></span><b>GET READY</b></div>
                <div class="af-rows">
                  <div class="af-row"><i></i><span><b>Shadow Knight</b><em>Level 12 · Warrior</em></span></div>
                  <div class="af-row"><i></i><span><b>Shadow Knight</b><em>Level 12 · Warrior</em></span></div>
                </div>
                <div class="af-slots"><i></i><i></i><i></i><i></i></div>
              </div>
            </div>
            <figcaption><b>The Board — the big payoff.</b> Stage your kit over real screens, tune the backdrop, export artboards.</figcaption>
          </figure>

          <!-- 4 · SHIPPED HUD (full bleed) -->
          <figure class="gal-card reveal gal-wide">
            <div class="hud-shot" aria-label="A full game HUD skinned by one master design">
              <canvas class="hud-starcv" id="hudStars" aria-hidden="true"></canvas>
              <div class="hud-hearts"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div>
              <div class="hud-map"><i></i><i></i><i></i></div>
              <div class="hud-xp"><i></i></div>
              <div class="hud-ret" aria-hidden="true"></div>
              <div class="hud-stick"><i></i></div>
              <div class="hud-bar">
                <span class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6"/></svg><b>64</b></span>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg></span>
                <span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S3.6 15 3.6 8.9C3.6 6 5.9 4.4 8 4.4c1.6 0 3 .9 4 2.2 1-1.3 2.4-2.2 4-2.2 2.1 0 4.4 1.6 4.4 4.5C20.4 15 12 21 12 21z"/></svg></span>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9z"/></svg><b>64</b></span>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.9 6.6 19.4 7.9 13.4 3.3 9.3l6.1-.6z"/></svg></span>
                <span></span><span></span><span></span><span></span>
              </div>
              <div class="hud-ammo"><b>24</b>/ 90</div>
            </div>
            <figcaption><b>Shipped.</b> One master design → a complete HUD: hearts, minimap, hotbar, ammo. Every piece from the same DNA.</figcaption>
          </figure>

          <!-- 5 · EXPORT LAB (interactive) -->
          <figure class="gal-card reveal gal-wide">
            <div class="exp-lab">
              <div class="exp-menu2" role="tablist" aria-label="Export formats" id="expMenu">
                <button type="button" data-x="gamekit" class="on"><i>⬢</i> Export game kit</button>
                <button type="button" data-x="svg"><i>⭳</i> Export SVG</button>
                <button type="button" data-x="png"><i>▣</i> Export PNG 2×</button>
                <button type="button" data-x="html"><i>⭱</i> Download HTML</button>
                <button type="button" data-x="copy"><i>⧉</i> Copy SVG code</button>
                <button type="button" data-x="settings"><i>⛭</i> Export settings</button>
              </div>
              <div class="exp-view" id="expView"></div>
            </div>
            <figcaption><b>Yours, in every format — roll over each one.</b> Engine-ready structure for Unity and Unreal, layered vectors for design tools, clean HTML for the web.</figcaption>
          </figure>
        </div>
      </div>
    </section>

    

    

    <section class="ownership-section" aria-labelledby="ownershipTitle">
      <div class="ownership-marquee" aria-hidden="true"><span>YOURS · YOURS · YOURS · YOURS · </span><span>YOURS · YOURS · YOURS · YOURS · </span></div>
      <div class="shell ownership-grid">
        <div class="ownership-copy reveal">
          <div class="ownership-badge">Yours, for real</div>
          <h2 id="ownershipTitle">No AI. No templates. <em>No gray areas.</em></h2>
          <p>Every kit is drawn by a deterministic design engine — not a model trained on other people’s work. Nothing is scraped, nothing is “in the style of” someone else. What you make is unique to your settings, and it’s yours to ship, sell, and call your own.</p>
          <p class="own-lic" id="ownLic"></p>
        </div>
        <div class="ownership-seal reveal" aria-hidden="true">
          <div class="seal-ring"></div>
          <div class="seal-card">
            <small>PatternBreak / provenance certificate</small>
            <strong>100%<span>YOURS.</span></strong>
            <div class="seal-signature"><b>Deterministic by design</b><i>PB</i></div>
          </div>
        </div>
      </div>
    </section>

    <section class="steps-section" aria-labelledby="stepsTitle">
      <span class="hud-corner hc-tl" aria-hidden="true">UI SYSTEM PROTOCOL<br>v2.4</span>
      <span class="hud-corner hc-tr" aria-hidden="true">DESIGN ONCE.<br>DEPLOY EVERYWHERE.</span>
      <span class="hud-corner hc-bl" aria-hidden="true">BUILD BEAUTIFUL.<br>SHIP FASTER.</span>
      <span class="hud-corner hc-br" aria-hidden="true">// SYSTEMS<br>THAT SCALE</span>
      <div class="shell">
        <div class="steps-head reveal">
          <p class="section-label">Three moves. One complete system.</p>
          <h2 class="section-title" id="stepsTitle">How it works.</h2>
          <span class="steps-rule" aria-hidden="true"></span>
        </div>
        <div class="steps-grid">
          <article class="step-card reveal">
            <span class="step-ghost" aria-hidden="true">01</span>
            <span class="step-tag">STEP 01</span>
            <h3>Design the master</h3>
            <p>Tune one component — silhouette, material, type, and its four states.</p>
            <div class="sv-master">
              <div class="sv-hero" data-eng="hero" aria-hidden="true"></div>
              <div class="states-tabs sv-tabs" id="svTabs" role="tablist" aria-label="Master states">
                <button type="button" class="on" data-st="default" role="tab">DEFAULT</button>
                <button type="button" data-st="hover" role="tab">HOVER</button>
                <button type="button" data-st="pressed" role="tab">PRESSED</button>
                <button type="button" data-st="disabled" role="tab">DISABLED</button>
              </div>
              <div class="sv-variant" id="svVariant" aria-hidden="true"></div>
            </div>
            <span class="step-foot">[ MASTER COMPONENT ]</span>
          </article>
          <article class="step-card reveal">
            <span class="step-ghost" aria-hidden="true">02</span>
            <span class="step-tag">STEP 02</span>
            <h3>Generate the kit</h3>
            <p>One model fans out to every component and size, live on the canvas.</p>
            <div class="sv-fan" aria-hidden="true">
              <div class="sv-node" data-eng="node"></div>
              <svg class="sv-wires" viewBox="0 0 60 300" preserveAspectRatio="none">
                <path d="M2 150 C 30 150 30 28 58 28" /><path d="M2 150 C 30 150 30 77 58 77" />
                <path d="M2 150 C 30 150 30 126 58 126" /><path d="M2 150 C 30 150 30 175 58 175" />
                <path d="M2 150 C 30 150 30 224 58 224" /><path d="M2 150 C 30 150 30 273 58 273" />
              </svg>
              <div class="sv-rows">
                <div class="sv-row"><span class="sv-art" data-kid="badge"></span><b>BADGE</b></div>
                <div class="sv-row"><span class="sv-art" data-kid="toggle" data-v="1"></span><b>TOGGLE</b></div>
                <div class="sv-row"><span class="sv-art" data-kid="chip"></span><b>PILL</b></div>
                <div class="sv-row"><span class="sv-art sv-art--wide" data-kid="progress" data-v="72"></span><b>PROGRESS BAR</b></div>
                <div class="sv-row"><span class="sv-art" data-kid="iconbtn"></span><b>ICON BUTTON</b></div>
                <div class="sv-row"><span class="sv-art sv-art--wide" data-kid="slot"></span><b>LOADOUT SLOT</b></div>
              </div>
            </div>
            <span class="step-foot">[ LIVE ON CANVAS ]</span>
          </article>
          <article class="step-card reveal">
            <span class="step-ghost" aria-hidden="true">03</span>
            <span class="step-tag">STEP 03</span>
            <h3>Export or share</h3>
            <p>Download an engine kit, HTML, SVG, or PNG — or publish a live link.</p>
            <div class="sv-export" aria-hidden="true">
              <div class="sv-x"><i>PNG</i><span>PNG</span><em>›</em></div>
              <div class="sv-x"><i>SVG</i><span>SVG</span><em>›</em></div>
              <div class="sv-x"><i>{ }</i><span>JSON</span><em>›</em></div>
              <div class="sv-x"><i>HTML</i><span>HTML</span><em>›</em></div>
              <div class="sv-x sv-x--live"><i>⛓</i><span>LIVE LINK</span><em class="sv-mono">share_link</em></div>
            </div>
            <span class="step-foot">[ READY FOR EVERYWHERE ]</span>
          </article>
        </div>
        <p class="steps-iter reveal" id="stepsIter">And it never locks: pop back to the master, turn a dial, and the whole system re-flows — kit, boards, exports. Iterate toward what’s best for the whole. (Also, it’s just fun to keep playing.)</p>
      </div>
    </section>

    <section class="final-section" id="generator" aria-labelledby="finalTitle">
      <span class="hud-corner hc-tl" aria-hidden="true">// SYSTEMS THAT SCALE<br>BEAUTIFULLY</span>
      <span class="hud-corner hc-tr" aria-hidden="true">BUILT FOR CREATORS<br>MADE FOR GAMES //</span>
      <div class="shell">
        <div class="final2 reveal">
          <figure class="f2-float f2-photo f2-pp1" aria-hidden="true"><img id="f2P1" alt=""></figure>
          <figure class="f2-float f2-photo f2-pp2" aria-hidden="true"><img id="f2P2" alt=""></figure>
          <figure class="f2-float f2-photo f2-pp3" aria-hidden="true"><img id="f2P3" alt=""></figure>
          <div class="f2-float f2-hud f2-h1" aria-hidden="true"><small>HEALTH</small><span class="f2-art" id="f2HudHealth"></span><b>87%</b></div>
          <div class="f2-float f2-hud f2-h2" aria-hidden="true"><small>LEVEL UP</small><span class="f2-art f2-art--wide" id="f2HudXp"></span><b>2,450 / 5,000</b></div>
          <div class="f2-float f2-hud f2-h3" aria-hidden="true"><small>SHIELD</small><span class="f2-art" id="f2HudShield"></span><b>ON</b></div>
          <div class="f2-float f2-hud f2-h4" aria-hidden="true"><small>COINS</small><span class="f2-art" id="f2HudCoins"></span><b>1,250</b></div>
          <div class="f2-float f2-hud f2-h5" aria-hidden="true"><small>PROGRESS</small><span class="f2-art f2-art--wide" id="f2HudProg"></span><b>72%</b></div>
          <div class="final2-content">
            <p class="f2-eyebrow" id="f2Eyebrow">THREE MOVES. ONE COMPLETE SYSTEM.</p>
            <h2 id="finalTitle">Start building —<br><span class="f2-grad">nothing to install.</span></h2>
            <p class="f2-sub" id="finalSub">The editor runs entirely in your browser. Start with <b class="f2-hl">Free Explorer</b>, then upgrade when you’re ready for the full production toolkit.</p>
            <button class="f2-cta" type="button" data-cta="open-generator"><i>⚡</i><span id="f2CtaTxt">START BUILDING</span><em>→</em></button>
            <div class="f2-feats">
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/></svg><b id="fin1t">BROWSER-BASED</b><i id="fin1s">No installs</i></div>
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg><b id="fin2t">DETERMINISTIC</b><i id="fin2s">Not AI</i></div>
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5-8 4.5-8-4.5zM4 12.5 12 17l8-4.5M4 17l8 4.5 8-4.5"/></svg><b id="fin3t">GAME-READY</b><i id="fin3s">Export anywhere</i></div>
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><b id="fin4t">YOURS TO SHIP</b><i id="fin4s">Sell &amp; own</i></div>
            </div>
            <p class="f2-free"><span class="f2-check">✓</span> <span id="f2Free">Selected kits and limited PNG exports included free.</span></p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
<img class="brand-mark" src="data:image/png;base64,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" alt="" width="26" height="26">
        <span><strong>UI Kit Maker</strong> by PatternBreak</span>
      </div>
      <div class="footer-links">
        <a href="#/terms">Terms</a>
        <a href="#/privacy">Privacy</a>
      </div>
      <p class="footer-lic" id="footLic"></p>
    </div>
  </footer>

  
  
  `;
