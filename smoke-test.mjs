#!/usr/bin/env node
/** Smoke — Calculateur Solaire version 0.2 · grille QC + W-by-tilt */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runInNewContext } from "vm";
import {
  validateBugPayload,
  buildBugIssue,
  handleBugReportRequest
} from "./api/bug-report-core.mjs";
import { handler as netlifyBugHandler } from "./api/bug-report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAX_MULT = 1.14975;

const kW = 6.5;
const priceW = 3;
const HT = kW * 1000 * priceW;
const TTC = HT * TAX_MULT;
const subv = Math.min(1000 * kW, 0.4 * HT);
const reel = TTC - subv;
const target = 15920.76;
const ok = Math.abs(reel - target) < 1.0;

console.log("Analyste smoke: 6.5kW $3/W → réel≈15920.76");
console.log(`  HT=${HT}  TTC=${TTC}  subv=${subv}  réel=${reel.toFixed(2)}`);
console.log(`  match≈target: ${ok ? "PASS" : "FAIL"} (Δ=${(reel - target).toFixed(3)})`);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === ".git" || name === "fonts") continue;
      walk(p, acc);
    } else if (/\.(html|js|css|json|md)$/i.test(name) && name !== "smoke-test.mjs") {
      if (/montreal/i.test(name)) continue;
      acc.push(p);
    }
  }
  return acc;
}
const forbiddenA = "HQ" + "_RATE";
const forbiddenB = "0.07" + "065";
let bad = false;
for (const p of walk(__dirname)) {
  const t = readFileSync(p, "utf8");
  if (t.includes(forbiddenA) || t.includes(forbiddenB)) {
    console.log("  forbidden in", p);
    bad = true;
  }
  if (t.includes("UI seulement") || t.includes("n’affecte PAS le calcul") || t.includes("n'affecte PAS le calcul")) {
    console.log("  stale UI-only deneige copy in", p);
    bad = true;
  }
}
console.log(`  no ${forbiddenA} / ${forbiddenB} / UI-only deneige: ${bad ? "FAIL" : "PASS"}`);

const grid = JSON.parse(readFileSync(join(__dirname, "assets/quebec-full-grid.json"), "utf8"));
const s30 = grid.cells["30"]["180"];
const sAnnual = s30.ac_annual;
console.log(`  grid S/30 ac_annual: ${sAnnual} (expect ≈1254.8064)`);

const annualOk = Math.abs(sAnnual - 1254.8064) < 0.01;
console.log(`  S/30 annual≈1254.8: ${annualOk ? "PASS" : "FAIL"}`);

const cellCount = Object.keys(grid.cells).reduce(
  (n, t) => n + Object.keys(grid.cells[t]).length,
  0
);
const cellsOk = cellCount === 168;
console.log(`  cells count ${cellCount} (expect 168): ${cellsOk ? "PASS" : "FAIL"}`);

/** Same W-by-tilt model as app.js */
function winterWFromTilt(tilt) {
  const t = Number(tilt);
  if (!isFinite(t)) return 0.18;
  if (t <= 45) return 0.18;
  if (t >= 90) return 0;
  return Math.round(18 * (90 - t) / 45) / 100;
}

// Extended table: 0, 45, 60, 75, 90 (+ 30 sanity)
const wTable = {
  0: winterWFromTilt(0),
  30: winterWFromTilt(30),
  45: winterWFromTilt(45),
  60: winterWFromTilt(60),
  75: winterWFromTilt(75),
  90: winterWFromTilt(90)
};
const wExpect = { 0: 0.18, 30: 0.18, 45: 0.18, 60: 0.12, 75: 0.06, 90: 0 };
const wTiltOk = Object.keys(wExpect).every(
  (k) => Math.abs(wTable[k] - wExpect[k]) < 1e-9
);
console.log(
  `  W-by-tilt table 0→0.18, 45→0.18, 60→0.12, 75→0.06, 90→0: ${wTiltOk ? "PASS" : "FAIL"} ` +
  `(${[0, 45, 60, 75, 90].map((t) => wTable[t]).join(",")})`
);

const app = readFileSync(join(__dirname, "assets/app.js"), "utf8");
const hasFetch = app.includes("quebec-full-grid.json");
const hasFallback = app.includes("1254.8064");
const hasFormula = app.includes("applyDeneigement");
const hasTiltW = app.includes("winterWFromTilt") && app.includes("18 * (90");
const has24az = app.includes('"195"') && app.includes('"15"') && app.includes("AZ_LABELS");
const usesTiltWInCalc = /const W = winterWFromTilt/.test(app) || /W = winterWFromTilt\(tilt\)/.test(app);
const hasGridLoading = app.includes("gridStatus") && app.includes("loading") && app.includes("error");
const hasFallbackAny = app.includes('source: "fallback"') || app.includes("source: 'fallback'");
const hasPasteArea = app.includes('addEventListener("paste"') || app.includes("addEventListener('paste'");
const hasBlurArea = app.includes('addEventListener("blur"') || app.includes("addEventListener('blur'");
const hasRoundArea = app.includes("roundAreaInput") && app.includes("Math.round");
const hasModalScroll = app.includes("modal-open") && app.includes("Escape");
const hasIntegerLive = app.includes("fmtSig2") && app.includes("deneigeLive") && app.includes("function sig2Round");
console.log(`  app.js loads quebec-full-grid.json: ${hasFetch ? "PASS" : "FAIL"}`);
console.log(`  app.js S/30 annual fallback: ${hasFallback ? "PASS" : "FAIL"}`);
console.log(`  app.js applyDeneigement + winterWFromTilt: ${hasFormula && hasTiltW && usesTiltWInCalc ? "PASS" : "FAIL"}`);
console.log(`  app.js AZ_LABELS 15° steps: ${has24az ? "PASS" : "FAIL"}`);
console.log(`  app.js grid loading/error + any-cell fallback: ${hasGridLoading && hasFallbackAny ? "PASS" : "FAIL"}`);
console.log(`  app.js area integer paste+blur+round: ${hasPasteArea && hasBlurArea && hasRoundArea ? "PASS" : "FAIL"}`);
console.log(`  app.js modal Escape + scroll lock: ${hasModalScroll ? "PASS" : "FAIL"}`);
console.log(`  app.js live W% via fmtSig2 (2 sig figs): ${hasIntegerLive ? "PASS" : "FAIL"}`);

const W = wTable[30];
const kWhAn = sAnnual * kW;
const kWhA = kWhAn * (1 - (1 - 1) * W);
const passA = Math.abs(kWhA - kWhAn) < 1e-9;
console.log(`  smoke A deneige=1: kWh_eff=${kWhA.toFixed(2)} == annuel ${kWhAn.toFixed(2)} → ${passA ? "PASS" : "FAIL"}`);

const kWhB = kWhAn * (1 - (1 - 0) * W);
const expectB = kWhAn * (1 - W);
const passB = Math.abs(kWhB - expectB) < 1e-6 && kWhB < kWhAn;
console.log(`  smoke B deneige=0%: kWh_eff=${kWhB.toFixed(2)} expect ${expectB.toFixed(2)} (loss ${(W * 100).toFixed(0)}%) → ${passB ? "PASS" : "FAIL"}`);

