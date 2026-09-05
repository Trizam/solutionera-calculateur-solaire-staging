#!/usr/bin/env node
/** Analyste smoke — Calculateur Solaire V0.1 */
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAX_MULT = 1.14975;
const RATE = 0.11142; // Tarif D 2e tranche

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
}
console.log(`  no ${forbiddenA} / ${forbiddenB} in product files: ${bad ? "FAIL" : "PASS"}`);

const table = JSON.parse(readFileSync(join(__dirname, "assets/montreal-kwh-per-kw.json"), "utf8"));
const s30 = table.kwh_per_kw["30"]["180"];
console.log(`  table S/30 kWh/kW: ${s30} (expect 1314.1)`);
const pass = ok && !bad && s30 === 1314.1;
console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
