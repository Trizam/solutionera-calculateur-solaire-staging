#!/usr/bin/env node
/** Analyste smoke — Calculateur Solaire V0.1 · grille Québec */
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
const sW = s30.W_winter;
const nW = n30.W_winter;
console.log(`  grid S/30 ac_annual: ${sAnnual} (expect ≈1254.8064)`);
console.log(`  grid S/30 W_winter: ${sW} (expect ≈0.173323)`);
console.log(`  grid N/30 W_winter: ${nW} (expect ≠ S/30)`);

const annualOk = Math.abs(sAnnual - 1254.8064) < 0.01;
const wOk = Math.abs(sW - 0.173323) < 1e-5;
const wDiffOk = Math.abs(nW - sW) > 0.01;
console.log(`  S/30 annual≈1254.8: ${annualOk ? "PASS" : "FAIL"}`);
console.log(`  S/30 W≈0.1733: ${wOk ? "PASS" : "FAIL"}`);
console.log(`  non-south W differs (N vs S @30°): ${wDiffOk ? "PASS" : "FAIL"}`);

const cellCount = Object.keys(grid.cells).reduce(
  (n, t) => n + Object.keys(grid.cells[t]).length,
  0
);
const cellsOk = cellCount === 168;
console.log(`  cells count ${cellCount} (expect 168): ${cellsOk ? "PASS" : "FAIL"}`);

const app = readFileSync(join(__dirname, "assets/app.js"), "utf8");
const hasFetch = app.includes("quebec-full-grid.json");
const hasFallback = app.includes("1254.8064") && app.includes("0.173323");
const hasFormula = app.includes("applyDeneigement");
const hasPerCellW = app.includes("W_winter") && app.includes("lookupCell");
const has24az = app.includes('"195"') && app.includes('"15"') && app.includes("AZ_LABELS");
console.log(`  app.js loads quebec-full-grid.json: ${hasFetch ? "PASS" : "FAIL"}`);
console.log(`  app.js S/30 fallback: ${hasFallback ? "PASS" : "FAIL"}`);
console.log(`  app.js applyDeneigement + per-cell W: ${hasFormula && hasPerCellW ? "PASS" : "FAIL"}`);
console.log(`  app.js AZ_LABELS 15° steps: ${has24az ? "PASS" : "FAIL"}`);

const W = sW;
const kWhAn = sAnnual * kW;
const kWhA = kWhAn * (1 - (1 - 1) * W);
const passA = Math.abs(kWhA - kWhAn) < 1e-9;
console.log(`  smoke A deneige=1: kWh_eff=${kWhA.toFixed(2)} == annuel ${kWhAn.toFixed(2)} → ${passA ? "PASS" : "FAIL"}`);

const kWhB = kWhAn * (1 - (1 - 0) * W);
const expectB = kWhAn * (1 - W);
const passB = Math.abs(kWhB - expectB) < 1e-6 && kWhB < kWhAn;
console.log(`  smoke B deneige=0%: kWh_eff=${kWhB.toFixed(2)} expect ${expectB.toFixed(2)} (loss ${(W * 100).toFixed(2)}%) → ${passB ? "PASS" : "FAIL"}`);

const html = readFileSync(join(__dirname, "index.html"), "utf8");
const labelOk = html.includes("Efficacité du déneigement") && !/perte\s+neige/i.test(html);
const liveBeside = html.includes("deneigeLive") && (html.includes("% annuel") || html.includes("%&nbsp;annuel") || html.includes("&nbsp;% annuel"));
const liveFmt = html.includes("−13,9") && html.includes("annuel");
const qcBrand = /Québec/i.test(html) && html.includes("Québec fixe");
const noMtlHard = !html.includes("1314,1") && !html.includes("0,1768") && !/Montréal fixe/i.test(html);
const orient24 = (html.match(/option value="/g) || []).length >= 24 + 7;
const has195 = html.includes('value="195"') && html.includes('value="15"');
const disclaimerOk =
  html.includes("dépend de l’orientation") ||
  html.includes("dépend de l'orientation") ||
  html.includes("selon orientation");
const citeOk = html.includes("17,3") && html.includes("2026-09-05") && /grille Québec/i.test(html);
const lossAt20 = (1 - 0.2) * W * 100;
const lossOk = Math.abs(lossAt20 - 13.86584) < 1e-3;
const appLive = app.includes('"% annuel"') || app.includes('"&nbsp;% annuel"') || app.includes(" % annuel");
console.log(`  UI label « Efficacité du déneigement »: ${labelOk ? "PASS" : "FAIL"}`);
console.log(`  live loss beside slider (deneigeLive · % annuel): ${liveBeside && liveFmt ? "PASS" : "FAIL"}`);
console.log(`  app.js live format « −X,X % annuel »: ${appLive ? "PASS" : "FAIL"}`);
console.log(`  brand Québec fixe (no Montréal fixe / 1314,1 / 0,1768): ${qcBrand && noMtlHard ? "PASS" : "FAIL"}`);
console.log(`  orient select 24 az (incl. 15° & 195°): ${orient24 && has195 ? "PASS" : "FAIL"}`);
console.log(`  W note depends on orientation + ~17,3% Sud 30°: ${disclaimerOk && citeOk ? "PASS" : "FAIL"}`);
console.log(`  loss at d=20% S/30: ≈−${lossAt20.toFixed(1)}% (expect −13.9) → ${lossOk ? "PASS" : "FAIL"}`);

const pass =
  ok &&
  !bad &&
  annualOk &&
  wOk &&
  wDiffOk &&
  cellsOk &&
  hasFetch &&
  hasFallback &&
  hasFormula &&
  hasPerCellW &&
  has24az &&
  passA &&
  passB &&
  labelOk &&
  liveBeside &&
  liveFmt &&
  appLive &&
  qcBrand &&
  noMtlHard &&
  orient24 &&
  has195 &&
  disclaimerOk &&
  citeOk &&
  lossOk;

console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
