/* Calculateur Solaire V0.1 — Solution Era — offline */
(function () {
  "use strict";

  // Montréal kWh_ac / kWdc / an (NREL/PVWatts + PVGIS-scaled cells)
  const KWH_PER_KW = {"0":{"0":1076.93,"45":1076.93,"90":1076.93,"135":1076.93,"180":1076.93,"225":1076.93,"270":1076.93,"315":1076.93},"15":{"0":883.41,"45":956.85,"90":1070,"135":1188.08,"180":1231.52,"225":1203.32,"270":1064.51,"315":963.1},"30":{"0":689.42,"45":807.59,"90":1037.09,"135":1220.12,"180":1314.1,"225":1245.96,"270":1031.77,"315":813.42},"45":{"0":535.98,"45":674.34,"90":952.5,"135":1197.76,"180":1317.06,"225":1231.83,"270":983.5,"315":682.21},"60":{"0":381.05,"45":551.55,"90":854.5,"135":1121.48,"180":1250.8,"225":1161.69,"270":892.87,"315":564.29},"75":{"0":270.64,"45":434.43,"90":728.52,"135":992.03,"180":1116.24,"225":1035.29,"270":773.46,"315":451.26},"90":{"0":197.02,"45":326.99,"90":584.09,"135":816.58,"180":917.83,"225":861.95,"270":635.11,"315":346.57}};

  const PANEL_KW_PER_M2 = 0.20; // estimation densité modules
  const TAX_MULT = 1.14975; // TPS 5% + TVQ 9.975%
  const DEFAULT_RATE = 0.11142; // Tarif D 2e tranche, 1 avr 2026
  const SQFT_PER_M2 = 10.76391041671;

  const AZ_LABELS = {
    "180": "Sud",
    "135": "Sud-Est",
    "225": "Sud-Ouest",
    "90": "Est",
    "270": "Ouest",
    "45": "Nord-Est",
    "315": "Nord-Ouest",
    "0": "Nord"
  };

  const $ = (id) => document.getElementById(id);

  let areaUnit = "m2"; // or sqft

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

  function calc() {
    const m2 = areaM2();
    const util = utilFrac();
    const tilt = String($("tilt").value);
    const az = String($("orient").value);
    const priceW = parseFloat($("priceW").value);
    const taxesOn = $("taxes").checked;
    const subvOn = $("subv").checked;
    const rate = parseFloat($("rate").value);
    const rateOk = isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE;

    // kW = m² × util × 0.20
    const kW = m2 * util * PANEL_KW_PER_M2;
    const table = (KWH_PER_KW[tilt] && KWH_PER_KW[tilt][az]) || 0;
    const kWh = table * kW;

    // HT = kW × 1000 × $/W
    const HT = kW * 1000 * priceW;
    const TTC = HT * TAX_MULT;
    const taxes = TTC - HT;
    // LogisVert: min(1000×kW, 0.4×HT) — si admissible
    const subv = subvOn ? Math.min(1000 * kW, 0.4 * HT) : 0;
    const base = taxesOn ? TTC : HT;
    const reel = Math.max(0, base - subv);
    const eco = kWh * rateOk;
    const years = eco > 0 ? reel / eco : Infinity;

    return { m2, util, tilt, az, priceW, taxesOn, subvOn, rateOk, kW, table, kWh, HT, TTC, taxes, subv, reel, eco, years };
  }

  function render() {
    const r = calc();
    $("utilVal").textContent = Math.round(r.util * 100) + " %";
    $("priceVal").textContent = fmtNum(r.priceW, 2) + " $/W";

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

  // Expose for smoke / console
  window.SolarCalcV01 = {
    calc,
    constants: { PANEL_KW_PER_M2, TAX_MULT, DEFAULT_RATE, KWH_PER_KW },
    smokeAnalyste() {
      // 6.5 kW @ 3 $/W, taxes ON, LogisVert ON → réel ≈ 15920.76
      const kW = 6.5, priceW = 3;
      const HT = kW * 1000 * priceW;
      const TTC = HT * TAX_MULT;
      const subv = Math.min(1000 * kW, 0.4 * HT);
      const reel = TTC - subv;
      return { kW, priceW, HT, TTC, subv, reel };
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ["area", "tilt", "orient", "util", "priceW", "taxes", "subv", "rate"].forEach((id) => {
      $(id).addEventListener("input", render);
      $(id).addEventListener("change", render);
    });
    $("unitM2").addEventListener("click", () => setUnit("m2"));
    $("unitSqft").addEventListener("click", () => setUnit("sqft"));
    $("btnPdf").addEventListener("click", printPdf);
    $("bugLink").addEventListener("click", reportBug);
    // defaults: Sud 180, tilt 30, util 80, price mid 3.50? mock says 2.50–4.50 — use 3.00 for demo clarity near smoke
    $("priceW").value = 3;
    $("util").value = 80;
    $("tilt").value = "30";
    $("orient").value = "180";
    $("rate").value = String(DEFAULT_RATE);
    $("taxes").checked = true;
    $("subv").checked = false;
    // seed area so  m²×0.8×0.20 ≈ interesting: e.g. 40.625 m² → 6.5 kW at 80%
    $("area").value = 40.625;
    render();
  });
})();
