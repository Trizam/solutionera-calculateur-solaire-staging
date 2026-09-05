/* Calculateur Solaire V0.1 — Solution Era — Québec full grid (offline-capable) */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323 };
  const DEFAULT_DENEIGEMENT = 0.20;

  const PANEL_KW_PER_M2 = 0.20;
  const TAX_MULT = 1.14975; // TPS 5% + TVQ 9.975%
  const DEFAULT_RATE = 0.11142; // Tarif D 2e tranche, 1 avr 2026
  const SQFT_PER_M2 = 10.76391041671;

  /** Clear FR labels for 0..345 step 15° */
  const AZ_LABELS = {
    "0": "Nord",
    "15": "Nord +15° (15°)",
    "30": "Nord +30° (30°)",
    "45": "Nord-Est",
    "60": "Est −30° (60°)",
    "75": "Est −15° (75°)",
    "90": "Est",
    "105": "Est +15° (105°)",
    "120": "Est +30° (120°)",
    "135": "Sud-Est",
    "150": "Sud −30° (150°)",
    "165": "Sud −15° (165°)",
    "180": "Sud",
    "195": "Sud +15° (195°)",
    "210": "Sud +30° (210°)",
    "225": "Sud-Ouest",
    "240": "Ouest −30° (240°)",
    "255": "Ouest −15° (255°)",
    "270": "Ouest",
    "285": "Ouest +15° (285°)",
    "300": "Ouest +30° (300°)",
    "315": "Nord-Ouest",
    "330": "Nord −30° (330°)",
    "345": "Nord −15° (345°)"
  };

  /** Runtime grid: cells[tilt][az] = { ac_annual, W_winter, ... } */
  let gridCells = null;
  let gridReady = false;

  const $ = (id) => document.getElementById(id);

  let areaUnit = "m2";

  function fmtMoney(n) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNum(n, d) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtYears(n) {
    if (!isFinite(n) || n <= 0) return "—";
    if (n > 100) return "> 100 ans";
    return "~ " + fmtNum(n, 1) + " ans";
  }

  function areaM2() {
    const raw = parseFloat($("area").value);
    if (!isFinite(raw) || raw <= 0) return 0;
    return areaUnit === "sqft" ? raw / SQFT_PER_M2 : raw;
  }

  function utilFrac() {
    return parseFloat($("util").value) / 100;
  }

  function deneigeFrac() {
    const el = $("deneige");
    if (!el) return DEFAULT_DENEIGEMENT;
    const v = parseFloat(el.value);
    if (!isFinite(v)) return DEFAULT_DENEIGEMENT;
    return Math.min(1, Math.max(0, v / 100));
  }

  function lookupCell(tilt, az) {
    const t = String(tilt);
    const a = String(az);
    if (gridCells && gridCells[t] && gridCells[t][a]) {
      const c = gridCells[t][a];
      return {
        ac_annual: c.ac_annual,
        W_winter: c.W_winter
      };
    }
    // Fallback: only S/30 is guaranteed
    if (t === "30" && a === "180") return Object.assign({}, FALLBACK_S30);
    return { ac_annual: 0, W_winter: FALLBACK_S30.W_winter };
  }

  /** kWh_effectif = kWh_annuel * (1 - (1 - deneigement) * W) */
  function applyDeneigement(kWhAnnuel, d, W) {
    const w = isFinite(W) ? W : FALLBACK_S30.W_winter;
    return kWhAnnuel * (1 - (1 - d) * w);
  }

  function calc() {
    const m2 = areaM2();
    const util = utilFrac();
    const deneige = deneigeFrac();
    const tilt = String($("tilt").value);
    const az = String($("orient").value);
    const priceW = parseFloat($("priceW").value);
    const taxesOn = $("taxes").checked;
    const subvOn = $("subv").checked;
    const rate = parseFloat($("rate").value);
    const rateOk = isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE;

    const cell = lookupCell(tilt, az);
    const table = cell.ac_annual;
    const W = cell.W_winter;

    const kW = m2 * util * PANEL_KW_PER_M2;
    const kWhAnnuel = table * kW;
    const kWh = applyDeneigement(kWhAnnuel, deneige, W);

    const HT = kW * 1000 * priceW;
    const TTC = HT * TAX_MULT;
    const taxes = TTC - HT;
    const subv = subvOn ? Math.min(1000 * kW, 0.4 * HT) : 0;
    const base = taxesOn ? TTC : HT;
    const reel = Math.max(0, base - subv);
    const eco = kWh * rateOk;
    const years = eco > 0 ? reel / eco : Infinity;

    return {
      m2, util, deneige, tilt, az, priceW, taxesOn, subvOn, rateOk,
      kW, table, kWhAnnuel, kWh, W,
      HT, TTC, taxes, subv, reel, eco, years,
      gridReady
    };
  }

  function render() {
    const r = calc();
    $("utilVal").textContent = Math.round(r.util * 100) + " %";
    $("priceVal").textContent = fmtNum(r.priceW, 2) + " $/W";
    if ($("deneigeVal")) {
      $("deneigeVal").textContent = Math.round(r.deneige * 100) + " %";
    }
    if ($("deneigeLive")) {
      const lossPct = (1 - r.deneige) * r.W * 100;
      $("deneigeLive").innerHTML = "−" + fmtNum(lossPct, 1) + "&nbsp;% annuel";
    }

    $("outKwh").textContent = "≈ " + fmtNum(r.kWh, 0) + " kWh / an";
    $("outKw").textContent = fmtNum(r.kW, 2) + " kW";
    $("outLight").textContent =
      fmtNum(r.kW * 1000, 0) + " W × " + fmtNum(r.priceW, 2) + " $/W = " + fmtMoney(r.HT) + " (HT)";

    $("lineHT").textContent = fmtMoney(r.HT);
    $("lineTaxes").textContent = r.taxesOn ? fmtMoney(r.taxes) : "—";
    $("lineSubv").textContent = r.subvOn ? ("− " + fmtMoney(r.subv)) : "—";
    $("lineTotal").textContent = fmtMoney(r.reel);

    $("outEcoYear").textContent = "≈ " + fmtMoney(r.eco) + " / an";
    $("kpiReel").textContent = fmtMoney(r.reel);
    $("kpiEco").textContent = fmtMoney(r.eco);
    $("kpiYears").textContent = fmtYears(r.years);
    $("outPayback").textContent =
      "Coût réel ÷ économies/an ≈ " + (isFinite(r.years) && r.years > 0 ? fmtNum(r.years, 1) + " ans" : "—");
  }

  function setUnit(u) {
    const prevM2 = areaM2();
    areaUnit = u;
    $("unitM2").classList.toggle("active", u === "m2");
    $("unitSqft").classList.toggle("active", u === "sqft");
    if (prevM2 > 0) {
      $("area").value = u === "sqft"
        ? Math.round(prevM2 * SQFT_PER_M2 * 10) / 10
        : Math.round(prevM2 * 100) / 100;
    }
    render();
  }

  function printPdf() {
    window.print();
  }

  function reportBug(e) {
    e.preventDefault();
    const subject = encodeURIComponent("Calculateur solaire V0.1 — signalement");
    const body = encodeURIComponent(
      "Décris le bug ou l'erreur de calcul:\n\n" +
      "Entrées:\n" + JSON.stringify(calc(), null, 2)
    );
    window.location.href = "mailto:hello@solutionera.com?subject=" + subject + "&body=" + body;
  }

  function wireUi() {
    ["area", "tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    $("unitM2").addEventListener("click", () => setUnit("m2"));
    $("unitSqft").addEventListener("click", () => setUnit("sqft"));
    $("btnPdf").addEventListener("click", printPdf);
    $("bugLink").addEventListener("click", reportBug);
    $("priceW").value = 3;
    $("util").value = 80;
    if ($("deneige")) $("deneige").value = Math.round(DEFAULT_DENEIGEMENT * 100);
    $("tilt").value = "30";
    $("orient").value = "180";
    $("rate").value = String(DEFAULT_RATE);
    $("taxes").checked = true;
    $("subv").checked = false;
    $("area").value = 40;
  }

  function setGridFromPayload(data) {
    if (data && data.cells) {
      gridCells = data.cells;
      gridReady = true;
    }
  }

  async function loadGrid() {
    try {
      const res = await fetch("assets/quebec-full-grid.json", { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setGridFromPayload(data);
    } catch (err) {
      // Keep S/30 fallback; other orientations need the JSON
      console.warn("Grille Québec non chargée — repli S/30", err);
      gridReady = false;
    }
  }

  window.SolarCalcV01 = {
    calc,
    applyDeneigement,
    lookupCell,
    AZ_LABELS,
    constants: {
      PANEL_KW_PER_M2,
      TAX_MULT,
      DEFAULT_RATE,
      DEFAULT_DENEIGEMENT,
      FALLBACK_S30
    },
    get gridReady() { return gridReady; },
    get cells() { return gridCells; },
    smokeAnalyste() {
      const kW = 6.5, priceW = 3;
      const HT = kW * 1000 * priceW;
      const TTC = HT * TAX_MULT;
      const subv = Math.min(1000 * kW, 0.4 * HT);
      const reel = TTC - subv;
      return { kW, priceW, HT, TTC, subv, reel };
    }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    wireUi();
    // First paint with fallback S/30, then refresh when grille loads
    render();
    await loadGrid();
    render();
  });
})();
