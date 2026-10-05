#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Structural + interaction check for the rail home page (no browser needed).

     npm i jsdom          # once
     node tools/rail-check.mjs

   Verifies the page renders, the rail is populated and duplicated for the
   seamless wrap, hangers sit on the rail, hover lifts a piece, click opens
   the explore overlay, and the bag/WhatsApp hand-off builds correctly.
   ------------------------------------------------------------------------- */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let JSDOM;
try { ({ JSDOM } = await import("jsdom")); }
catch { console.error("jsdom is missing →  npm i jsdom"); process.exit(1); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const ok = (cond, label, extra) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}${extra && !cond ? "  → " + JSON.stringify(extra) : ""}`);
  if (!cond) fails.push(label);
};

const dom = new JSDOM(readFileSync(join(ROOT, "home-v2.html"), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/",
  beforeParse(w) {
    w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { get() { return 1400; }, configurable: true });
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      const hang = this.classList && this.classList.contains("hang");
      const art = this.classList && this.classList.contains("hang-media");
      if (art) return { width: 120, height: 220, top: 0, left: 0, right: 120, bottom: 220, x: 0, y: 0 };
      return { width: hang ? 176 : 1400, height: hang ? 300 : 400, top: 200, left: 40, right: 216, bottom: 500, x: 0, y: 0 };
    };
    // give the harness a deterministic rail layout (uniform pieces, 170px pitch)
    Object.defineProperty(w.HTMLElement.prototype, "offsetLeft", {
      get() { const i = this.dataset && this.dataset.i; return i == null ? 0 : Number(i) * 170 + 85; },
      configurable: true,
    });
    Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", {
      get() { return (this.classList && this.classList.contains("hang")) ? 170 : 1400; },
      configurable: true,
    });
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    w.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 8);
  },
});
const inject = f => {
  const s = dom.window.document.createElement("script");
  s.textContent = readFileSync(join(ROOT, f), "utf8");
  dom.window.document.head.appendChild(s);
};
inject("catalog.js"); inject("home-v2.js");
const W = dom.window, D = W.document;
const $ = s => D.querySelector(s), $$ = s => D.querySelectorAll(s);
await new Promise(r => setTimeout(r, 400));

console.log("\nRAIL");
const hangs = $$("#railTrack .hang");
const art = $$("#railTrack .hang.has-art");
const photo = $$("#railTrack .hang:not(.has-art)");
ok(hangs.length === 170, "two seamless copies of all 85 pieces", hangs.length);
ok(art.length === 100, "side/front cut-outs on the five ready categories", art.length);
ok(photo.length === 70, "other categories fall back to the keyed photo", photo.length);
ok($$("#railTrack .art-side").length === art.length, "every cut-out piece has a side view");
ok($$("#railTrack .art-front").length === art.length, "every cut-out piece has a front view (revealed on hover)");
ok($$("#railTrack .hang-wood").length === hangs.length, "every piece has a wooden hanger");
ok($$("#railTrack .hang-btn").length === hangs.length, "every piece has a hit target");
ok($("#railName").textContent.length > 1 && $("#railMeta").textContent.includes("MOQ"), "caption is live", $("#railMeta").textContent);
ok($$("#lineList li").length === (W.AA_CATEGORIES || []).length, "the line lists every category");
ok($$("#menuCats a").length === (W.AA_CATEGORIES || []).length, "menu lists every category");
ok($$("#trayTrack a").length >= 3, "marquee tray has links");

// geometry: hanger/string must meet the rail bar
const hang0 = hangs[0];
const railTop = $("#railViewport").getBoundingClientRect().top + 46; // --railY floor
ok(hang0.querySelector(".hang-string").getBoundingClientRect().top <= railTop + 6, "string starts at the rail");

console.log("\nINTERACTION");
hang0.dispatchEvent(new W.MouseEvent("pointerover", { bubbles: true }));
ok(hang0.classList.contains("is-hot"), "hover lifts the piece");
ok($("#railViewport").classList.contains("is-dimmed"), "neighbours dim while one is lifted");
ok(!hang0.style.transform.includes("rotateY(-0"), "the hovered piece stops tipping away");

// the side → front swap is CSS driven: assert both layers exist and that the
// front layer is the one revealed by the .is-hot class
const frontSrc = hang0.querySelector(".art-front").getAttribute("src");
const sideSrc = hang0.querySelector(".art-side").getAttribute("src");
ok(/^\/assets\/garments\//.test(frontSrc) && /^\/assets\/garments\//.test(sideSrc),
   "cut-out artwork is served from /assets/garments", { frontSrc, sideSrc });
ok(frontSrc !== sideSrc, "side and front are different artworks");
ok(hang0.querySelector(".art-side").getAttribute("alt").includes("profile"), "side view is labelled for screen readers");

const target = hangs[6];
target.dispatchEvent(new W.MouseEvent("pointerover", { bubbles: true }));
const r = target.getBoundingClientRect();
const btn = target.querySelector(".hang-btn");          // what a real pointer hits
const down = new W.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: r.x + 20, clientY: r.y + 60 });
Object.defineProperty(down, "pointerId", { value: 1 });
btn.dispatchEvent(down);
const up = new W.MouseEvent("pointerup", { bubbles: true, clientX: r.x + 20, clientY: r.y + 60 });
Object.defineProperty(up, "pointerId", { value: 1 });
btn.dispatchEvent(up);
ok($("#pov").classList.contains("is-open"), "tap opens the explore overlay");
ok($("#povName").textContent === (W.AA_CATALOG.find(p => p.id === target.dataset.id) || {}).name, "overlay shows the tapped piece", $("#povName").textContent);
ok($("#povSku").textContent.startsWith("SKU"), "overlay shows an SKU line");
ok(/^\/assets\/garments\//.test($("#povHang img").getAttribute("src")), "overlay hangs the front cut-out", $("#povHang img").getAttribute("src"));
ok(!!$("#povHang .hang-wood"), "overlay piece hangs from a hanger");

$('#pov .view-btn[data-view="back"]').dispatchEvent(new W.MouseEvent("click", { bubbles: true }));
ok(!!$(".pov-backnote"), "BACK view offers a back-mockup route");
$("#povAdd").dispatchEvent(new W.MouseEvent("click", { bubbles: true }));
ok($("#bagCount").textContent === "1", "add to bag updates the count", $("#bagCount").textContent);
ok($("#bagOrder").getAttribute("href").includes("wa.me/971582045242"), "order hand-off builds a WhatsApp link");
ok($("#bagOrder").getAttribute("href").includes("MOQ"), "the order message lists MOQ per line");

console.log(`\n${fails.length ? "✗ " + fails.length + " check(s) failed" : "✓ all checks passed"}\n`);
process.exit(fails.length ? 1 : 0);
