#!/usr/bin/env node
/** Smoke — Calculateur Solaire version 0.2 · grille QC + W-by-tilt */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { inflateSync } from "zlib";
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

function townDataReport() {
  const path = join(__dirname, "assets", "towns.json");
  if (!existsSync(path)) return { ok: false, detail: "missing assets/towns.json" };
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { ok: false, detail: "towns.json invalid JSON" };
  }
  const towns = doc && Array.isArray(doc.towns) ? doc.towns : [];
  const problems = [];
  if (towns.length !== 104) problems.push("count " + towns.length);
  const ids = new Set();
  let mrc = 0;
  let eq = 0;
  const names = towns.map((t) => t.name);
  const sorted = names.slice().sort((a, b) => String(a).localeCompare(String(b), "fr-CA", { sensitivity: "base" }));
  if (names.join("\n") !== sorted.join("\n")) problems.push("not fr-CA sorted");
  towns.forEach((t) => {
    if (!t.id || ids.has(t.id)) problems.push("id " + t.id);
    ids.add(t.id);
    if (t.type === "MRC") mrc += 1;
    else if (t.type === "Equivalent") eq += 1;
    else problems.push("type " + t.name);
    if (!(t.lat >= 44 && t.lat <= 63 && t.lon >= -80 && t.lon <= -56)) problems.push("coords " + t.name);
    if (!isFinite(Number(t.ac_annual_s30)) || Number(t.ac_annual_s30) < 600 || Number(t.ac_annual_s30) > 1800) {
      problems.push("s30 " + t.name + "=" + t.ac_annual_s30);
    }
    if (t.grid !== "full" && t.grid !== "scaled") problems.push("grid " + t.name);
    if (t.grid === "full") {
      const rel = t.grid_file || ("assets/town-grids/" + t.id + ".json");
      const file = join(__dirname, rel);
      if (!existsSync(file)) problems.push("missing grid file " + t.name);
      else {
        try {
          const g = JSON.parse(readFileSync(file, "utf8"));
          if (g.scaled === true) problems.push("full marked scaled " + t.name);
          const n = Object.keys(g.cells || {}).reduce((acc, tilt) => acc + Object.keys(g.cells[tilt] || {}).length, 0);
          if (n !== 168) problems.push("cells " + n + " " + t.name);
        } catch (_) {
          problems.push("bad grid " + t.name);
        }
      }
    }
  });
  if (mrc !== 87 || eq !== 17) problems.push(`MRC=${mrc} Equivalent=${eq}`);
  const qc = towns.find((t) => t.id === "quebec");
  if (!qc || Math.abs(Number(qc.ac_annual_s30) - 1254.8064) > 0.01) problems.push("québec s30");
  if (qc && (qc.lat !== 46.813 || qc.lon !== -71.208)) problems.push("québec coords");
  return { ok: problems.length === 0, detail: problems.slice(0, 8).join("; ") };
}
const townData = townDataReport();
const townDataOk = townData.ok;
console.log(`  towns.json 104 places, S/30, grids: ${townDataOk ? "PASS" : "FAIL"} ${townData.detail}`);

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
/** RGBA PNG (8-bit, non-interlaced). Used to prove the mark is not pre-cropped. */
function readPngRgba(path) {
  const buf = readFileSync(path);
  if (buf.length < 8 || buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`not a png: ${path}`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idats = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported png ${path}: bit=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(height * stride);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[i++];
      const left = x >= bpp ? rgba[row + x - bpp] : 0;
      const up = y > 0 ? rgba[row - stride + x] : 0;
      const ul = y > 0 && x >= bpp ? rgba[row - stride + x - bpp] : 0;
      let outByte = v;
      if (filter === 1) outByte = (v + left) & 255;
      else if (filter === 2) outByte = (v + up) & 255;
      else if (filter === 3) outByte = (v + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
        outByte = (v + pred) & 255;
      } else if (filter !== 0) {
        throw new Error(`bad png filter ${filter}`);
      }
      rgba[row + x] = outByte;
    }
  }
  return { width, height, rgba };
}

/** A cropped disc has a long flat side. A real circle only stays flat for a few pixels. */
function logoDiscIntact(path) {
  const { width, height, rgba } = readPngRgba(path);
  if (width !== height || width < 64) return false;
  const alphaAt = (x, y) => rgba[(y * width + x) * 4 + 3];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) > 20) {
        any = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!any) return false;
  const margin = Math.min(minX, minY, width - 1 - maxX, height - 1 - maxY);
  const longestFlat = (vals) => {
    let best = 1;
    let cur = 1;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] === vals[i - 1]) {
        cur += 1;
        if (cur > best) best = cur;
      } else {
        cur = 1;
      }
    }
    return best;
  };
  const rights = [];
  for (let y = 0; y < height; y++) {
    let right = -1;
    for (let x = width - 1; x >= 0; x--) {
      if (alphaAt(x, y) > 128) {
        right = x;
        break;
      }
    }
    if (right >= 0) rights.push(right);
  }
  const flat = longestFlat(rights);
  // ~14px padding on a 240 canvas. A clipped export touches the edge or stays flat for ~100 rows.
  return margin >= 8 && flat <= 20;
}

const logoBlocks = css.match(/\.brand-logo\b[^{]*\{[^}]*\}/g) || [];
const logoCssOk =
  logoBlocks.length >= 1 &&
  logoBlocks.every(
    (block) =>
      !/border-radius\s*:/.test(block) &&
      !/overflow\s*:\s*hidden/.test(block) &&
      !/object-fit\s*:\s*(cover|fill)/.test(block) &&
      !/image-rendering\s*:/.test(block) &&
      !/padding\s*:/.test(block)
  ) &&
  logoBlocks.some((block) => /object-fit\s*:\s*contain/.test(block));
const logoPngOk =
  logoDiscIntact(join(__dirname, "assets/logo-solution-era.png")) &&
  logoDiscIntact(join(__dirname, "favicon.png"));
const logoOk =
  html.includes("logo-solution-era.png") &&
  html.includes('class="brand-logo"') &&
  logoCssOk &&
  logoPngOk;
const taxes15 = html.includes("15&nbsp;%") || html.includes("15 %");
const logisDefault = /id="subv"[^>]*checked/.test(html) || /id="subv" checked/.test(html);
const logisCopy =
  html.includes("Appliquée par défaut") &&
  !html.includes("D’abord le coût sans") &&
  !html.includes("D'abord le coût sans") &&
  !html.includes("coche pour l’appliquer") &&
  !html.includes("coche pour l'appliquer");