/** Hard lock: cannot credit more kWh than annual household consumption */
function creditKwh(kWhProd, kWhConso) {
  if (!isFinite(kWhProd) || kWhProd < 0) return 0;
  if (!isFinite(kWhConso) || kWhConso <= 0) return kWhProd;
  return Math.min(kWhProd, kWhConso);
}
const clampRate = 0.11142;
const clampLow = creditKwh(10000, 6000);
const ecoLow = clampLow * clampRate;
const ecoUncapped = 10000 * clampRate;
const clampHigh = creditKwh(5000, 17000);
const clampEmpty = creditKwh(8000, null);
const clampZero = creditKwh(8000, 0);
const clampPass =
  clampLow === 6000 &&
  Math.abs(ecoLow - 668.52) < 0.01 &&
  ecoLow < ecoUncapped &&
  clampHigh === 5000 &&
  clampEmpty === 8000 &&
  clampZero === 8000;
const yearsCapped = 15920.76 / ecoLow;
const yearsUncapped = 15920.76 / ecoUncapped;
const paybackUsesCap = yearsCapped > yearsUncapped && isFinite(yearsCapped);
console.log(
  `  clamp min(prod, conso): 10k/6k→${clampLow} kWh, eco=${ecoLow.toFixed(2)} (uncapped ${ecoUncapped.toFixed(2)}) → ${clampPass ? "PASS" : "FAIL"}`
);
console.log(
  `  payback uses capped eco (years ${yearsCapped.toFixed(1)} > ${yearsUncapped.toFixed(1)}): ${paybackUsesCap ? "PASS" : "FAIL"}`
);

const html = readFileSync(join(__dirname, "index.html"), "utf8");
const css = readFileSync(join(__dirname, "assets/styles.css"), "utf8");

const labelOk = html.includes("Efficacité du déneigement") && !/perte\s+neige/i.test(html);
const liveBeside =
  html.includes('id="deneigeLive"') &&
  !html.includes("deneigeVal") &&
  !html.includes("slider-val-left-stack") &&
  !html.includes("loss-annuel");
const liveFmt =
  (html.includes("−14&nbsp;%") || html.includes("−14 %")) &&
  !html.includes("−14,4") &&
  !html.includes("% annuel") &&
  !html.includes("%&nbsp;annuel");
const brandSubSlice = html.includes("brand-sub")
  ? html.slice(html.indexOf("brand-sub"), html.indexOf("brand-sub") + 180)
  : "";
const verOk =
  /\bv0\.2\b/.test(html) &&
  !/V0\.2/.test(html) &&
  !html.includes("V0.1") &&
  !/version 0\.2/i.test(html) &&
  !/v0\.2/.test(brandSubSlice) &&
  html.includes('id="buildId"') &&
  existsSync(join(__dirname, "assets/build.json")) &&
  app.includes("function loadBuildId") &&
  app.includes("assets/build.json");
const buildMeta = existsSync(join(__dirname, "assets/build.json"))
  ? JSON.parse(readFileSync(join(__dirname, "assets/build.json"), "utf8"))
  : {};
const buildShaOk =
  /^[0-9a-f]{7}$/.test(String(buildMeta.sha || "")) &&
  buildMeta.sha !== "3f2a41c" &&
  html.includes("v0.2+" + buildMeta.sha);
const noBadge = !html.includes("Pédagogique · FR · Québec fixe") && !html.includes("Québec fixe");
const noMtlHard = !html.includes("1314,1") && !html.includes("0,1768") && !/Montréal/i.test(html);
const heroSlice = html.slice(html.indexOf('class="hero"'), html.indexOf("</header>") + 10);
const resultSlice = html.includes("result-pill")
  ? html.slice(html.indexOf("result-pill"), html.indexOf("result-pill") + 600)
  : "";
const noQcHero =
  !/estimation Québec/i.test(html) &&
  !/Montréal|Québec/i.test(heroSlice) &&
  !/Montréal|Québec/i.test(resultSlice) &&
  !/pas une soumission/i.test(heroSlice) &&
  html.includes("Estimation de son projet en quelques minutes");
const orientLabel =
  html.includes("180° (Sud)") &&
  html.includes("0° (Nord)") &&
  html.includes("90° (Est)") &&
  html.includes("270° (Ouest)") &&
  html.includes("45° (Nord-Est)") &&
  html.includes("135° (Sud-Est)") &&
  html.includes("225° (Sud-Ouest)") &&
  html.includes("315° (Nord-Ouest)");
