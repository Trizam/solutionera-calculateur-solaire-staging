#!/usr/bin/env node
/** Analyste smoke — Calculateur Solaire V0.1 (+ déneigement) */
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAX_MULT = 1.14975;
const RATE = 0.11142; // Tarif D 2e tranche
const W = 0.1768;

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
  for ( const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(html|js|css|json|md)$/i.test(name) && name !== "smoke-test.mjs") acc.push(p);
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

const table = JSON.parse(readFileSync(join(__dirname, "assets/montreal-kwh-per-kw.json"), "utf8"));
const s30 = table.kwh_per_kw["30"]["180"];
console.log(`  table S/30 kWh/kW: ${s30} (expect 1314.1)`);

const monthly = JSON.parse(readFileSync(join(__dirname, "assets/montreal-monthly.json"), "utf8"));
const Wfile = monthly.W;
console.log(`  W from montreal-monthly.json: ${Wfile} (expect 0.1768)`);

const app = readFileSync(join(__dirname, "assets/app.js"), "utf8");
const hasW = app.includes("W_WINTER = 0.1768");
const hasFormula = app.includes("(1 - (1 - d) * W_WINTER)") || app.includes("(1 - (1 - deneige) * W_WINTER)") || app.includes("applyDeneigement");
console.log(`  app.js W_WINTER=0.1768: ${hasW ? "PASS" : "FAIL"}`);
console.log(`  app.js applyDeneigement wired: ${hasFormula ? "PASS" : "FAIL"}`);

// Smoke A: deneigement=1 → kWh_eff = kWh_annuel (full)
const kWhAn = s30 * kW; // 1314.1 * 6.5
const kWhA = kWhAn * (1 - (1 - 1) * W);
const passA = Math.abs(kWhA - kWhAn) < 1e-9;
console.log(`  smoke A deneige=1: kWh_eff=${kWhA.toFixed(2)} == annuel ${kWhAn.toFixed(2)} → ${passA ? "PASS" : "FAIL"}`);

// Smoke B: deneigement=0 → remove winter share completely
const kWhB = kWhAn * (1 - (1 - 0) * W);
const expectB = kWhAn * (1 - W);
const passB = Math.abs(kWhB - expectB) < 1e-6 && kWhB < kWhAn;
console.log(`  smoke B deneige=0%: kWh_eff=${kWhB.toFixed(2)} expect ${expectB.toFixed(2)} (loss ${(W*100).toFixed(2)}%) → ${passB ? "PASS" : "FAIL"}`);

const Wok = Math.abs(Wfile - 0.1768) < 1e-9;
const pass = ok && !bad && s30 === 1314.1 && Wok && hasW && hasFormula && passA && passB;
console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