const design = readFileSync(join(__dirname, "docs/DESIGN.md"), "utf8");
const designRules =
  html.includes("Combien coûte le solaire") &&
  html.includes('id="showDetails"') &&
  html.includes("Je veux les détails") &&
  html.indexOf('id="editorTools"') < html.indexOf('id="showDetails"') &&
  html.indexOf('id="showDetails"') < html.indexOf('id="showNotes"') &&
  !html.includes("page-tools") &&
  html.includes('id="showNotes"') &&
  html.includes('id="editorNotes" hidden') &&
  html.includes("docs/DESIGN.md") &&
  !html.includes("Loi des deux chiffres") &&
  /\.result-pair\s*\{[\s\S]{0,220}align-items:\s*start/.test(css) &&
  /\.cards\s*\{[\s\S]{0,220}align-items:\s*start/.test(css) &&
  app.includes("function fmtShown") &&
  design.includes("Loi des deux chiffres") &&
  design.includes("result-pill") &&
  design.includes("Je veux les détails") &&
  design.includes("seule") &&
  !design.includes("répétées dans le commentaire");
const batteryColumn =
  html.includes('data-slot="need"') &&
  html.includes('data-slot="fill"') &&
  html.includes('data-slot="batt"') &&
  html.includes('data-slot="total"') &&
  html.includes('id="consoJour"') &&
  html.includes('id="autoStop"') &&
  html.includes('id="battPrice"') &&
  html.includes('id="permaFlag"') &&
  html.includes('id="sec-yield"') &&
  !/id="sec-yield"[^>]*mode-full-only/.test(html) &&
  /mode-full-only[^>]*id="sec-auto"/.test(html) &&
  /mode-full-only[^>]*id="sec-fill"/.test(html) &&
  /mode-full-only[^>]*id="sec-batt"/.test(html) &&
  /mode-full-only[^>]*id="sec-total"/.test(html) &&
  /mode-full-only[^>]*id="permaFlag"/.test(html) &&
  /const years = eco > 0 \? reel \/ eco : Infinity;/.test(app);
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
  /\["util", "deneige", "priceW", "tilt"/.test(app);
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
const subvDefaultJs = /subv:\s*true/.test(app) && /\$\("subv"\)\.checked\s*=/.test(app);
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
console.log(`  battery column + design rules + info modal + tilt viz + gridStatus: ${batteryColumn && designRules && infoBtn && tiltViz && gridStatusUi ? "PASS" : "FAIL"}`);
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
const consoTag = (html.match(/<input[^>]*id="conso"[^>]*>/) || [""])[0];
const hasConsoInput =
  html.includes("Consommation annuelle (kWh / an)") &&
  /id="conso"/.test(consoTag) &&
  /type="text"/.test(consoTag) &&
  /grouped-int/.test(consoTag) &&
  /inputmode="numeric"/.test(consoTag) &&
  /value="17(?: |&nbsp;|\u00A0)000"/.test(consoTag);
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
const DAILY_LOAD_LABELS = [
  "Téléphone",
  "Ordinateur et Wi-Fi",
  "Éclairage",
  "Télévision",
  "Pompe à eau",
  "Réfrigérateur",
  "Congélateur",
  "Laveuse",
  "Cuisson"
];
const consoJourTag = (html.match(/<input[^>]*id="consoJour"[^>]*>/) || [""])[0];
const hasConsoJourUi =
  html.includes("Combien veux-tu consommer par jour") &&
  html.includes("En autonomie. Chaque cran vers la droite ajoute un usage.") &&
  html.includes('id="consoExtra"') &&
  html.includes("Autre consommation") &&
  html.includes('id="consoJourList"') &&
  html.includes('id="consoJourTotal"') &&
  html.includes("tpl-info-conso-jour") &&
  /id="consoJour"/.test(consoJourTag) &&
  /type="range"/.test(consoJourTag) &&
  /min="0"/.test(consoJourTag) &&
  /max="9"/.test(consoJourTag) &&
  /step="1"/.test(consoJourTag) &&
  /value="0"/.test(consoJourTag) &&
  DAILY_LOAD_LABELS.every((label) => app.includes(label) && html.includes(label)) &&
  app.includes("function dailyLoadKwh") &&
  app.includes("function updateConsoJourUi") &&
  app.includes('class="load-ico"') &&
  app.includes('class=\\"load-name\\"') &&
  app.includes("tenths: 1") &&
  app.includes("tenths: 15");
const GROUP_SEP_RE = /[\s\u00A0\u202F\u2009\u2007]/g;
function digitsOnly(raw) {
  return String(raw == null ? "" : raw).replace(GROUP_SEP_RE, "").replace(/[^\d]/g, "");
}
function parseGroupedInt(raw) {
  const digits = digitsOnly(raw);
  if (digits === "") return NaN;
  const v = parseInt(digits, 10);
  return isFinite(v) ? v : NaN;
}
function fmtGroupedInt(n) {
  if (!isFinite(n)) return "";
  const digits = String(Math.max(0, Math.round(n)));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
const groupedParseOk =
  parseGroupedInt("17000") === 17000 &&
  parseGroupedInt("17 000") === 17000 &&
  parseGroupedInt("17\u00A0000") === 17000 &&
  parseGroupedInt("17\u202F000") === 17000 &&
  parseGroupedInt("170 000") === 170000 &&
  parseGroupedInt("") !== parseGroupedInt("") &&
  parseGroupedInt("abc") !== parseGroupedInt("abc");
const groupedFmt = fmtGroupedInt(17000);
const groupedFmtOk = groupedFmt.replace(GROUP_SEP_RE, "") === "17000" && /17\s*000/.test(groupedFmt);
const hasConsoGrouping =
  app.includes("function parseGroupedInt") &&
  app.includes("function fmtGroupedInt") &&
  app.includes("function formatConsoInput") &&
  (app.includes("fmtGroupedInt(DEFAULT_CONSO_KWH)") || (app.includes("fmtGroupedInt(s.conso)") && app.includes("conso: DEFAULT_CONSO_KWH"))) &&
  app.includes("parseGroupedInt(el.value)") &&
  css.includes("input.grouped-int");
const ttcExact = 0.11142 * TAX_MULT;
const ttcRounded = Math.round(ttcExact * 1e5) / 1e5;
const defaultRateTtc =
  /DEFAULT_RATE_CENTS\s*=\s*12\.811/.test(app) &&
  /DEFAULT_RATE\s*=\s*0\.12811/.test(app) &&
  /id="rate"[^>]*value="12\.811"/.test(html) &&
  /id="rate"[\s\S]{0,180}¢\/kWh/.test(html) &&
  !/id="rate"[^>]*value="0\.12811"/.test(html) &&
  !/id="rate"[^>]*value="0\.11142"/.test(html) &&
  Math.abs(ttcRounded - 0.12811) < 1e-12 &&
  app.includes("RATE_D_T2_HT") &&
  /RATE_D_T2_HT\s*=\s*0\.11142/.test(app);
/** Field is ¢/kWh. Always convert to $/kWh (issue #59: 9,53 stays 9,53 ¢). */
function rateDollarsPerKwh(raw, defaultRate = 0.12811) {
  const v = typeof raw === "number" ? raw : parseFloat(String(raw).trim().replace(",", "."));
  if (!isFinite(v) || v <= 0) return defaultRate;
  return v / 100;
}
const rateNormPass =
  Math.abs(rateDollarsPerKwh(12.811) - 0.12811) < 1e-12 &&
  Math.abs(rateDollarsPerKwh(9.53) - 0.0953) < 1e-12 &&
  Math.abs(rateDollarsPerKwh("9,53") - 0.0953) < 1e-12 &&
  Math.abs(rateDollarsPerKwh(11.142) - 0.11142) < 1e-12 &&
  rateDollarsPerKwh(0) === 0.12811 &&
  rateDollarsPerKwh(-1) === 0.12811;
const rateBug59Eco = rateDollarsPerKwh(9.53001) * 8130.843520000001;
const rateBug59Years = 18396 / rateBug59Eco;
const rateBug59Pass = rateBug59Eco < 1000 && rateBug59Years > 10 && rateBug59Years < 40;
const hasRateCentsNative =
  app.includes("function rateDollarsPerKwh") &&
  app.includes("v / 100") &&
  !app.includes("function coerceRateInput") &&
  !app.includes("v > 1") &&
  !html.includes("lue en ¢/kWh") &&
  !html.includes("convertit automatiquement") &&
  html.includes("12,811&nbsp;¢/kWh") &&
  html.includes("champ tarif est en");
const hasRateInfoUi =
  html.includes("btnRateInfo") &&
  html.includes("rateModal") &&
  html.includes("9,53") &&
  html.includes("Coût du kWh moyen — maison moyenne") &&
  html.includes("Moyenne rés. QC TTC (HQ Comparaison 2025, 1000 kWh/mois") &&
  html.includes("8,29") &&
  html.includes("comparaison-prix-electricite-2025.pdf") &&
  html.includes("7,065") &&
  html.includes("11,142") &&
  html.includes("46,154") &&
  html.includes("8,123") &&
  html.includes("12,811") &&
  html.includes("Maison moyenne") &&
  html.includes("coût du kWh moyen") &&
  html.includes("rate-avg-row") &&
  html.includes("Rachat HQ") &&
  html.includes("surplus après 24 mois") &&
  html.includes("4,730") &&
  /Rachat HQ[\s\S]{0,280}4,730[\s\S]{0,80}4,730/.test(html) &&
  html.includes("HT = TTC") &&
  !html.includes("5,438") &&
  html.includes("HQ ne rajoute pas TPS/TVQ") &&
  html.includes("4,730&nbsp;¢ est le chiffre réel") &&
  html.includes("rate-buyback-row") &&
  html.includes("art.&nbsp;2.51") &&
  html.includes("tarifs-electricite.pdf") &&
  html.includes("rate-table-source") &&
  html.includes("12,811") &&
  html.includes("Avant taxes (HT)") &&
  html.includes("Taxes comprises (TTC)") &&
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
console.log(`  conso parse grouped FR ("17 000" → 17000): ${groupedParseOk ? "PASS" : "FAIL"}`);
console.log(`  conso fmtGroupedInt(17000) → ${JSON.stringify(groupedFmt)}: ${groupedFmtOk ? "PASS" : "FAIL"}`);
console.log(`  conso live grouping wired (text + parse/format): ${hasConsoGrouping ? "PASS" : "FAIL"}`);
console.log(`  économies KPI note FR (plafonné): ${hasEcoNote ? "PASS" : "FAIL"}`);
console.log(`  app.js creditKwh + DEFAULT_CONSO_KWH + clamp flags: ${hasCreditFn ? "PASS" : "FAIL"}`);
console.log(`  conso wired to render + kpiEcoNote: ${hasConsoWired ? "PASS" : "FAIL"}`);
console.log(`  autonomie slider 0→9 + liste + autre conso: ${hasConsoJourUi ? "PASS" : "FAIL"}`);
console.log(`  default rate TTC 12.811 ¢ (0.11142 × 1.14975): ${defaultRateTtc ? "PASS" : "FAIL"}`);
console.log(`  rateDollarsPerKwh ¢→$ (9,53 / 12,811): ${rateNormPass ? "PASS" : "FAIL"}`);
console.log(`  issue #59 payback sane with 9.53 ¢: ${rateBug59Pass ? "PASS" : "FAIL"}`);
console.log(`  rate field native ¢/kWh (no dual-unit coerce): ${hasRateCentsNative ? "PASS" : "FAIL"}`);
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
  html.includes('data-info="loc"') &&
  html.includes("tpl-info-loc") &&
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
  html.includes("Mesurage Net") &&
  html.includes("Panneaux solaires installés") &&
  !html.includes("Vous pourrez alors installer") &&
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
const printCss = css.includes("@media print") ? css.slice(css.indexOf("@media print")) : "";
const orientDial =
  html.includes('id="orientDial"') &&
  html.includes('id="orientControl"') &&
  html.includes('id="orientNeedle"') &&
  html.includes('id="orientVal"') &&
  html.includes('class="orient-select"') &&
  /<select id="orient" class="orient-select">/.test(html) &&
  css.includes(".orient-dial") &&
  css.includes(".orient-control") &&
  /0° Nord at top/.test(css) &&
  app.includes("function snapAzimuth") &&
  app.includes("function azimuthFromOffsets") &&
  app.includes("Math.atan2(dx, -dy)") &&
  app.includes("function wireOrientDial") &&
  app.includes("updateOrientDial") &&
  app.includes("wireOrientDial()") &&
  printCss.includes(".orient-dial") &&
  printCss.includes(".orient-select");
console.log(`  orient circular dial (15° compass, select kept): ${orientDial ? "PASS" : "FAIL"}`);
const sliderScreenCss = css.split("@media print")[0];
const orientDialMobile =
  app.includes("function nearFace") &&
  app.includes("function ensureWinTouch") &&
  app.includes("onWinTouchMove") &&
  app.includes("Do not focus the clipped <select>") &&
  !/focusSelectQuiet/.test(app) &&
  html.includes("orient-thumb-hit") &&
  css.includes(".orient-thumb-hit") &&
  html.includes('viewBox="-24 -24 248 248"') &&
  /\.orient-dial-svg[\s\S]{0,80}overflow:\s*visible/.test(sliderScreenCss) &&
  /\.orient-dial[\s\S]{0,80}overflow:\s*visible/.test(sliderScreenCss) &&
  /\.orient-dial-svg[\s\S]{0,80}pointer-events:\s*none/.test(sliderScreenCss) &&
  /\.orient-dial[\s\S]{0,280}padding:\s*18px/.test(sliderScreenCss);
console.log(`  orient dial mobile drag (window touch + fat-finger hit): ${orientDialMobile ? "PASS" : "FAIL"}`);
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
const deneigeEnds =
  /id="deneige"[\s\S]*?<div class="slider-meta"><span>jamais<\/span><span>toujours<\/span><\/div>/.test(html) &&
  !html.includes("je ne déneige pas") &&
  !html.includes("je déneige dès qu");
console.log(`  déneigement ends jamais/toujours, no 0%/100% hint: ${deneigeEnds ? "PASS" : "FAIL"}`);

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
const htmlProdBVisible = html.includes('id="sec-prod-b"') && !/id="sec-prod-b"[^>]*mode-full-only/.test(html);
const htmlSplit1A =
  html.includes('<span class="num">1A</span>') &&
  html.includes("Combien de panneaux puis-je installer") &&
  html.includes('id="outPv"') &&
  html.includes("Panneaux solaires installés") &&
  /id="outKw"/.test(html) &&
  html.includes(">kWc<") &&
  html.indexOf('id="area"') < html.indexOf('id="util"') &&
  html.indexOf('id="util"') < html.indexOf('id="outPv"');
const htmlSplit1B =
  html.includes('<span class="num">1B</span>') &&
  html.includes("Combien d'énergie électrique vais-je produire") &&
  html.includes('id="ville"') &&
  html.includes('id="villeBtn"') &&
  html.includes('id="villeList"') &&
  html.includes("1&nbsp;kWc") &&
  html.includes("kWh/kWc") &&
  html.includes("plein sud, 30°") &&
  html.includes("Mesurage Net") &&
  html.includes("Autonomie") &&
  html.includes("kWh / an") &&
  html.includes("kWh / j déc") &&
  !html.includes("±&nbsp;4") &&
  !html.includes("+/- 4") &&
  html.indexOf("field-loc") < html.indexOf('id="orient"') &&
  html.indexOf('id="orient"') < html.indexOf('id="tilt"') &&
  html.indexOf('id="tilt"') < html.indexOf("field-deneige");
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
  htmlProdBVisible &&
  html.includes('id="sec-prod"') &&
  html.includes('id="sec-prod-b"') &&
  html.includes('id="sec-cost"') &&
  html.includes('id="sec-value"');
const prodPillDay = html.includes('id="outKwhDay"') && html.includes("kWh / j déc");
const prodPillAnnual = html.includes('id="outKwh"') && html.includes("kWh / an") && html.includes("Mesurage Net");
const prodPillEqualType =
  html.includes('class="big prod-line" id="outKwhDay"') &&
  html.includes('class="big prod-line" id="outKwh"') &&
  html.includes("prod-num") &&
  css.includes("result-pair") &&
  /grid-template-columns:\s*1fr\s+1fr/.test(css) &&
  !html.includes("big-annual") &&
  !css.includes(".big-annual");
const prodKwC =
  html.includes('id="outKw"') &&
  /kwNum\.textContent = fmtShown\(r\.kW, 2\)/.test(app) &&
  html.includes(">kWc<") &&
  html.includes('id="outPv"') &&
  html.includes("Panneaux solaires installés") &&
  app.includes("PANEL_M2") &&
  app.includes("PANEL_W") &&
  /usedM2 \/ PANEL_M2/.test(app) &&
  /usedM2 \* PANEL_KW_PER_M2/.test(app) &&
  !/\(kW \* 1000\) \/ PANEL_W/.test(app) &&
  !html.includes("Puissance estimée") &&
  !html.includes("avec une installation solaire d’une puissance de");
const prodNoWave =
  !/id="outKwhDay"[^>]*>≈/.test(html) &&
  !/id="outKwh"[^>]*>≈/.test(html) &&
  !app.includes('"≈ " + fmtNum(r.kWh') &&
  app.includes("prod-num") &&
  app.includes("kWhDay");
const s30Dec = s30.ac_monthly && s30.ac_monthly.dec;
function snowCoverFromTilt(tilt) {
  const w = winterWFromTilt(tilt);
  return w <= 0 ? 0 : w / 0.18;
}
const snowCoverTable = {
  0: snowCoverFromTilt(0),
  45: snowCoverFromTilt(45),
  60: snowCoverFromTilt(60),
  75: snowCoverFromTilt(75),
  90: snowCoverFromTilt(90)
};
const snowCoverExpect = { 0: 1, 45: 1, 60: 2 / 3, 75: 1 / 3, 90: 0 };
const snowCoverOk = Object.keys(snowCoverExpect).every(
  (k) => Math.abs(snowCoverTable[k] - snowCoverExpect[k]) < 1e-9
);
const kWDefault = 40 * 0.80 * 0.20;
const nPvDefault = Math.round((40 * 0.80) / 2);
const decSnowFactor = 1 - (1 - 0.20) * snowCoverFromTilt(30);
const kWhDecDay = (s30Dec * kWDefault * decSnowFactor) / 31;
const kWhDecNever = (s30Dec * kWDefault * (1 - (1 - 0) * snowCoverFromTilt(30))) / 31;
const kWhDecVertical = (s30Dec * kWDefault * (1 - (1 - 0) * snowCoverFromTilt(90))) / 31;
const dayOk =
  Math.abs(s30Dec - 53.274) < 0.01 &&
  nPvDefault === 16 &&
  Math.abs(kWDefault - 6.4) < 1e-9 &&
  app.includes("DAYS_IN_DEC") &&
  app.includes("kWhDec") &&
  app.includes("snowCoverFromTilt") &&
  app.includes("applyDeneigement(kWhDecMonth, deneige, snowCover)") &&
  kWhDecDay > 2 && kWhDecDay < 2.5 &&
  Math.abs(kWhDecNever) < 1e-9 &&
  kWhDecVertical > 10;
const yieldHtml = html.slice(html.indexOf('id="sec-yield"'), html.indexOf('id="sec-auto"'));
const prodBHtml = html.slice(html.indexOf('id="sec-prod-b"'), html.indexOf('id="sec-yield"'));
const fillHtml = html.slice(html.indexOf('id="sec-fill"'), html.indexOf('id="sec-cost"'));
const recFn =
  app.includes("function recommendVerticalPanels") &&
  app.includes("showVerticalRec") &&
  html.includes('id="autonomySnow"') &&
  html.includes("autonomySnowRec") &&
  html.includes("mettez les panneaux à la verticale") &&
  html.includes("décembre ne tombe pas à zéro") &&
  css.includes(".autonomy-snow") &&
  /autonomy-snow\[hidden\]/.test(css) &&
  yieldHtml.includes('id="autonomySnow"') &&
  yieldHtml.indexOf('id="outKwhDay"') < yieldHtml.indexOf('id="autonomySnow"') &&
  !prodBHtml.includes("autonomySnow");
const shortfallInFill =
  fillHtml.includes('id="permaFlag"') &&
  fillHtml.includes("La réserve ne peut pas se remplir") &&
  fillHtml.indexOf("Temps pour remplir") < fillHtml.indexOf('id="permaFlag"') &&
  fillHtml.indexOf('id="outFill"') < fillHtml.indexOf('id="permaFlag"') &&
  !html.includes("perma-flag") &&
  css.includes(".fill-shortfall");
const kWhPerKwcDefault = sAnnual * (1 - (1 - 0.20) * winterWFromTilt(30));
const productiblePill =
  prodBHtml.includes('id="outKwhKwc"') &&
  prodBHtml.includes(">Productible<") &&
  prodBHtml.includes(">kWh/kWc<") &&
  prodBHtml.includes("kilowatt-crête installé") &&
  prodBHtml.indexOf('id="deneige"') < prodBHtml.indexOf('id="outKwhKwc"') &&
  prodBHtml.indexOf('id="outKwhKwc"') < prodBHtml.indexOf('id="gridStatus"') &&
  app.includes("const kWhPerKwc = applyDeneigement(table, deneige, W)") &&
  app.includes("fmtGroupedInt(Math.round(r.kWhPerKwc))") &&
  !app.includes("fmtShown(r.kWhPerKwc") &&
  kWhPerKwcDefault > 1070 && kWhPerKwcDefault < 1080;
console.log(`  display mode default=full (bare/unknown/?mode=full): ${modeDefaultFull ? "PASS" : "FAIL"}`);
console.log(`  display mode ?mode=webi (+ alias webinar) sets data-mode=webi: ${modeWebiOk ? "PASS" : "FAIL"}`);
console.log(`  html data-mode=full + display-mode.js sync: ${htmlModeDefault && htmlModeScript ? "PASS" : "FAIL"}`);
console.log(`  webi hides non-prod boxes (hero/cost/value/disclaimers): ${htmlAllowlist ? "PASS" : "FAIL"}`);
console.log(`  step 1 split 1A superficie/densité → PV+kWc: ${htmlSplit1A ? "PASS" : "FAIL"}`);
console.log(`  step 1B localisation QC / orient / tilt / déneige: ${htmlSplit1B ? "PASS" : "FAIL"}`);
console.log(`  CSS data-mode hooks + badge FR « Mode webi »: ${cssHidesFull && cssHidesWebiOnly && htmlWebiBadge ? "PASS" : "FAIL"}`);
console.log(`  runbook live URL ?mode=webi (bare=full): ${runbookWebiLink ? "PASS" : "FAIL"}`);
console.log(`  app.js re-exports SolarDisplayMode: ${appWiresMode ? "PASS" : "FAIL"}`);
console.log(`  prod pills Mesurage Net kWh/an + Autonomie kWh/j déc, no ≈: ${prodPillDay && prodPillAnnual && prodNoWave ? "PASS" : "FAIL"}`);
console.log(`  prod pair two equal KPI boxes: ${prodPillEqualType ? "PASS" : "FAIL"}`);
console.log(`  1A deux boîtes PV (2 m²) + kWc (indépendant): ${prodKwC ? "PASS" : "FAIL"}`);
console.log(`  1B productible kWh/kWc en bas (défaut ${kWhPerKwcDefault.toFixed(1)}): ${productiblePill ? "PASS" : "FAIL"}`);
console.log(`  autonomie = kWh déc / 31 (S/30 défaut ${kWhDecDay.toFixed(2)} kWh/j, 16 PV): ${dayOk ? "PASS" : "FAIL"}`);
console.log(
  `  décembre C-by-tilt 0→1, 45→1, 60→2/3, 75→1/3, 90→0: ${snowCoverOk ? "PASS" : "FAIL"} ` +
  `(${[0, 45, 60, 75, 90].map((t) => snowCoverTable[t]).join(",")})`
);
console.log(
  `  décembre d=0 tilt30 → 0 kWh/j, tilt90 → plein (${kWhDecVertical.toFixed(2)}): ${
    Math.abs(kWhDecNever) < 1e-9 && kWhDecVertical > 10 ? "PASS" : "FAIL"
  }`
);
console.log(`  boîte verticale sous autonomie (d<100 % et tilt<90°): ${recFn ? "PASS" : "FAIL"}`);
console.log(`  décembre sous Temps pour remplir: ${shortfallInFill ? "PASS" : "FAIL"}`);

const themeSrc = readFileSync(join(__dirname, "assets/theme-mode.js"), "utf8");
function runThemeMode(opts) {
  const options = opts || {};
  const htmlEl = {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };
  const meta = {
    content: "#1b4332",
    setAttribute(k, v) { if (k === "content") this.content = v; },
    getAttribute(k) { return k === "content" ? this.content : null; }
  };
  const storage = Object.assign({}, options.storage || {});
  const sandbox = {
    matchMedia(query) {
      return {
        matches: !!options.systemDark && String(query).includes("dark"),
        addEventListener() {},
        addListener() {}
      };
    },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); }
    },
    document: {
      documentElement: htmlEl,
      readyState: "complete",
      addEventListener() {},
      querySelector(sel) { return String(sel).includes("theme-color") ? meta : null; },
      querySelectorAll() { return []; },
      getElementById() { return null; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runInNewContext(themeSrc, sandbox, { filename: "theme-mode.js" });
  return { api: sandbox.SolarThemeMode, htmlEl, meta, storage };
}
const themeDefault = runThemeMode({});
const themeSysDark = runThemeMode({ systemDark: true });
const themeStoredDark = runThemeMode({ storage: { "era-theme-pref": "dark" } });
const themeStoredLightOnDarkOs = runThemeMode({
  systemDark: true,
  storage: { "era-theme-pref": "light" }
});
const themeInvalid = runThemeMode({ storage: { "era-theme-pref": "banana" } });
const themeApply = runThemeMode({});
const appliedDark = themeApply.api.applyTheme("dark", true);
const themeLogicOk =
  themeDefault.api.currentPref === "sys" &&
  themeDefault.api.current === "light" &&
  themeDefault.api.parseThemePref("") === "sys" &&
  themeDefault.api.parseThemePref("DARK") === "dark" &&
  themeDefault.htmlEl.getAttribute("data-theme-pref") === "sys" &&
  themeDefault.htmlEl.getAttribute("data-theme") === "light" &&
  themeSysDark.api.current === "dark" &&
  themeSysDark.htmlEl.getAttribute("data-theme") === "dark" &&
  themeStoredDark.api.currentPref === "dark" &&
  themeStoredDark.api.current === "dark" &&
  themeStoredDark.meta.content === "#101814" &&
  themeStoredLightOnDarkOs.api.currentPref === "light" &&
  themeStoredLightOnDarkOs.api.current === "light" &&
  themeStoredLightOnDarkOs.meta.content === "#1b4332" &&
  themeInvalid.api.currentPref === "sys" &&
  appliedDark === "dark" &&
  themeApply.storage["era-theme-pref"] === "dark" &&
  themeApply.htmlEl.getAttribute("data-theme-pref") === "dark";
const htmlThemeToggle =
  html.includes('id="themeToggle"') &&
  html.includes('data-theme-pref-btn="light"') &&
  html.includes('data-theme-pref-btn="sys"') &&
  html.includes('data-theme-pref-btn="dark"') &&
  html.includes('src="assets/theme-mode.js"') &&
  /<html[^>]*data-theme-pref="sys"/.test(html) &&
  html.includes('role="radiogroup"') &&
  html.includes("aria-label=\"Thème\"") &&
  /class="brand"[\s\S]*id="themeToggle"/.test(html) &&
  !html.includes("<span>Clair</span>") &&
  !html.includes("<span>Sys</span>") &&
  !html.includes("<span>Sombre</span>") &&
  !html.includes('class="topbar"');
const themeSwipe =
  themeSrc.includes("wireSwipe") &&
  themeSrc.includes("prefFromClientX") &&
  themeSrc.includes("prefButtonFromEvent") &&
  themeSrc.includes("composedPath") &&
  themeSrc.includes("Capture only after a real swipe") &&
  themeSrc.includes("pointerdown") &&
  themeSrc.includes("touchstart") &&
  /touch-action:\s*none/.test(css);
const lightPrefBtn = {
  getAttribute(k) { return k === "data-theme-pref-btn" ? "light" : null; }
};
const capturedClick = {
  composedPath() { return [{ tag: "svg" }, lightPrefBtn]; },
  target: { closest() { return null; } }
};
const themeHitApi = runThemeMode({});
const themePrefFromCapturedOk = themeHitApi.api.prefButtonFromEvent(capturedClick, {}) === lightPrefBtn;
const themeClickHit =
  css.includes("pointer-events: auto") &&
  /\.theme-toggle\s*\{[\s\S]*?z-index:\s*2/.test(css) &&
  /\.brand-text\s*\{[\s\S]*?overflow:\s*hidden/.test(css) &&
  themeSrc.includes("prefButtonFromEvent: prefButtonFromEvent") &&
  themePrefFromCapturedOk;
const cssThemeDark =
  /html\[data-theme="dark"\]/.test(css) &&
  css.includes(".theme-toggle") &&
  !css.includes(".topbar") &&
  /html\[data-theme="dark"\]\s*\.theme-toggle button\.active/.test(css) &&
  /@media print[\s\S]*\.theme-toggle/.test(css);
console.log(`  theme pref light/sys/dark + persist + OS resolve: ${themeLogicOk ? "PASS" : "FAIL"}`);
console.log(`  theme icons-only in brand row + head script: ${htmlThemeToggle ? "PASS" : "FAIL"}`);
console.log(`  theme swipe (pointer + touch) + touch-action none: ${themeSwipe ? "PASS" : "FAIL"}`);
console.log(`  theme click survives capture + brand overflow: ${themeClickHit ? "PASS" : "FAIL"}`);
console.log(`  CSS data-theme=dark tokens + print hides toggle: ${cssThemeDark ? "PASS" : "FAIL"}`);

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
  /function fmtShown\(n, digits\)[\s\S]{0,260}return fmtSig2\(n\)/.test(app) &&
  app.includes("fmtShown(r.kWhDay, 2)") &&
  app.includes("fmtShown(r.kWh, 0)") &&
  app.includes("fmtShown(r.kW, 2)") &&
  app.includes("fmtSig2(lossPct)") &&
  app.includes("fmtSig2(r.W * 100)") &&
  !/\$\("outKwh"\)\.textContent = fmtNum/.test(app);
function fmtMoneySig2(n) {
  if (!isFinite(n)) return "—";
  const rounded = sig2Round(n);
  if (!isFinite(rounded)) return "—";
  const abs = Math.abs(rounded);
  const whole = Math.abs(rounded - Math.round(rounded)) <= 1e-9 * Math.max(1, abs);
  return rounded.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2
  });
}
const moneySigCases = [
  [15675.2, 16000],
  [14230, 14000],
  [874.4, 870],
  [12.53, 13]
];
const moneySig2RoundOk = moneySigCases.every(([raw, expect]) => Math.abs(sig2Round(raw) - expect) < 1e-9);
const fmtMoney15675 = fmtMoneySig2(15675.2);
const fmtMoney15675Compact = fmtMoney15675.replace(/\s/g, "");
const fmtMoneySig2Ok =
  moneySig2RoundOk &&
  /16\s*000/.test(fmtMoney15675) &&
  !/15675/.test(fmtMoney15675Compact);
const totalUsesSig2 =
  app.includes("function fmtMoneySig2") &&
  app.includes("function fmtShownMoney") &&
  /function fmtShownMoney\(n\)[\s\S]{0,280}return fmtMoneySig2\(n\)/.test(app) &&
  /\$\("lineTotal"\)\.textContent = fmtShownMoney\(r\.reel\)/.test(app) &&
  /\$\("kpiReel"\)\.textContent = fmtShownMoney\(r\.reel\)/.test(app) &&
  !/\$\("lineTotal"\)\.textContent = fmtMoney\(r\.reel\)/.test(app);
console.log(`  sig2Round table 14230→14000, 874→870, 12.53→13: ${sig2RoundOk ? "PASS" : "FAIL"}`);
console.log(`  fmtSig2(14230) → ${JSON.stringify(fmt14230)} (expect 14 000 / 14000): ${fmt14230Ok ? "PASS" : "FAIL"}`);
console.log(`  sec-prod render uses fmtSig2 only: ${prodUsesSig2 ? "PASS" : "FAIL"}`);
console.log(`  Total estimé / coût réel use fmtMoneySig2 (15675→${JSON.stringify(fmtMoney15675)}): ${fmtMoneySig2Ok && totalUsesSig2 ? "PASS" : "FAIL"}`);

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

function makeClassList() {
  const set = new Set();
  return {
    add() { for (const x of arguments) set.add(x); },
    remove() { for (const x of arguments) set.delete(x); },
    toggle(name, force) {
      const has = set.has(name);
      const next = force === undefined ? !has : !!force;
      if (next) set.add(name); else set.delete(name);
      return next;
    },
    contains(name) { return set.has(name); }
  };
}

function makeEl(id) {
  const listeners = {};
  const attrs = {};
  return {
    id,
    value: "",
    checked: false,
    hidden: false,
    textContent: "",
    innerHTML: "",
    type: "",
    selectionStart: 0,
    selectionEnd: 0,
    childElementCount: 0,
    style: {},
    attrs,
    classList: makeClassList(),
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(ev) {
      const type = ev && ev.type;
      (listeners[type] || []).forEach((fn) => fn(ev));
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() { this.childElementCount += 1; return this; },
    setSelectionRange() {},
    focus() {},
    closest() { return null; },
    contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  };
}

async function bootScenario(search, hash) {
  const els = {};
  const listeners = {};
  const pending = [];
  const htmlEl = makeEl("html");
  const bodyEl = makeEl("body");
  const location = {
    pathname: "/solutionera-calculateur-solaire-staging/",
    search: search || "",
    hash: hash || "",
    href: ""
  };
  function refreshHref() {
    location.href = "https://example.test" + location.pathname + location.search + location.hash;
  }
  refreshHref();
  const history = {
    state: null,
    pushCount: 0,
    replaceCount: 0,
    pushState() { history.pushCount += 1; },
    replaceState(_state, _title, url) {
      history.replaceCount += 1;
      history.state = _state;
      const hashIdx = url.indexOf("#");
      const hashPart = hashIdx >= 0 ? url.slice(hashIdx) : "";
      const before = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
      const qIdx = before.indexOf("?");
      location.pathname = qIdx >= 0 ? before.slice(0, qIdx) : before;
      location.search = qIdx >= 0 ? before.slice(qIdx) : "";
      location.hash = hashPart;
      refreshHref();
    }
  };
  const document = {
    documentElement: htmlEl,
    body: bodyEl,
    readyState: "loading",
    visibilityState: "visible",
    activeElement: null,
    getElementById(id) {
      if (!els[id]) els[id] = makeEl(id);
      return els[id];
    },
    addEventListener(type, fn) {
      const tracked = function () {
        const ret = fn.apply(this, arguments);
        if (ret && typeof ret.then === "function") pending.push(ret);
        return ret;
      };
      (listeners[type] || (listeners[type] = [])).push(tracked);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElementNS() { return makeEl("ns"); },
    contains() { return true; }
  };
  const sandbox = {
    URLSearchParams,
    Promise,
    setTimeout,
    clearTimeout,
    console,
    location,
    history,
    document,
    navigator: { userAgent: "scenario-test" },
    fetch: async function () {
      return {
        ok: true,
        json: async function () {
          return {
            cells: {
              "30": { "180": { ac_annual: 1254.8064, W_winter: 0.17, ac_monthly: { dec: 53.274 } } }
            }
          };
        }
      };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = function () {};
  sandbox.removeEventListener = function () {};
  runInNewContext(modeSrc, sandbox, { filename: "display-mode.js" });
  runInNewContext(app, sandbox, { filename: "app.js" });
  (listeners.DOMContentLoaded || []).forEach((fn) => fn());
  await Promise.race([
    Promise.all(pending),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("scenario boot timeout")), 2000))
  ]);
  return {
    location,
    history,
    api: sandbox.SolarCalcV02,
    el(id) { return document.getElementById(id); }
  };
}

function scenarioSnapshot(page) {
  const calc = page.api.calc();
  return {
    search: page.location.search,
    hash: page.location.hash,
    pathname: page.location.pathname,
    area: page.el("area").value,
    unit: page.el("unitSqft").getAttribute("aria-pressed") === "true" ? "sqft" : "m2",
    util: page.el("util").value,
    orient: page.el("orient").value,
    tilt: page.el("tilt").value,
    deneige: page.el("deneige").value,
    priceW: page.el("priceW").value,
    taxes: page.el("taxes").checked,
    subv: page.el("subv").checked,
    conso: page.el("conso").value,
    rate: page.el("rate").value,
    m2: calc.m2,
    push: page.history.pushCount
  };
}

function fireInput(page, id, value) {
  const el = page.el(id);
  el.value = value;
  el.dispatchEvent({ type: "input", target: el });
}

const scenarioOk = await (async function runScenarioUrlTests() {
  const fails = [];
  function expect(cond, msg) {
    if (!cond) fails.push(msg);
  }
  function fullSearch(over) {
    const s = Object.assign({
      mode: "full",
      ville: "quebec",
      area: 40,
      unit: "m2",
      util: 80,
      orient: 180,
      tilt: 30,
      deneige: 20,
      priceW: "3",
      taxes: "1",
      subv: "1",
      conso: 17000,
      rate: "12.811",
      consoJour: "0",
      consoExtra: "0"
    }, over || {});
    const p = new URLSearchParams();
    ["mode", "ville", "area", "unit", "util", "orient", "tilt", "deneige", "priceW", "taxes", "subv", "conso", "rate", "consoJour", "consoExtra"].forEach((key) => {
      p.set(key, String(s[key]));
    });
    return "?" + p.toString();
  }
  const roundTrips = [
    ["", ""],
    ["?mode=webi", "?mode=webi"],
    ["?mode=WEBI", "?mode=webi"],
    ["?mode=webinar", "?mode=webi"],
    ["?mode=full", ""],
    ["?mode=banana", ""],
    ["?foo=1", ""],
    ["?area=40&unit=sqft", fullSearch({ area: 40, unit: "sqft" })],
    ["?unit=pi2&area=100", fullSearch({ area: 100, unit: "sqft" })],
    ["?unit=m2&area=40", fullSearch()],
    [
      "?util=70&orient=90&tilt=45&deneige=0&priceW=3.5&taxes=0&subv=0&conso=12000&rate=9.53",
      fullSearch({ util: 70, orient: 90, tilt: 45, deneige: 0, priceW: "3.5", taxes: "0", subv: "0", conso: 12000, rate: "9.53" })
    ],
    ["?mode=webi&area=0&conso=0&orient=0", fullSearch({ mode: "webi", area: 0, conso: 0, orient: 0 })],
    [
      "?tilt=31&orient=190&util=10&priceW=9&rate=nope&conso=abc",
      fullSearch({ util: 60, orient: 195, priceW: "4.5" })
    ],
    ["?taxes=off&subv=non&rate=9,53", fullSearch({ taxes: "0", subv: "0", rate: "9.53" })],
    [
      "?orient=-15&tilt=90&deneige=100&util=100&priceW=2.5",
      fullSearch({ util: 100, orient: 345, tilt: 90, deneige: 100, priceW: "2.5" })
    ],
    ["?area=40.6&unit=m2", fullSearch({ area: 41 })],
    ["?mode=webi&tilt=31", fullSearch({ mode: "webi" })],
    ["?consoJour=6&consoExtra=1.5", fullSearch({ consoJour: 6, consoExtra: "1.5" })],
    ["?consoJour=99&consoExtra=250", fullSearch({ consoJour: 9, consoExtra: "100" })],
    ["?ville=alma", fullSearch({ ville: "alma" })],
    ["?ville=quebec", fullSearch()],
    ["?ville=../x", fullSearch()]
  ];
  for (const [input, canonical] of roundTrips) {
    const first = await bootScenario(input, "#main");
    expect(first.location.search === canonical, `canonical ${input} → ${first.location.search} want ${canonical}`);
    expect(first.location.hash === "#main", `hash kept for ${input}`);
    expect(first.location.pathname === "/solutionera-calculateur-solaire-staging/", `path kept for ${input}`);
    expect(first.history.pushCount === 0, `no pushState for ${input}`);
    const again = await bootScenario(first.location.search, first.location.hash);
    const a = scenarioSnapshot(first);
    const b = scenarioSnapshot(again);
    expect(JSON.stringify(a) === JSON.stringify(b), `round-trip fields ${input}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    expect(again.location.search === first.location.search, `stable search ${input}`);
  }

  const sq = await bootScenario("?area=40&unit=sqft", "#bugModal");
  expect(sq.el("area").value === "40", "sqft link keeps area 40");
  expect(sq.el("unitM2").getAttribute("aria-pressed") === "false", "m2 not pressed");
  expect(sq.el("printUnit").textContent === "pi²", "print unit pi²");
  const sqM2 = sq.api.calc().m2;
  expect(Math.abs(sqM2 - 40 / 10.76391041671) < 1e-6, `40 sqft m2=${sqM2}`);

  const live = await bootScenario("", "#main");
  expect(live.location.search === "", "bare URL stays bare");
  expect(live.el("subv").checked === true, "LogisVert default on");
  expect(live.el("taxes").checked === true, "taxes default on");
  expect(live.el("conso").value === "17 000", "conso default grouped");
  expect(live.api.dailyLoadKwh(0, 0) === 0, "ladder step 0 is 0");
  expect(live.api.dailyLoadKwh(1, 0) === 0.1, "phone is 0.1 kWh/j");
  expect(live.api.dailyLoadKwh(2, 0) === 0.6, "phone + computer");
  expect(live.api.dailyLoadKwh(5, 0) === 2.3, "through water pump");
  expect(live.api.dailyLoadKwh(6, 0) === 3.5, "through fridge");
  expect(live.api.dailyLoadKwh(9, 0) === 6.3, "full ladder 6.3 kWh/j");
  expect(live.api.dailyLoadKwh(9, 1.2) === 7.5, "custom adds on top");
  expect(live.api.dailyLoadKwh(3, "0,5") === 1.6, "comma extra");
  expect(live.api.clampExtraKwh("250") === 100, "extra caps at 100");
  expect(live.api.fmtKwhDay(6.3) === "6,3", "fmt kWh/j FR");
  expect(live.el("consoJour").value === "0", "daily slider starts at 0");
  expect(live.history.replaceCount === 0, "defaults do not rewrite the URL");
  fireInput(live, "util", "80");
  const fullDefault = fullSearch();
  expect(live.location.search === fullDefault, `first touch writes every parameter → ${live.location.search}`);
  ["mode", "ville", "area", "unit", "util", "orient", "tilt", "deneige", "priceW", "taxes", "subv", "conso", "rate", "consoJour", "consoExtra"].forEach((key) => {
    expect(live.location.search.includes(key + "="), `snapshot includes ${key}`);
  });
  fireInput(live, "util", "81");
  fireInput(live, "util", "82");
  fireInput(live, "util", "83");
  fireInput(live, "util", "84");
  fireInput(live, "util", "85");
  expect(live.location.search === fullSearch({ util: 85 }), `live util → ${live.location.search}`);
  expect(live.location.hash === "#main", "live edit keeps hash");
  expect(live.history.pushCount === 0, "slider ticks do not push history");
  const afterSlider = live.history.replaceCount;
  fireInput(live, "util", "85");
  expect(live.history.replaceCount === afterSlider, "unchanged value does not replaceState again");
  fireInput(live, "area", "55.4");
  expect(live.el("area").value === "55", "area rounds to integer");
  live.el("bugName").value = "secret-name";
  live.el("bugText").value = "secret-bug-text";
  live.el("unitSqft").dispatchEvent({ type: "click", target: live.el("unitSqft") });
  const sqftArea = String(Math.round(55 * 10.76391041671));
  expect(live.el("area").value === sqftArea, `unit click converts area to ${sqftArea}, got ${live.el("area").value}`);
  expect(live.location.search === fullSearch({ area: sqftArea, unit: "sqft", util: 85 }), `live unit URL ${live.location.search}`);
  expect(!live.location.href.includes("secret"), "bug text stays out of the URL");
  const shared = await bootScenario(live.location.search, live.location.hash);
  expect(shared.el("area").value === sqftArea, "shared area");
  expect(shared.el("util").value === "85", "shared util");
  expect(shared.el("unitSqft").getAttribute("aria-pressed") === "true", "shared unit");
  expect(Math.abs(shared.api.calc().m2 - live.api.calc().m2) < 1e-9, "shared m2 matches");

  const flags = await bootScenario("?taxes=0&subv=0&conso=0&rate=9.53");
  expect(flags.el("taxes").checked === false, "taxes off");
  expect(flags.el("subv").checked === false, "subv off");
  expect(flags.el("conso").value === "", "conso 0 clears the field");
  expect(flags.api.calc().conso == null, "conso 0 means no cap");
  expect(Math.abs(flags.api.calc().rateOk - 0.0953) < 1e-9, "rate 9.53 ¢");
  fireInput(flags, "conso", "");
  expect(flags.location.search.includes("conso=0"), `cleared conso stays in URL ${flags.location.search}`);

  const webi = await bootScenario("?mode=webi&priceW=4");
  expect(webi.api.displayMode === "webi", "webi mode kept");
  expect(webi.location.search === fullSearch({ mode: "webi", priceW: "4" }), `partial webi link expands → ${webi.location.search}`);
  fireInput(webi, "deneige", "40");
  expect(webi.location.search === fullSearch({ mode: "webi", deneige: 40, priceW: "4" }), `webi live ${webi.location.search}`);

  const prefs = await bootScenario("");
  expect(prefs.el("showDetails").checked === false, "details off by default");
  expect(prefs.el("editorNotes").hidden === true, "editor notes hidden by default");
  expect(!prefs.location.search.includes("battPrice"), "battery price stays out of the URL");
  expect(!prefs.location.search.includes("autoStop"), "reserve duration stays out of the URL");

  if (fails.length) {
    fails.forEach((msg) => console.log("  scenario URL FAIL:", msg));
  }
  return fails.length === 0;
})();
console.log(`  scenario URL live round-trip: ${scenarioOk ? "PASS" : "FAIL"}`);

const pass =
  ok &&
  !bad &&
  annualOk &&
  cellsOk &&
  townDataOk &&
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
  batteryColumn &&
  designRules &&
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
  groupedParseOk &&
  groupedFmtOk &&
  hasConsoGrouping &&
  hasEcoNote &&
  hasCreditFn &&
  hasConsoWired &&
  hasConsoJourUi &&
  defaultRateTtc &&
  rateNormPass &&
  rateBug59Pass &&
  hasRateCentsNative &&
  hasRateInfoUi &&
  infoSheetUi &&
  orientVersantTip &&
  orientAzimuthHint &&
  orientPanelsLabel &&
  orientDial &&
  orientDialMobile &&
  areaInstallLabel &&
  deneigeTip &&
  deneigeEnds &&
  modeDefaultFull &&
  modeWebiOk &&
  htmlModeDefault &&
  htmlModeScript &&
  htmlAllowlist &&
  htmlSplit1A &&
  htmlSplit1B &&
  htmlProdBVisible &&
  cssHidesFull &&
  cssHidesWebiOnly &&
  htmlWebiBadge &&
  runbookWebiLink &&
  appWiresMode &&
  prodPillDay &&
  prodPillAnnual &&
  prodPillEqualType &&
  prodKwC &&
  productiblePill &&
  prodNoWave &&
  dayOk &&
  snowCoverOk &&
  recFn &&
  shortfallInFill &&
  themeLogicOk &&
  htmlThemeToggle &&
  themeSwipe &&
  themeClickHit &&
  cssThemeDark &&
  sig2RoundOk &&
  fmt14230Ok &&
  prodUsesSig2 &&
  fmtMoneySig2Ok &&
  totalUsesSig2 &&
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
  bugWorkflow &&
  scenarioOk;

console.log(pass ? "SMOKE OK" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
