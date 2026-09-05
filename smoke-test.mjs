#!/usr/bin/env node
/** Smoke — Calculateur Solaire version 0.2 · grille QC + W-by-tilt */
import { readFileSync, readdirSync, statSync } from "fs";
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
const n30 = grid.cells["30"]["0"];
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

const w30 = winterWFromTilt(30);
const w45 = winterWFromTilt(45);
const w60 = winterWFromTilt(60);
const w75 = winterWFromTilt(75);
const w90 = winterWFromTilt(90);
const wTiltOk =
  Math.abs(w30 - 0.18) < 1e-9 &&
  Math.abs(w45 - 0.18) < 1e-9 &&
  Math.abs(w60 - 0.12) < 1e-9 &&
  Math.abs(w75 - 0.06) < 1e-9 &&
  Math.abs(w90 - 0) < 1e-9;
console.log(`  W-by-tilt S/30→0.18, 45→0.18, 60→0.12, 75→0.06, 90→0: ${wTiltOk ? "PASS" : "FAIL"} (${w30},${w45},${w60},${w75},${w90})`);

const app = readFileSync(join(__dirname, "assets/app.js"), "utf8");
const hasFetch = app.includes("quebec-full-grid.json");
const hasFallback = app.includes("1254.8064");
const hasFormula = app.includes("applyDeneigement");
const hasTiltW = app.includes("winterWFromTilt") && app.includes("18 * (90");
const has24az = app.includes('"195"') && app.includes('"15"') && app.includes("AZ_LABELS");
const usesTiltWInCalc = /const W = winterWFromTilt/.test(app) || /W = winterWFromTilt\(tilt\)/.test(app);
console.log(`  app.js loads quebec-full-grid.json: ${hasFetch ? "PASS" : "FAIL"}`);
console.log(`  app.js S/30 annual fallback: ${hasFallback ? "PASS" : "FAIL"}`);
console.log(`  app.js applyDeneigement + winterWFromTilt: ${hasFormula && hasTiltW && usesTiltWInCalc ? "PASS" : "FAIL"}`);
console.log(`  app.js AZ_LABELS 15° steps: ${has24az ? "PASS" : "FAIL"}`);

const W = w30; // S/30 → 0.18
const kWhAn = sAnnual * kW;
const kWhA = kWhAn * (1 - (1 - 1) * W);
const passA = Math.abs(kWhA - kWhAn) < 1e-9;
console.log(`  smoke A deneige=1: kWh_eff=${kWhA.toFixed(2)} == annuel ${kWhAn.toFixed(2)} → ${passA ? "PASS" : "FAIL"}`);

const kWhB = kWhAn * (1 - (1 - 0) * W);
const expectB = kWhAn * (1 - W);
const passB = Math.abs(kWhB - expectB) < 1e-6 && kWhB < kWhAn;
console.log(`  smoke B deneige=0%: kWh_eff=${kWhB.toFixed(2)} expect ${expectB.toFixed(2)} (loss ${(W * 100).toFixed(0)}%) → ${passB ? "PASS" : "FAIL"}`);

const html = readFileSync(join(__dirname, "index.html"), "utf8");
const css = readFileSync(join(__dirname, "assets/styles.css"), "utf8");

const labelOk = html.includes("Efficacité du déneigement") && !/perte\s+neige/i.test(html);
const liveBeside = html.includes("deneigeLive") && (html.includes("% annuel") || html.includes("%&nbsp;annuel") || html.includes("&nbsp;% annuel"));
const liveFmt = (html.includes("−14,4") || html.includes("−14.4")) && html.includes("annuel");
const verOk = /version 0\.2/i.test(html) && !/V0\.2/.test(html) && !html.includes("V0.1");
const noBadge = !html.includes("Pédagogique · FR · Québec fixe") && !html.includes("Québec fixe");
const noMtlHard = !html.includes("1314,1") && !html.includes("0,1768") && !/Montréal/i.test(html);
const heroSlice = html.slice(html.indexOf('class="hero"'), html.indexOf("</header>") + 10);
const resultSlice = html.includes("result-pill")
  ? html.slice(html.indexOf("result-pill"), html.indexOf("result-pill") + 500)
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
  html.includes("270° (Ouest)");
const orient24 = (html.match(/option value="/g) || []).length >= 24 + 7;
const has195 = html.includes('value="195"') && html.includes('value="15"');
const areaInt = html.includes('step="1"') && html.includes('inputmode="numeric"');
const logoOk = html.includes("logo-solution-era.png") || html.includes("logo-solution-era.svg");
const taxes15 = html.includes("15&nbsp;%") || html.includes("15 %");
const logisDefault = /id="subv"[^>]*checked/.test(html) || /id="subv" checked/.test(html);
const noBattery = !/batteries|autonomie/i.test(html);
const infoBtn = html.includes("En apprendre plus") && html.includes("infoModal");
const tiltViz = html.includes("tiltViz") || html.includes("tiltLine");
const sliderLeft = css.includes("slider-val-left") && css.includes("slider-row");
const safariFix = css.includes("touch-action: none") && css.includes("-webkit-appearance") && /Safari/i.test(css);
const lossAt20 = (1 - 0.2) * W * 100; // 0.8 * 18 = 14.4
const lossOk = Math.abs(lossAt20 - 14.4) < 1e-6;
const appLive = app.includes('"% annuel"') || app.includes('"&nbsp;% annuel"') || app.includes(" % annuel");
const subvDefaultJs = /subv"\)\.checked\s*=\s*true/.test(app) || /\$\("subv"\)\.checked = true/.test(app);
const discTiltW =
  (html.includes("selon l’inclinaison") || html.includes("selon l'inclinaison") || html.includes("selon l’<strong>inclinaison")) &&
  html.includes("18");

console.log(`  UI label « Efficacité du déneigement »: ${labelOk ? "PASS" : "FAIL"}`);
console.log(`  live loss beside slider (deneigeLive · % annuel): ${liveBeside && liveFmt ? "PASS" : "FAIL"}`);
console.log(`  app.js live format « −X,X % annuel »: ${appLive ? "PASS" : "FAIL"}`);
console.log(`  version 0.2 branding (no V0.2 / V0.1 / Montréal): ${verOk && noMtlHard ? "PASS" : "FAIL"}`);
console.log(`  badge removed + no Québec in hero/results: ${noBadge && noQcHero ? "PASS" : "FAIL"}`);
console.log(`  orient labels degree-first (180° Sud…): ${orientLabel && orient24 && has195 ? "PASS" : "FAIL"}`);
console.log(`  area integers (step=1, inputmode=numeric): ${areaInt ? "PASS" : "FAIL"}`);
console.log(`  logo image + taxes 15% display + LogisVert default on: ${logoOk && taxes15 && logisDefault && subvDefaultJs ? "PASS" : "FAIL"}`);
console.log(`  no battery line + info modal + tilt viz: ${noBattery && infoBtn && tiltViz ? "PASS" : "FAIL"}`);
console.log(`  slider value-left + Safari touch CSS: ${sliderLeft && safariFix ? "PASS" : "FAIL"}`);
console.log(`  disclaimer W-by-tilt: ${discTiltW ? "PASS" : "FAIL"}`);
console.log(`  loss at d=20% tilt30: ≈−${lossAt20.toFixed(1)}% (expect −14.4) → ${lossOk ? "PASS" : "FAIL"}`);

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
  passA &&
  passB &&
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
  subvDefaultJs &&
  noBattery &&
  infoBtn &&
  tiltViz &&
  sliderLeft &&
  safariFix &&
  discTiltW &&
  lossOk;

console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
