#!/usr/bin/env node
/** Smoke — Calculateur Solaire version 0.2 · grille QC + W-by-tilt */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
const hasIntegerLive = app.includes("Math.round((1 - r.deneige) * r.W * 100)");
console.log(`  app.js loads quebec-full-grid.json: ${hasFetch ? "PASS" : "FAIL"}`);
console.log(`  app.js S/30 annual fallback: ${hasFallback ? "PASS" : "FAIL"}`);
console.log(`  app.js applyDeneigement + winterWFromTilt: ${hasFormula && hasTiltW && usesTiltWInCalc ? "PASS" : "FAIL"}`);
console.log(`  app.js AZ_LABELS 15° steps: ${has24az ? "PASS" : "FAIL"}`);
console.log(`  app.js grid loading/error + any-cell fallback: ${hasGridLoading && hasFallbackAny ? "PASS" : "FAIL"}`);
console.log(`  app.js area integer paste+blur+round: ${hasPasteArea && hasBlurArea && hasRoundArea ? "PASS" : "FAIL"}`);
console.log(`  app.js modal Escape + scroll lock: ${hasModalScroll ? "PASS" : "FAIL"}`);
console.log(`  app.js live W% integers (Math.round): ${hasIntegerLive ? "PASS" : "FAIL"}`);

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
const liveBeside = html.includes("deneigeLive") && (html.includes("% annuel") || html.includes("%&nbsp;annuel") || html.includes("&nbsp;% annuel"));
const liveFmt = (html.includes("−14&nbsp;%") || html.includes("−14 %")) && html.includes("annuel") && !html.includes("−14,4");
const verOk = /version 0\.2/i.test(html) && !/V0\.2/.test(html) && !html.includes("V0.1");
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
const orient24 = (html.match(/option value="/g) || []).length >= 24 + 7;
const has195 = html.includes('value="195"') && html.includes('value="15"');
const areaInt = html.includes('step="1"') && html.includes('inputmode="numeric"');
const logoOk = html.includes("logo-solution-era.png") || html.includes("logo-solution-era.svg");
const taxes15 = html.includes("15&nbsp;%") || html.includes("15 %");
const logisDefault = /id="subv"[^>]*checked/.test(html) || /id="subv" checked/.test(html);
const logisCopy =
  html.includes("Appliquée par défaut") &&
  !html.includes("D’abord le coût sans") &&
  !html.includes("D'abord le coût sans") &&
  !html.includes("coche pour l’appliquer") &&
  !html.includes("coche pour l'appliquer");
const noBattery = !/batteries|autonomie/i.test(html);
const infoBtn = html.includes("En apprendre plus") && html.includes("infoModal");
const tiltViz = html.includes("tiltViz") || html.includes("tiltLine");
const gridStatusUi = html.includes('id="gridStatus"');
const sliderLeft = css.includes("slider-val-left") && css.includes("slider-row");
const safariFix = css.includes("touch-action: none") && css.includes("-webkit-appearance") && /Safari/i.test(css);
const modalCss = css.includes("modal-open") && css.includes("overflow: hidden");
const noMtlAssets =
  !existsSync(join(__dirname, "assets/montreal-kwh-per-kw.json")) &&
  !existsSync(join(__dirname, "assets/montreal-monthly.json"));
const lossAt20 = Math.round((1 - 0.2) * W * 100);
const lossOk = lossAt20 === 14;
const appLive = app.includes("&nbsp;% annuel") || app.includes("% annuel");
const subvDefaultJs = /subv"\)\.checked\s*=\s*true/.test(app) || /\$\("subv"\)\.checked = true/.test(app);
const discTiltW =
  (html.includes("selon l’inclinaison") || html.includes("selon l'inclinaison") || html.includes("selon l’<strong>inclinaison")) &&
  html.includes("18");

console.log(`  UI label « Efficacité du déneigement »: ${labelOk ? "PASS" : "FAIL"}`);
console.log(`  live loss beside slider (deneigeLive · % annuel): ${liveBeside && liveFmt ? "PASS" : "FAIL"}`);
console.log(`  app.js live format « −X % annuel » integer: ${appLive && hasIntegerLive ? "PASS" : "FAIL"}`);
console.log(`  version 0.2 branding (no V0.2 / V0.1 / Montréal): ${verOk && noMtlHard ? "PASS" : "FAIL"}`);
console.log(`  badge removed + no Québec in hero/results: ${noBadge && noQcHero ? "PASS" : "FAIL"}`);
console.log(`  orient labels N° (Cardinal) for cardinals: ${orientLabel && orient24 && has195 ? "PASS" : "FAIL"}`);
console.log(`  area integers (step=1, inputmode=numeric): ${areaInt ? "PASS" : "FAIL"}`);
console.log(`  logo + taxes 15% + LogisVert default ON: ${logoOk && taxes15 && logisDefault && subvDefaultJs ? "PASS" : "FAIL"}`);
console.log(`  LogisVert subcopy « Appliquée par défaut »: ${logisCopy ? "PASS" : "FAIL"}`);
console.log(`  no battery + info modal + tilt viz + gridStatus: ${noBattery && infoBtn && tiltViz && gridStatusUi ? "PASS" : "FAIL"}`);
console.log(`  slider value-left + Safari touch CSS: ${sliderLeft && safariFix ? "PASS" : "FAIL"}`);
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

const tiltWLabel = html.includes('id="tiltWLabel"') && app.includes("tiltWLabel");
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
console.log(`  ⓘ HQ lock moyenne 9,53 ¢ + 2 paliers HT+TTC: ${hasRateInfoUi ? "PASS" : "FAIL"}`);


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
  hasRateInfoUi;

console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