const orient24 = (html.match(/option value="/g) || []).length >= 24;
const has195 = html.includes('value="195"') && html.includes('value="15"');
const areaInt = html.includes('step="1"') && html.includes('inputmode="numeric"');
const logoOk =
  (html.includes("logo-solution-era.png") || html.includes("logo-solution-era.svg")) &&
  css.includes(".brand-logo") &&
  /border-radius:\s*50%/.test(css) &&
  !/\.brand-logo[\s\S]{0,220}border-radius:\s*10px/.test(css) &&
  css.includes("overflow: visible");
const taxes15 = html.includes("15&nbsp;%") || html.includes("15 %");
const logisDefault = /id="subv"[^>]*checked/.test(html) || /id="subv" checked/.test(html);
const logisCopy =
  html.includes("Appliquée par défaut") &&
  !html.includes("D’abord le coût sans") &&
  !html.includes("D'abord le coût sans") &&
  !html.includes("coche pour l’appliquer") &&
  !html.includes("coche pour l'appliquer");
const htmlSansBrand = html
  .replace(/DÉFI Autonomie Énergétique/g, "")
  .replace(/Autonomie et neige/g, "")
  .replace(/en autonomie/gi, "");
const noBattery = !/batteries|autonomie/i.test(htmlSansBrand);
const brandDefi =
  html.includes("Solution ERA | DÉFI Autonomie Énergétique") &&
  /class="brand-name"[^>]*>Solution ERA \| DÉFI Autonomie Énergétique</.test(html) &&
  html.includes("bug-ver") &&
  html.includes("© Solution ERA | DÉFI Autonomie Énergétique | Calculateur solaire |") &&
  !html.includes("Énergétique · Calculateur") &&
  !html.includes("solaire · <span id=\"buildId\"") &&
  html.includes('id="buildId"') &&
  !html.includes("v0.2 staging") &&
  !html.includes("Solution Era");
const infoBtn = html.includes("En apprendre plus") && html.includes("infoModal");
const tiltViz = html.includes("tiltViz") || html.includes("tiltLine");
const gridStatusUi = html.includes('id="gridStatus"');
const sliderScreen = css.split("@media print")[0];
const sliderLeft =
  sliderScreen.includes("slider-val-left") &&
  sliderScreen.includes("slider-row") &&
  /\.slider-row[\s\S]{0,500}align-items:\s*flex-start/.test(sliderScreen) &&
  /\.slider-val-left[\s\S]{0,500}justify-content:\s*center/.test(sliderScreen) &&
  /\.slider-val-left[\s\S]{0,500}text-align:\s*center/.test(sliderScreen) &&
  /\.slider-val-left[\s\S]{0,500}height:\s*var\(--slider-hit\)/.test(sliderScreen) &&
  !/\.slider-val-left[\s\S]{0,400}justify-content:\s*flex-end/.test(sliderScreen);
const areaBlock = html.slice(html.indexOf('for="area"'), html.indexOf('for="tilt"'));
const prodControlGrid =
  (html.match(/class="prod-control-row/g) || []).length >= 4 &&
  /unit-toggle[\s\S]+id="area"/.test(areaBlock) &&
  !/id="area"[\s\S]+unit-toggle/.test(areaBlock) &&
  /class="prod-control-row slider-row"/.test(html) &&
  sliderScreen.includes("--prod-gutter") &&
  /\.prod-control-row[\s\S]{0,280}grid-template-columns:\s*var\(--prod-gutter\)/.test(sliderScreen) &&
  /\.slider-row[\s\S]{0,700}grid-template-columns:\s*var\(--prod-gutter\)/.test(sliderScreen);
const tiltSlider =
  /id="tilt"[^>]*type="range"/.test(html) &&
  /id="tilt"[^>]*min="0"/.test(html) &&
  /id="tilt"[^>]*max="90"/.test(html) &&
  /id="tilt"[^>]*step="15"/.test(html) &&
  html.includes('id="tiltVal"') &&
  html.includes("tilt-gutter") &&
  html.includes("tiltViz") &&
  !/<select\s+id="tilt"/.test(html) &&
  !html.includes("tilt-select-row") &&
  /\$\("tiltVal"\)\.textContent/.test(app) &&
  /\["util", "deneige", "priceW", "tilt"\]/.test(app);
const subtitlePad =
  /--subtitle-pad-top:\s*0\.45rem/.test(sliderScreen) &&
  /section\.block\s*>\s*h2/.test(sliderScreen) &&
  /\.field\s*>\s*\.label-row/.test(sliderScreen) &&
  /\.field\s*>\s*label/.test(sliderScreen) &&
  /\.field\s*>\s*\.field-label/.test(sliderScreen) &&
  /\.disc-head/.test(sliderScreen) &&
  /\.modal-head/.test(sliderScreen) &&
  /\.info-sheet\s+\.info-block\s*>\s*h4/.test(sliderScreen) &&
  /padding-top:\s*var\(--subtitle-pad-top\)/.test(sliderScreen);
const fieldHairline =
  /--section-hairline:\s*rgba\(\s*47,\s*62,\s*54,\s*0\.12\s*\)/.test(sliderScreen) &&
  /--section-hairline-pad:\s*0\.7rem/.test(sliderScreen) &&
  /section\.block\s*>\s*\.field:has\(\+\s*\.field\)/.test(sliderScreen) &&
  /section\.block\s*>\s*\.field\s*\+\s*\.field/.test(sliderScreen) &&
  /border-top:\s*1px\s+solid\s+var\(--section-hairline\)/.test(sliderScreen) &&
  /padding-top:\s*var\(--section-hairline-pad\)/.test(sliderScreen) &&
  /margin-bottom:\s*var\(--section-hairline-pad\)/.test(sliderScreen) &&
  /section\.block\s*>\s*\.field:has\(\+\s*\.field\)\s*>\s*:last-child/.test(sliderScreen) &&
  /section\.block\s*>\s*\.field\s*\+\s*\.field\s*>\s*:first-child/.test(sliderScreen) &&
  !/\.field\s*\+\s*\.field[\s\S]{0,220}box-shadow/.test(sliderScreen) &&
  !/\.field\s*\+\s*\.field[\s\S]{0,220}border-radius/.test(sliderScreen);
const safariFix = css.includes("touch-action: none") && css.includes("-webkit-appearance") && /Safari/i.test(css);
const modalCss = css.includes("modal-open") && css.includes("overflow: hidden");
const noMtlAssets =
  !existsSync(join(__dirname, "assets/montreal-kwh-per-kw.json")) &&
  !existsSync(join(__dirname, "assets/montreal-monthly.json"));
const lossAt20 = Math.round((1 - 0.2) * W * 100);
const lossOk = lossAt20 === 14;
const appLive =
  app.includes("deneigeLive") &&
  app.includes('fmtSig2(lossPct) + "&nbsp;%"') &&
  !app.includes("% annuel");
const subvDefaultJs = /subv"\)\.checked\s*=\s*true/.test(app) || /\$\("subv"\)\.checked = true/.test(app);
const discTiltW =
  (html.includes("selon l’inclinaison") || html.includes("selon l'inclinaison") || html.includes("selon l’<strong>inclinaison")) &&
  html.includes("18");

console.log(`  UI label « Efficacité du déneigement »: ${labelOk ? "PASS" : "FAIL"}`);
console.log(`  live loss left of slider (deneigeLive · −N % only): ${liveBeside && liveFmt ? "PASS" : "FAIL"}`);
console.log(`  app.js live format « −X % » + fmtSig2: ${appLive && hasIntegerLive ? "PASS" : "FAIL"}`);
console.log(`  v0.2 branding (no V0.2 / V0.1 / Montréal): ${verOk && noMtlHard ? "PASS" : "FAIL"}`);
console.log(`  footer build id matches build.json (not 3f2a41c): ${buildShaOk ? "PASS" : "FAIL"}`);
console.log(`  brand Solution ERA | DÉFI Autonomie Énergétique: ${brandDefi ? "PASS" : "FAIL"}`);
console.log(`  badge removed + no Québec in hero/results: ${noBadge && noQcHero ? "PASS" : "FAIL"}`);
console.log(`  orient labels N° (Cardinal) for cardinals: ${orientLabel && orient24 && has195 ? "PASS" : "FAIL"}`);
console.log(`  area integers (step=1, inputmode=numeric): ${areaInt ? "PASS" : "FAIL"}`);
console.log(`  logo + taxes 15% + LogisVert default ON: ${logoOk && taxes15 && logisDefault && subvDefaultJs ? "PASS" : "FAIL"}`);
console.log(`  LogisVert subcopy « Appliquée par défaut »: ${logisCopy ? "PASS" : "FAIL"}`);
console.log(`  no battery + info modal + tilt viz + gridStatus: ${noBattery && infoBtn && tiltViz && gridStatusUi ? "PASS" : "FAIL"}`);
console.log(`  slider value-left + Safari touch CSS: ${sliderLeft && safariFix ? "PASS" : "FAIL"}`);
console.log(`  slider value centered on piste + left gutter: ${sliderLeft ? "PASS" : "FAIL"}`);
console.log(`  prod 2-col grid (superficie toggle left + 4 rows): ${prodControlGrid ? "PASS" : "FAIL"}`);
console.log(`  inclinaison slider 0–90 step 15 (grille QC): ${tiltSlider ? "PASS" : "FAIL"}`);
console.log(`  shared subtitle top padding (--subtitle-pad-top): ${subtitlePad ? "PASS" : "FAIL"}`);
console.log(`  field-section hairlines (--section-hairline 1px @ 12%): ${fieldHairline ? "PASS" : "FAIL"}`);
console.log(`  modal scroll-lock CSS: ${modalCss ? "PASS" : "FAIL"}`);
console.log(`  no dead MTL assets in staging: ${noMtlAssets ? "PASS" : "FAIL"}`);
console.log(`  disclaimer W-by-tilt: ${discTiltW ? "PASS" : "FAIL"}`);
console.log(`  loss at d=20% tilt30: −${lossAt20}% (expect −14 integer) → ${lossOk ? "PASS" : "FAIL"}`);


const hasSkipFocus = app.includes("focusSkipTarget") && app.includes("main.focus");
const hasGridRetry = app.includes("fetchGridOnce");
const hasAriaPressed = app.includes("aria-pressed");
const safariRowTouch = css.includes("touch-action: none") && /\.slider-row[\s\S]{0,120}touch-action:\s*none/.test(css);
const safariUserSelect = css.includes("-webkit-user-select: none") && /\.slider-row[\s\S]{0,200}-webkit-user-select:\s*none/.test(css);
const safeArea = css.includes("safe-area-inset") && css.includes("env(safe-area-inset-top");
const btnManipulation = css.includes("touch-action: manipulation") && /\.btn\s*\{[\s\S]{0,400}?touch-action:\s*manipulation/.test(css);
const pageMargin = css.includes("@page") && /@page\s*\{[^}]*margin\s*:/.test(css);
const modalDvh = css.includes("88dvh") || css.includes("100dvh");
const pdfPrintOnly = /function\s+printPdf\s*\([^)]*\)\s*\{\s*window\.print\s*\(\s*\)\s*;\s*\}/.test(app) || (app.includes("window.print()") && app.includes("function printPdf") && !/printPdf[\s\S]{0,80}jspdf|html2canvas|pdf-lib/i.test(app));
console.log(`  skip-link JS focus main: ${hasSkipFocus ? "PASS" : "FAIL"}`);
console.log(`  grid fetch retry once: ${hasGridRetry ? "PASS" : "FAIL"}`);
console.log(`  unit aria-pressed: ${hasAriaPressed ? "PASS" : "FAIL"}`);
console.log(`  slider-row Safari touch-action: ${safariRowTouch ? "PASS" : "FAIL"}`);
console.log(`  slider-row -webkit-user-select: ${safariUserSelect ? "PASS" : "FAIL"}`);
console.log(`  safe-area-inset padding: ${safeArea ? "PASS" : "FAIL"}`);
console.log(`  btn touch-action manipulation: ${btnManipulation ? "PASS" : "FAIL"}`);
console.log(`  @page print margin: ${pageMargin ? "PASS" : "FAIL"}`);
console.log(`  modal max-height dvh: ${modalDvh ? "PASS" : "FAIL"}`);
console.log(`  btnPdf window.print only: ${pdfPrintOnly ? "PASS" : "FAIL"}`);

const hasPointerDrag = app.includes("wireRangePointerDrag") && app.includes("setPointerCapture");
const thumb44 = /::-webkit-slider-thumb[\s\S]{0,220}?width:\s*44px/.test(css);
const overscrollRow = /\.slider-row[\s\S]{0,200}?overscroll-behavior:\s*contain/.test(css);
const viewportFit = html.includes("viewport-fit=cover");
console.log(`  range pointer-drag (touch/pen): ${hasPointerDrag ? "PASS" : "FAIL"}`);
console.log(`  thumb 44px webkit: ${thumb44 ? "PASS" : "FAIL"}`);
console.log(`  slider-row overscroll contain: ${overscrollRow ? "PASS" : "FAIL"}`);
console.log(`  viewport-fit=cover: ${viewportFit ? "PASS" : "FAIL"}`);

const tiltWLabel = app.includes("tiltWLabel") && app.includes("fmtSig2(r.W * 100)");
const touchFallback = app.includes("touchstart") && app.includes("PointerEvent");
const dualTouchPointer = app.includes("viaTouch") && app.includes("touchstart") && app.includes("setPointerCapture");
const gridRetryBtn = app.includes("btnGridRetry") && css.includes(".grid-retry");
const gridReload = app.includes('"reload"') || app.includes("'reload'");
const beforePrint = app.includes("beforeprint");
const wrapAria = app.includes('aria-hidden') && app.includes('.wrap');
const touchCallout = css.includes("-webkit-touch-callout: none");
const themeColor = html.includes('name="theme-color"');
const rate16 = /\.rate-box input\s*\{[\s\S]{0,220}?font-size:\s*16px/.test(css);
const rowDrag = app.includes("wireSliderRowDrag") && app.includes("slider-row");
const rangeDragLock = app.includes("is-range-dragging") && /body\.is-range-dragging\s*\{/.test(css);
const wrapInert = app.includes("wrap.inert") || (app.includes("inert") && app.includes("openInfo"));
const docDragGuard = app.includes("onDocTouchMoveWhileDragging") && app.includes("clearRangeDragging");
const gridUiStable = app.includes("lastGridUiStatus");
const noTelDetect = html.includes('name="format-detection"') && html.includes("telephone=no");
const pageShowClear = app.includes('pageshow') && app.includes("clearRangeDragging");
const hasConsoInput =
  html.includes('id="conso"') &&
  html.includes("Consommation annuelle (kWh / an)") &&
  /id="conso"[^>]*value="17000"/.test(html);
const hasEcoNote =
  html.includes("kpiEcoNote") &&
  html.includes("Plafonné à votre consommation annuelle") &&
  html.includes("on ne peut pas économiser plus que ce qu’on consomme");
const hasCreditFn =
  app.includes("function creditKwh") &&
  app.includes("Math.min(kWhProd, kWhConso)") &&
  /DEFAULT_CONSO_KWH\s*=\s*17000/.test(app) &&
  app.includes("kWhCredites") &&
  app.includes("ecoClamped");
const hasConsoWired = app.includes('"conso"') && app.includes("kpiEcoNote");
const ttcExact = 0.11142 * TAX_MULT;
const ttcRounded = Math.round(ttcExact * 1e5) / 1e5;
const defaultRateTtc =
  /DEFAULT_RATE\s*=\s*0\.12811/.test(app) &&
  /id="rate"[^>]*value="0\.12811"/.test(html) &&
  !/id="rate"[^>]*value="0\.11142"/.test(html) &&
  Math.abs(ttcRounded - 0.12811) < 1e-12 &&
  app.includes("RATE_D_T2_HT") &&
  /RATE_D_T2_HT\s*=\s*0\.11142/.test(app);
const hasRateInfoUi =
  html.includes("btnRateInfo") &&
  html.includes("rateModal") &&
  html.includes("9,53") &&
  html.includes("Moyenne Québec TTC") &&
  html.includes("Moyenne rés. QC TTC (HQ Comparaison 2025, 1000 kWh/mois") &&
  html.includes("8,29") &&
  html.includes("comparaison-prix-electricite-2025.pdf") &&
  html.includes("7,065") &&
  html.includes("11,142") &&
  html.includes("46,154") &&
  html.includes("8,123") &&
  html.includes("12,811") &&
  html.includes("0,12811") &&
  html.includes("Avant taxes (HT)") &&
  html.includes("Taxes comprises (TTC)") &&
  html.includes("tarif de 2") &&
  html.includes("tranche TTC") &&
  !html.includes("9,82") &&
  !html.includes("9,81") &&
  css.includes(".rate-info-btn") &&
  app.includes("openRateInfo") &&
  app.includes("rateModal");
console.log(`  tilt W-by-tilt live label: ${tiltWLabel ? "PASS" : "FAIL"}`);
console.log(`  range touch fallback (no PointerEvent): ${touchFallback ? "PASS" : "FAIL"}`);
console.log(`  dual touch+pointer range drag (viaTouch): ${dualTouchPointer ? "PASS" : "FAIL"}`);
console.log(`  grid fail-soft retry button: ${gridRetryBtn ? "PASS" : "FAIL"}`);
console.log(`  grid retry cache reload: ${gridReload ? "PASS" : "FAIL"}`);
console.log(`  beforeprint closes modal: ${beforePrint ? "PASS" : "FAIL"}`);
console.log(`  modal wrap aria-hidden: ${wrapAria ? "PASS" : "FAIL"}`);
console.log(`  slider-row touch-callout none: ${touchCallout ? "PASS" : "FAIL"}`);
console.log(`  theme-color + rate 16px: ${themeColor && rate16 ? "PASS" : "FAIL"}`);
console.log(`  slider-row miss-hit drag (wireSliderRowDrag): ${rowDrag ? "PASS" : "FAIL"}`);
console.log(`  body.is-range-dragging scroll-lock: ${rangeDragLock ? "PASS" : "FAIL"}`);
console.log(`  modal wrap inert: ${wrapInert ? "PASS" : "FAIL"}`);
console.log(`  doc touchmove drag guard: ${docDragGuard ? "PASS" : "FAIL"}`);
console.log(`  grid status UI stable (lastGridUiStatus): ${gridUiStable ? "PASS" : "FAIL"}`);
console.log(`  format-detection telephone=no: ${noTelDetect ? "PASS" : "FAIL"}`);
console.log(`  pageshow clears range drag: ${pageShowClear ? "PASS" : "FAIL"}`);
console.log(`  conso annuelle input + défaut 17 000 kWh: ${hasConsoInput ? "PASS" : "FAIL"}`);
console.log(`  économies KPI note FR (plafonné): ${hasEcoNote ? "PASS" : "FAIL"}`);
console.log(`  app.js creditKwh + DEFAULT_CONSO_KWH + clamp flags: ${hasCreditFn ? "PASS" : "FAIL"}`);
console.log(`  conso wired to render + kpiEcoNote: ${hasConsoWired ? "PASS" : "FAIL"}`);
console.log(`  default rate TTC 0.12811 (0.11142 × 1.14975): ${defaultRateTtc ? "PASS" : "FAIL"}`);
const infoSheetUi =
  css.includes(".info-sheet") &&
  /max-height:\s*min\(88dvh/.test(css) &&
  !/info-sheet[\s\S]{0,280}max-height:\s*100dvh/.test(css) &&
  css.includes(".info-block") &&
  html.includes('id="infoModal"') &&
  html.includes('id="rateModal"') &&
  html.includes('id="fieldInfoModal"') &&
  html.includes('class="modal-backdrop info-sheet mode-full-only" id="infoModal"') &&
  html.includes('class="modal-backdrop info-sheet mode-full-only" id="rateModal"') &&
  html.includes('class="modal-backdrop info-sheet" id="fieldInfoModal"') &&
  html.includes('class="modal-backdrop info-sheet" id="bugModal"') &&
  app.includes("openFieldInfo") &&
  app.includes("fieldInfoModal") &&
  html.includes('data-info="orient"') &&
  html.includes('data-info="area"') &&
  html.includes('data-info="util"') &&
  html.includes('data-info="deneige"') &&
  html.includes('data-info="tilt"') &&
  html.includes("tpl-info-tilt") &&
  html.includes("Maximum de production") &&
  html.includes("entre 35° et 40°") &&
  html.includes("maximum de production") &&
  html.includes("plein sud") &&
  html.includes("vivent en autonomie") &&
  html.includes("panneaux à 90°") &&
  html.includes("aucune accumulation de neige") &&
  !html.includes("zéro neige") &&
  !html.includes("15–30°") &&
  !html.includes("60–75°") &&
  !html.includes("n’est pas l’idéal énergétique") &&
  !html.includes("40–45°") &&
  !html.includes("40° à 45°") &&
  !html.includes("id=\"tiltHint\"") &&
  !html.includes("90° l’hiver") &&
  !html.includes("30° l’été et 90°") &&
  html.includes("superficie qu’ils vont avoir") &&
  html.includes("superficie utile") &&
  html.includes("superficie du toit") &&
  html.includes("dégagée") &&
  html.includes("quelques obstacles") &&
  html.includes("puits de ventilation") &&
  !html.includes("superficie exacte des panneaux") &&
  /label-row field-info-wrap[\s\S]{0,280}for="tilt"/.test(html) &&
  html.includes("avec une installation solaire d’une puissance de") &&
  !html.includes("avec votre installation solaire") &&
  html.includes("perte de production") &&
  html.includes("chiffre à gauche") &&
  html.includes("perte restante") &&
  !html.includes("Lire le résultat") &&
  !html.includes("field-info-tip");
console.log(`  ⓘ HQ lock moyenne 9,53 ¢ + 2 paliers HT+TTC: ${hasRateInfoUi ? "PASS" : "FAIL"}`);
console.log(`  ⓘ floating cards + tilt tip: ${infoSheetUi ? "PASS" : "FAIL"}`);
const orientVersantTip =
  html.includes("tpl-info-orient") &&
  html.includes("Indiquez un seul versant à la fois") &&
  html.includes("refaites le calcul") &&
  html.includes("additionnez les résultats") &&
  !html.includes("Ne répartissez pas le calcul");
console.log(`  ⓘ orientation un seul versant + addition: ${orientVersantTip ? "PASS" : "FAIL"}`);
const orientAzimuthHint =
  html.includes("Indiquez l’orientation au 15° près.<br>180° = Sud<br>0° = Nord.") &&
  !html.includes("Indiquez l’orientation au 15° près. 180° = Sud, 0° = Nord.");
console.log(`  ⓘ orientation 15° / Sud / Nord line breaks: ${orientAzimuthHint ? "PASS" : "FAIL"}`);
const orientPanelsLabel =
  html.includes("<label for=\"orient\">Orientation des panneaux solaires</label>") &&
  html.includes("aria-label=\"Aide : Orientation des panneaux solaires\"") &&
  html.includes("title=\"Aide : Orientation des panneaux solaires\"") &&
  html.includes("<span data-info-title>Orientation des panneaux solaires</span>") &&
  !html.includes("Orientation de la toiture") &&
  html.includes("<label for=\"tilt\">Inclinaison de la toiture</label>");
console.log(`  orient label = panneaux solaires (inclinaison toiture kept): ${orientPanelsLabel ? "PASS" : "FAIL"}`);
const areaInstallLabel =
  html.includes("<label for=\"area\">Superficie de l’installation</label>") &&
  html.includes("aria-label=\"Aide : Superficie de l’installation\"") &&
  html.includes("title=\"Aide : Superficie de l’installation\"") &&
  html.includes("<span data-info-title>Superficie de l’installation</span>") &&
  !html.includes("Superficie de la toiture") &&
  !html.includes("superficie de votre toiture") &&
  !html.includes("Plus de surface = plus de panneaux") &&
  html.includes("Dans la majorité des cas, c’est la superficie du versant de toit le mieux orienté.") &&
  html.includes("<label for=\"tilt\">Inclinaison de la toiture</label>");
console.log(`  area label = superficie de l’installation (inclinaison toiture kept): ${areaInstallLabel ? "PASS" : "FAIL"}`);
const deneigeTpl = (html.match(/id="tpl-info-deneige"[\s\S]*?<\/template>/) || [""])[0];
const deneigeTip =
  deneigeTpl.includes("Zéro pour cent = aucun déneigement.") &&
  deneigeTpl.includes("Cent pour cent = déneigement rapide après chaque chute.") &&
  deneigeTpl.includes("L’inclinaison influence aussi l’accumulation") &&
  deneigeTpl.includes("un toit plat (zéro degré) accumule très bien la neige") &&
  deneigeTpl.includes("un toit 12/12 (quarante-cinq degrés) accumule la neige") &&
  deneigeTpl.includes("une installation verticale (quatre-vingt-dix degrés) n’accumule aucune neige") &&
  !deneigeTpl.includes("0°") &&
  !deneigeTpl.includes("45°") &&
  !deneigeTpl.includes("90°") &&
  !deneigeTpl.includes("0&nbsp;% = aucun déneigement") &&
  !deneigeTpl.includes("100&nbsp;% = déneigement après chaque chute") &&
  !deneigeTpl.includes("L’inclinaison fixe aussi le risque");
console.log(`  ⓘ déneigement mots + accumulation 12/12: ${deneigeTip ? "PASS" : "FAIL"}`);

const modeSrc = readFileSync(join(__dirname, "assets/display-mode.js"), "utf8");
function runDisplayMode(search) {
  const htmlEl = {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };
  const bodyEl = {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };
  const sandbox = {
    URLSearchParams,
    location: { search },
    document: {
      documentElement: htmlEl,
      body: bodyEl,
      addEventListener() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runInNewContext(modeSrc, sandbox, { filename: "display-mode.js" });
  return { api: sandbox.SolarDisplayMode, htmlEl, bodyEl };
}
const modeBare = runDisplayMode("");
const modeMissing = runDisplayMode("?foo=1");
const modeFull = runDisplayMode("?mode=full");
const modeUnknown = runDisplayMode("?mode=banana");
const modeWebi = runDisplayMode("?mode=webi");
const modeWebiCase = runDisplayMode("?mode=WEBI");
const modeWebinarAlias = runDisplayMode("?mode=webinar");
const modeDefaultFull =
  modeBare.api.current === "full" &&
  modeBare.api.parseDisplayMode("") === "full" &&
  modeBare.api.parseDisplayMode("?") === "full" &&
  modeMissing.api.current === "full" &&
  modeFull.api.current === "full" &&
  modeUnknown.api.current === "full" &&
  modeBare.htmlEl.getAttribute("data-mode") === "full" &&
  modeBare.bodyEl.getAttribute("data-mode") === "full";
const modeWebiOk =
  modeWebi.api.current === "webi" &&
  modeWebi.api.parseDisplayMode("?mode=webi") === "webi" &&
  modeWebiCase.api.current === "webi" &&
  modeWebinarAlias.api.current === "webi" &&
  modeWebinarAlias.api.parseDisplayMode("?mode=webinar") === "webi" &&
  modeWebi.htmlEl.getAttribute("data-mode") === "webi" &&
  modeWebi.bodyEl.getAttribute("data-mode") === "webi";
const htmlModeDefault = /<html[^>]*data-mode="full"/.test(html);
const htmlModeScript = html.includes('src="assets/display-mode.js"');
const htmlProdVisible = html.includes('id="sec-prod"') && !/id="sec-prod"[^>]*mode-full-only/.test(html);
const secCostIdx = html.indexOf('id="sec-cost"');
const secValueIdx = html.indexOf('id="sec-value"');
const secCostTag = secCostIdx >= 0 ? html.slice(Math.max(0, secCostIdx - 80), secCostIdx + 40) : "";
const secValueTag = secValueIdx >= 0 ? html.slice(Math.max(0, secValueIdx - 80), secValueIdx + 40) : "";
const htmlHidesCost = /mode-full-only/.test(secCostTag) && secCostTag.includes("sec-cost");
const htmlHidesValue = /mode-full-only/.test(secValueTag) && secValueTag.includes("sec-value");
const htmlHidesDisc = /aside class="disclaimers mode-full-only"/.test(html);
const htmlHidesHero = /header class="hero mode-full-only"/.test(html);
const htmlWebiBadge = html.includes("Mode webi") && html.includes("mode-webi-only");
const cssHidesFull = /html\[data-mode="webi"\]\s*\.mode-full-only/.test(css);
const cssHidesWebiOnly = /html:not\(\[data-mode="webi"\]\)\s*\.mode-webi-only/.test(css);
const runbook = readFileSync(join(__dirname, "docs/WEBINAR_RUNBOOK.md"), "utf8");
const runbookWebiLink =
  runbook.includes("?mode=webi") &&
  runbook.includes("à utiliser en live mercredi") &&
  runbook.includes("Alias de `webi`") &&
  /URL nue = full|URL nue.*complet|absent.*Mode complet/s.test(runbook);
const appWiresMode = app.includes("SolarDisplayMode") && app.includes("parseDisplayMode");
const htmlAllowlist =
  htmlHidesCost &&
  htmlHidesValue &&
  htmlHidesDisc &&
  htmlHidesHero &&
  htmlProdVisible &&
  html.includes('id="sec-prod"') &&
  html.includes('id="sec-cost"') &&
  html.includes('id="sec-value"');
const prodPillDay = html.includes('id="outKwhDay"') && html.includes("kWh /") && html.includes(">jour<");
const prodPillAnnual = html.includes('id="outKwh"') && html.includes(">an<");
const prodPillEqualType =
  html.includes('class="big prod-line" id="outKwhDay"') &&
  html.includes('class="big prod-line" id="outKwh"') &&
  html.includes("prod-num") &&
  css.includes("prod-lines") &&
  /grid-template-columns:\s*max-content\s+auto\s+auto/.test(css) &&
  !html.includes("big-annual") &&
  !css.includes(".big-annual");
const prodKwC =
  /id="outKw"[^>]*>— kWc</.test(html) &&
  /\$\("outKw"\)\.textContent = fmtSig2\(r\.kW\) \+ " kWc"/.test(app) &&
  html.includes("avec une installation solaire d’une puissance de") &&
  !html.includes("Puissance estimée");
const prodNoWave =
  !/id="outKwhDay"[^>]*>≈/.test(html) &&
  !/id="outKwh"[^>]*>≈/.test(html) &&
  !app.includes('"≈ " + fmtNum(r.kWh') &&
  app.includes("prod-num") &&
  app.includes("kWhDay");
const dayFromAnnual = Math.round(6874 / 365);
const dayOk = dayFromAnnual === 19;
console.log(`  display mode default=full (bare/unknown/?mode=full): ${modeDefaultFull ? "PASS" : "FAIL"}`);
console.log(`  display mode ?mode=webi (+ alias webinar) sets data-mode=webi: ${modeWebiOk ? "PASS" : "FAIL"}`);
console.log(`  html data-mode=full + display-mode.js sync: ${htmlModeDefault && htmlModeScript ? "PASS" : "FAIL"}`);
console.log(`  webi hides non-#sec-prod boxes (hero/cost/value/disclaimers): ${htmlAllowlist ? "PASS" : "FAIL"}`);
console.log(`  CSS data-mode hooks + badge FR « Mode webi »: ${cssHidesFull && cssHidesWebiOnly && htmlWebiBadge ? "PASS" : "FAIL"}`);
console.log(`  runbook live URL ?mode=webi (bare=full): ${runbookWebiLink ? "PASS" : "FAIL"}`);
console.log(`  app.js re-exports SolarDisplayMode: ${appWiresMode ? "PASS" : "FAIL"}`);
console.log(`  prod pill kWh/jour then kWh/an, no ≈: ${prodPillDay && prodPillAnnual && prodNoWave ? "PASS" : "FAIL"}`);
console.log(`  prod pill jour+an same .big type: ${prodPillEqualType ? "PASS" : "FAIL"}`);
console.log(`  prod pill puissance unit kWc: ${prodKwC ? "PASS" : "FAIL"}`);
console.log(`  daily = annual/365 rounded (6874→${dayFromAnnual}): ${dayOk ? "PASS" : "FAIL"}`);

/** Same 2-sig-fig display helper as app.js (sec-prod only) */
function sig2Round(n) {
  const x = Number(n);
  if (!isFinite(x)) return NaN;
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const exp = Math.floor(Math.log10(abs));
  const factor = Math.pow(10, exp - 1);
  return sign * Math.round(abs / factor) * factor;
}
function fmtSig2(n) {
  if (!isFinite(n)) return "—";
  const rounded = sig2Round(n);
  if (!isFinite(rounded)) return "—";
  const abs = Math.abs(rounded);
  const whole = Math.abs(rounded - Math.round(rounded)) <= 1e-9 * Math.max(1, abs);
  const exp = abs === 0 ? 0 : Math.floor(Math.log10(abs));
  const decimals = whole ? 0 : Math.max(0, 1 - exp);
  return rounded.toLocaleString("fr-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
const sigCases = [
  [14230, 14000],
  [874, 870],
  [19, 19],
  [12.53, 13],
  [6.4, 6.4],
  [180.23, 180],
  [6874, 6900]
];
const sig2RoundOk = sigCases.every(([raw, expect]) => Math.abs(sig2Round(raw) - expect) < 1e-9);
const fmt14230 = fmtSig2(14230);
const fmt14230Compact = fmt14230.replace(/\s/g, "");
const fmt14230Ok = Math.abs(sig2Round(14230) - 14000) < 1e-9 && (fmt14230Compact === "14000" || /14\s*000/.test(fmt14230));
const prodUsesSig2 =
  app.includes("fmtSig2(r.kWhDay)") &&
  app.includes("fmtSig2(r.kWh)") &&
  app.includes("fmtSig2(r.kW)") &&
  app.includes("fmtSig2(lossPct)") &&
  app.includes("fmtSig2(r.W * 100)") &&
  !/\$\("outKwh"\)\.textContent = fmtNum/.test(app);
console.log(`  sig2Round table 14230→14000, 874→870, 12.53→13: ${sig2RoundOk ? "PASS" : "FAIL"}`);
console.log(`  fmtSig2(14230) → ${JSON.stringify(fmt14230)} (expect 14 000 / 14000): ${fmt14230Ok ? "PASS" : "FAIL"}`);
console.log(`  sec-prod render uses fmtSig2 only: ${prodUsesSig2 ? "PASS" : "FAIL"}`);

const nowBug = 1700000000000;
const bugGood = {
  bug: "Le total kWh ne bouge pas",
  name: "",
  openedAt: nowBug - 3000,
  honeypot: "",
  context: { url: "https://trizam.github.io/x/?mode=webi", mode: "webi", version: "0.2", calc: { kW: 6.4 }, userAgent: "TestUA", timestamp: "2026-09-08T00:00:00.000Z" }
};
const bugValidOk = validateBugPayload(bugGood, nowBug).ok === true;
const bugHpReject = validateBugPayload(Object.assign({}, bugGood, { honeypot: "http://spam" }), nowBug).reason === "honeypot";
const bugMinReject = validateBugPayload(Object.assign({}, bugGood, { bug: "court" }), nowBug).reason === "bug-min";
const bugFastReject = validateBugPayload(Object.assign({}, bugGood, { openedAt: nowBug }), nowBug).reason === "too-fast";
const builtIssue = buildBugIssue(bugGood, validateBugPayload(bugGood, nowBug));
const namedPayload = Object.assign({}, bugGood, { name: "Fred" });
const namedIssue = buildBugIssue(namedPayload, validateBugPayload(namedPayload, nowBug));
const bugIssueShape =
  builtIssue &&
  builtIssue.title.indexOf("[user-report] ") === 0 &&
  builtIssue.title.length <= 12 + 72 &&
  builtIssue.labels.indexOf("user-report") >= 0 &&
  builtIssue.labels.indexOf("bug") >= 0 &&
  builtIssue.body.indexOf("## Bug") >= 0 &&
  builtIssue.body.indexOf("## Nom") >= 0 &&
  builtIssue.body.indexOf("## Contexte") >= 0 &&
  builtIssue.body.indexOf("```json") >= 0 &&
  builtIssue.body.indexOf("## Correction souhaitée") < 0 &&
  /## Nom\s+—/.test(builtIssue.body) &&
  namedIssue &&
  namedIssue.body.indexOf("Fred") >= 0;
const clientIssueFn =
  app.includes("function bugReportEndpoint") &&
  app.includes('meta[name="bug-report-endpoint"]') &&
  app.includes("fetch(endpoint") &&
  !app.includes("Authorization") &&
  !app.includes("/dispatches") &&
  !app.includes("api.github.com/repos");
const hpReq = new Request("https://example.test/bug", {
  method: "POST",
  headers: { Origin: "https://trizam.github.io", "Content-Type": "application/json" },
  body: JSON.stringify(Object.assign({}, bugGood, { honeypot: "bot" }))
});
const hpRes = await handleBugReportRequest(hpReq, {});
const hpJson = await hpRes.json();
const bugHpIgnoredPath = hpRes.status === 200 && hpJson.ok === true && hpJson.ignored === true;
const minReq = new Request("https://example.test/bug", {
  method: "POST",
  headers: { Origin: "https://trizam.github.io", "Content-Type": "application/json" },
  body: JSON.stringify(Object.assign({}, bugGood, { bug: "court" }))
});
const minRes = await handleBugReportRequest(minReq, {});
const minJson = await minRes.json();
const bugMinPath = minRes.status === 400 && minJson.error === "bug-min";
const noTokRes = await handleBugReportRequest(
  new Request("https://example.test/bug", {
    method: "POST",
    headers: { Origin: "https://trizam.github.io", "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({}, bugGood, { openedAt: Date.now() - 3000 }))
  }),
  {}
);
const noTokJson = await noTokRes.json();
const bugNoTokenPath = noTokRes.status === 503 && noTokJson.error === "not-configured";
const optRes = await handleBugReportRequest(
  new Request("https://example.test/bug", {
    method: "OPTIONS",
    headers: { Origin: "https://trizam.github.io" }
  }),
  {}
);
const bugCors =
  optRes.status === 204 &&
  optRes.headers.get("Access-Control-Allow-Origin") === "https://trizam.github.io" &&
  String(optRes.headers.get("Access-Control-Allow-Methods") || "").indexOf("POST") >= 0;
const nfHp = await netlifyBugHandler({
  httpMethod: "POST",
  headers: { Origin: "https://trizam.github.io", "Content-Type": "application/json" },
  body: JSON.stringify(Object.assign({}, bugGood, { honeypot: "bot" })),
  path: "/api/bug-report",
  rawUrl: "https://example.test/api/bug-report"
});
const nfHpJson = JSON.parse(nfHp.body);
const netlifyApiFn =
  existsSync(join(__dirname, "api/bug-report.mjs")) &&
  nfHp.statusCode === 200 &&
  nfHpJson.ok === true &&
  nfHpJson.ignored === true;
const bugModalIdx = html.indexOf('id="bugModal"');
const bugModalTag = bugModalIdx >= 0 ? html.slice(Math.max(0, bugModalIdx - 50), bugModalIdx + 90) : "";
const footerOpen =
  html.includes('id="bugModal"') &&
  html.includes('id="bugText"') &&
  html.includes("Description du bug") &&
  html.includes("Votre nom (si vous désirez)") &&
  html.includes('id="bugName"') &&
  !html.includes('id="bugFix"') &&
  html.includes("réparation désirée") &&
  html.includes('id="bugHp"') &&
  /<footer class="bug">/.test(html) &&
  !/<footer class="bug[^"]*mode-full-only/.test(html) &&
  bugModalTag.includes("modal-backdrop") &&
  !bugModalTag.includes("mode-full-only") &&
  !html.includes("Un champ suffit") &&
  !html.includes("pas besoin de compte GitHub") &&
  html.includes("btnBugSubmit") &&
  html.includes("Envoyer") &&
  !html.includes("Annuler") &&
  !html.includes("btnBugCancel") &&
  html.includes("Signale un bug, une erreur de calcul ou une amélioration") &&
  html.includes('id="bugLink"') &&
  !html.includes('id="bugLink2"') &&
  !html.includes("Un chiffre te semble off") &&
  !html.includes("on apprend ensemble") &&
  !html.includes('title="Signaler un bug"');
const bugJsWired =
  app.includes("function openBugReport") &&
  app.includes("function validateBugReport") &&
  app.includes("function bugReportEndpoint") &&
  app.includes("bug-report-endpoint") &&
  app.includes("honeypot") &&
  app.includes("userAgent") &&
  app.includes("Signalement temporairement indisponible") &&
  !app.includes("function reportBug") &&
  !app.includes("mailtoBugHref") &&
  !app.includes("mailto:hello@solutionera.com") &&
  !app.includes("bug-report-token") &&
  !app.includes("Authorization") &&
  !app.includes("function buildGithubIssue") &&
  !app.includes("## Correction souhaitée") &&
  !app.includes("btnBugCancel");
const bugMobileCss =
  html.includes('class="modal-backdrop info-sheet" id="bugModal"') &&
  css.includes(".info-sheet") &&
  css.includes(".sheet-form") &&
  /max-height:\s*min\(88dvh/.test(css) &&
  /\.info-sheet \.modal-card\s*\{[\s\S]{0,280}?max-width:\s*520px/.test(css) &&
  /\.info-sheet \.modal-card\s*\{[\s\S]{0,280}?border-radius:\s*16px/.test(css) &&
  /min-height:\s*48px/.test(css) &&
  !html.includes("bug-modal") &&
  !css.includes(".bug-modal");
const htmlEndpointMeta = /<meta name="bug-report-endpoint" content="https:\/\//.test(html);
const noTokenInFrontend =
  htmlEndpointMeta &&
  !html.includes("bug-report-token") &&
  !app.includes("bug-report-token") &&
  !app.includes("ghp_") &&
  !html.includes("ghp_") &&
  !html.includes("github_pat_") &&
  !app.includes("github_pat_");
const bugDocsSrc = readFileSync(join(__dirname, "docs/BUG_REPORTS.md"), "utf8");
const bugDocs =
  existsSync(join(__dirname, "docs/BUG_REPORTS.md")) &&
  existsSync(join(__dirname, "api/bug-report.mjs")) &&
  existsSync(join(__dirname, "functions/bug-report.js")) &&
  existsSync(join(__dirname, "wrangler.toml")) &&
  existsSync(join(__dirname, ".gitignore")) &&
  bugDocsSrc.includes("label:user-report") &&
  bugDocsSrc.includes("api/bug-report") &&
  !bugDocsSrc.includes("github_pat_");
const bugWorkflowSrc = readFileSync(join(__dirname, ".github/workflows/bug-report.yml"), "utf8");
const bugWorkflow =
  bugWorkflowSrc.includes("calculateur-bug") &&
  bugWorkflowSrc.includes("workflow_dispatch") &&
  bugWorkflowSrc.includes("context_json") &&
  bugWorkflowSrc.includes("actions/github-script") &&
  bugWorkflowSrc.includes("user-report") &&
  bugWorkflowSrc.includes("github-token:") &&
  bugWorkflowSrc.includes("issues.create") &&
  !bugWorkflowSrc.includes("repository_dispatch") &&
  !bugWorkflowSrc.includes("github.rest.repos") &&
  !bugWorkflowSrc.includes("github.rest.actions");
console.log(`  bug payload valid / honeypot / min / too-fast: ${bugValidOk && bugHpReject && bugMinReject && bugFastReject ? "PASS" : "FAIL"}`);
console.log(`  bug issue title+labels+sections: ${bugIssueShape && clientIssueFn ? "PASS" : "FAIL"}`);
console.log(`  honeypot ignored path (200 ok ignored): ${bugHpIgnoredPath ? "PASS" : "FAIL"}`);
console.log(`  proxy validate min / no-token / CORS: ${bugMinPath && bugNoTokenPath && bugCors ? "PASS" : "FAIL"}`);
console.log(`  api/bug-report Netlify handler: ${netlifyApiFn ? "PASS" : "FAIL"}`);
console.log(`  bug modal in footer (visible webi): ${footerOpen ? "PASS" : "FAIL"}`);
console.log(`  bug modal same info-sheet floating card: ${bugMobileCss ? "PASS" : "FAIL"}`);
console.log(`  app.js modal wired, no mailto-first: ${bugJsWired ? "PASS" : "FAIL"}`);
console.log(`  no GitHub token in frontend: ${noTokenInFrontend ? "PASS" : "FAIL"}`);
console.log(`  bug-report docs + worker + Action: ${bugDocs && bugWorkflow ? "PASS" : "FAIL"}`);

const pass =
  ok &&
  !bad &&
  annualOk &&
  cellsOk &&
  wTiltOk &&
  hasFetch &&
  hasFallback &&
  hasFormula &&
  hasTiltW &&
  usesTiltWInCalc &&
  has24az &&
  hasGridLoading &&
  hasFallbackAny &&
  hasPasteArea &&
  hasBlurArea &&
  hasRoundArea &&
  hasModalScroll &&
  hasIntegerLive &&
  passA &&
  passB &&
  clampPass &&
  paybackUsesCap &&
  labelOk &&
  liveBeside &&
  liveFmt &&
  appLive &&
  verOk &&
  buildShaOk &&
  brandDefi &&
  noMtlHard &&
  noBadge &&
  noQcHero &&
  orientLabel &&
  orient24 &&
  has195 &&
  areaInt &&
  logoOk &&
  taxes15 &&
  logisDefault &&
  logisCopy &&
  subvDefaultJs &&
  noBattery &&
  infoBtn &&
  tiltViz &&
  gridStatusUi &&
  sliderLeft &&
  prodControlGrid &&
  tiltSlider &&
  subtitlePad &&
  fieldHairline &&
  safariFix &&
  modalCss &&
  noMtlAssets &&
  discTiltW &&
  lossOk &&
  hasSkipFocus &&
  hasGridRetry &&
  hasAriaPressed &&
  safariRowTouch &&
  safariUserSelect &&
  safeArea &&
  btnManipulation &&
  pageMargin &&
  modalDvh &&
  pdfPrintOnly &&
  hasPointerDrag &&
  thumb44 &&
  overscrollRow &&
  viewportFit &&
  tiltWLabel &&
  touchFallback &&
  dualTouchPointer &&
  gridRetryBtn &&
  gridReload &&
  beforePrint &&
  wrapAria &&
  touchCallout &&
  themeColor &&
  rate16 &&
  rowDrag &&
  rangeDragLock &&
  wrapInert &&
  docDragGuard &&
  gridUiStable &&
  noTelDetect &&
  pageShowClear &&
  hasConsoInput &&
  hasEcoNote &&
  hasCreditFn &&
  hasConsoWired &&
  defaultRateTtc &&
  hasRateInfoUi &&
  infoSheetUi &&
  orientVersantTip &&
  orientAzimuthHint &&
  orientPanelsLabel &&
  areaInstallLabel &&
  deneigeTip &&
  modeDefaultFull &&
  modeWebiOk &&
  htmlModeDefault &&
  htmlModeScript &&
  htmlAllowlist &&
  cssHidesFull &&
  cssHidesWebiOnly &&
  htmlWebiBadge &&
  runbookWebiLink &&
  appWiresMode &&
  prodPillDay &&
  prodPillAnnual &&
  prodPillEqualType &&
  prodKwC &&
  prodNoWave &&
  dayOk &&
  sig2RoundOk &&
  fmt14230Ok &&
  prodUsesSig2 &&
  bugValidOk &&
  bugHpReject &&
  bugMinReject &&
  bugFastReject &&
  bugIssueShape &&
  clientIssueFn &&
  bugHpIgnoredPath &&
  bugMinPath &&
  bugNoTokenPath &&
  bugCors &&
  netlifyApiFn &&
  footerOpen &&
  bugMobileCss &&
  bugJsWired &&
  noTokenInFrontend &&
  bugDocs &&
  bugWorkflow;

console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
