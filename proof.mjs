import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
await p.goto("http://localhost:5199/#/app", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.click('button[aria-label="The Kit"]');
await p.waitForTimeout(1800);
await p.locator('.kp-piece', { hasText: "Speedo" }).first().locator('button[title*="Edit"], .kp-editbtn, button[aria-label*="Edit"]').first().click();
await p.waitForTimeout(1500);
console.log("KPH button:", await p.locator('.segmini button', { hasText: "KPH" }).count());
console.log("About row:", await p.locator('button', { hasText: "About Speedo" }).count());
await p.locator('.segmini button', { hasText: "KPH" }).first().click();
await p.waitForTimeout(800);
console.log("canvas KPH:", await p.evaluate(() => document.body.innerHTML.includes(">KPH<")));
await p.locator('button', { hasText: "About Speedo" }).first().click();
await p.waitForTimeout(500);
console.log("lesson:", await p.locator('text=Gran Turismo').count(),
  "| links target=_blank:", await p.locator('.infocard__links a[target="_blank"][rel*="noopener"]').count(),
  "| manual line:", await p.locator('.infocard__manual').count());
await p.screenshot({ path: "proof.png" });
console.log("ERRORS:", errs.slice(0, 3));
await b.close();
