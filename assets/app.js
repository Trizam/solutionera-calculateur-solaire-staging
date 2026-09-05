/* Calculateur Solaire version 0.2 — Solution Era — Québec full grid + W-by-tilt */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  // Used for ANY missing cell so calc never stays blank forever
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323 };
  const DEFAULT_DENEIGEMENT = 0.20;

  const PANEL_KW_PER_M2 = 0.20;
  const TAX_MULT = 1.14975; // TPS 5% + TVQ 9.975% (display shows ~15 %)
  const DEFAULT_RATE = 0.11142; // Tarif D 2e tranche, 1 avr 2026
  const SQFT_PER_M2 = 10.76391041671;

  /** Clear FR labels — degree first, named cardinals only: N° (Cardinal) */
  const AZ_LABELS = {
    "0": "0° (Nord)",
    "15": "15°",
    "30": "30°",
    "45": "45° (Nord-Est)",
    "60": "60°",
    "75": "75°",
    "90": "90° (Est)",
    "105": "105°",
    "120": "120°",
    "135": "135° (Sud-Est)",
    "150": "150°",
    "165": "165°",
    "180": "180° (Sud)",
    "195": "195°",
    "210": "210°",
    "225": "225° (Sud-Ouest)",
    "240": "240°",
    "255": "255°",
    "270": "270° (Ouest)",
    "285": "285°",
    "300": "300°",
    "315": "315° (Nord-Ouest)",
    "330": "330°",
    "345": "345°"
  };

  /** Runtime grid: cells[tilt][az] = { ac_annual, ... } — annual kWh only from grid */
  let gridCells = null;
  let gridReady = false;
  let gridStatus = "loading"; // loading | ready | error

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

  /**
   * Winter-loss fraction W from tilt (whole percent → fraction).
   * ≤45° → 18%; 90° → 0%; else round(18 * (90 - tilt) / 45) / 100
   * Table: 0→18, 45→18, 60→12, 75→6, 90→0
   */
  function winterWFromTilt(tilt) {
    const t = Number(tilt);
    if (!isFinite(t)) return 0.18;
    if (t <= 45) return 0.18;
    if (t >= 90) return 0;
    return Math.round(18 * (90 - t) / 45) / 100;
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
      return { ac_annual: c.ac_annual, W_winter: c.W_winter, source: "grid" };
    }
    // Never blank forever: S/30 annual as secours for any missing cell
    return {
      ac_annual: FALLBACK_S30.ac_annual,
      W_winter: FALLBACK_S30.W_winter,
      source: "fallback"
    };
  }

  /** kWh_effectif = kWh_annuel * (1 - (1 - deneigement) * W) */
  function applyDeneigement(kWhAnnuel, d, W) {
    const w = isFinite(W) ? W : 0.18;
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
    // v0.2: W from tilt model (not per-cell orientation W)
    const W = winterWFromTilt(tilt);

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
      gridReady, gridStatus, cellSource: cell.source
    };
  }

  function updateTiltViz(tiltDeg) {
    const line = $("tiltLine");
    const label = $("tiltDegLabel");
    if (!line) return;
    const t = Number(tiltDeg);
    const rad = (t * Math.PI) / 180;
    const len = 40;
    const x1 = 12, y1 = 40;
    // Panel rises from hinge: 0° = flat to the right, 90° = straight up
    const x2 = x1 + len * Math.cos(rad);
    const y2 = y1 - len * Math.sin(rad);
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    if (label) label.textContent = Math.round(t) + "°";
  }

  function updateGridStatusUi() {
    const el = $("gridStatus");
    if (!el) return;
    el.classList.remove("is-loading", "is-error", "is-ready");
    if (gridStatus === "loading") {
      el.hidden = false;
      el.setAttribute("aria-busy", "true");
      el.classList.add("is-loading");
      el.textContent = "Chargement de la grille d’irradiation…";
    } else if (gridStatus === "error") {
      el.hidden = false;
      el.setAttribute("aria-busy", "false");
      el.classList.add("is-error");
      el.textContent = "Grille indisponible — estimation de secours (réf. Sud / 30°).";
    } else {
      el.hidden = true;
      el.setAttribute("aria-busy", "false");
      el.classList.add("is-ready");
      el.textContent = "";
    }
  }

  function render() {
    const r = calc();
    if ($("utilVal")) $("utilVal").textContent = Math.round(r.util * 100) + " %";
    if ($("priceVal")) $("priceVal").textContent = fmtNum(r.priceW, 2) + " $/W";
    if ($("deneigeVal")) {
      $("deneigeVal").textContent = Math.round(r.deneige * 100) + " %";
    }
    if ($("deneigeLive")) {
      // Integer % (W-by-tilt model is whole percents; live loss rounded)
      const lossPct = Math.round((1 - r.deneige) * r.W * 100);
      $("deneigeLive").innerHTML = "−" + lossPct + "&nbsp;% annuel";
    }
    updateTiltViz(r.tilt);
    updateGridStatusUi();

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

  /** Integer-only area: paste/blur/change/input */
  function roundAreaInput() {
    const el = $("area");
    if (!el) return;
    const raw = String(el.value).trim();
    if (raw === "" || raw === "-" || raw === ".") return;
    const v = parseFloat(raw.replace(",", "."));
    if (!isFinite(v)) {
      el.value = "0";
      return;
    }
    el.value = String(Math.max(0, Math.round(v)));
  }

  function setUnit(u) {
    const prevM2 = areaM2();
    areaUnit = u;
    $("unitM2").classList.toggle("active", u === "m2");
    $("unitSqft").classList.toggle("active", u === "sqft");
    const pu = $("printUnit");
    if (pu) pu.textContent = u === "sqft" ? "pi²" : "m²";
    if (prevM2 > 0) {
      $("area").value = u === "sqft"
        ? String(Math.round(prevM2 * SQFT_PER_M2))
        : String(Math.round(prevM2));
    }
    render();
  }

  function printPdf() {
    window.print();
  }

  function reportBug(e) {
    e.preventDefault();
    const subject = encodeURIComponent("Calculateur solaire version 0.2 — signalement");
    const body = encodeURIComponent(
      "Décris le bug ou l'erreur de calcul:\n\n" +
      "Entrées:\n" + JSON.stringify(calc(), null, 2)
    );
    window.location.href = "mailto:hello@solutionera.com?subject=" + subject + "&body=" + body;
  }

  let infoOpener = null;

  function modalFocusables() {
    const m = $("infoModal");
    if (!m || m.hidden) return [];
    const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(m.querySelectorAll(sel)).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function trapModalTab(e) {
    const m = $("infoModal");
    if (!m || m.hidden || e.key !== "Tab") return;
    const list = modalFocusables();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !m.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last || !m.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function openInfo() {
    const m = $("infoModal");
    if (!m) return;
    infoOpener = document.activeElement;
    m.hidden = false;
    document.body.classList.add("modal-open");
    const closer = $("btnInfoClose");
    if (closer) closer.focus();
  }
  function closeInfo() {
    const m = $("infoModal");
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.classList.remove("modal-open");
    const back = infoOpener && document.contains(infoOpener) ? infoOpener : $("btnInfo");
    if (back && typeof back.focus === "function") back.focus();
    infoOpener = null;
  }

  function wireUi() {
    ["tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    const area = $("area");
    if (area) {
      area.addEventListener("input", () => { roundAreaInput(); render(); });
      area.addEventListener("change", () => { roundAreaInput(); render(); });
      area.addEventListener("blur", () => { roundAreaInput(); render(); });
      area.addEventListener("paste", () => {
        // After clipboard lands in the field, coerce to integer
        requestAnimationFrame(() => { roundAreaInput(); render(); });
      });
    }
    $("unitM2").addEventListener("click", () => setUnit("m2"));
    $("unitSqft").addEventListener("click", () => setUnit("sqft"));
    $("btnPdf").addEventListener("click", printPdf);
    document.querySelectorAll(".bug-report").forEach((a) => {
      a.addEventListener("click", reportBug);
    });
    if ($("btnInfo")) $("btnInfo").addEventListener("click", openInfo);
    if ($("btnInfoClose")) $("btnInfoClose").addEventListener("click", closeInfo);
    if ($("btnInfoOk")) $("btnInfoOk").addEventListener("click", closeInfo);
    if ($("infoModal")) {
      $("infoModal").addEventListener("click", (e) => {
        if (e.target === $("infoModal")) closeInfo();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeInfo();
      trapModalTab(e);
    });

    $("priceW").value = 3;
    $("util").value = 80;
    if ($("deneige")) $("deneige").value = Math.round(DEFAULT_DENEIGEMENT * 100);
    $("tilt").value = "30";
    $("orient").value = "180";
    $("rate").value = String(DEFAULT_RATE);
    $("taxes").checked = true;
    $("subv").checked = true; // LogisVert on by default (v0.2)
    $("area").value = 40;
  }

  function setGridFromPayload(data) {
    if (data && data.cells) {
      gridCells = data.cells;
      gridReady = true;
      gridStatus = "ready";
      return true;
    }
    return false;
  }

  async function loadGrid() {
    gridStatus = "loading";
    updateGridStatusUi();
    try {
      const res = await fetch("assets/quebec-full-grid.json", { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!setGridFromPayload(data)) throw new Error("payload sans cells");
    } catch (err) {
      console.warn("Grille Québec non chargée — repli S/30", err);
      gridReady = false;
      gridStatus = "error";
    }
    updateGridStatusUi();
  }

  window.SolarCalcV02 = {
    calc,
    applyDeneigement,
    lookupCell,
    winterWFromTilt,
    AZ_LABELS,
    roundAreaInput,
    constants: {
      PANEL_KW_PER_M2,
      TAX_MULT,
      DEFAULT_RATE,
      DEFAULT_DENEIGEMENT,
      FALLBACK_S30
    },
    get gridReady() { return gridReady; },
    get gridStatus() { return gridStatus; },
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
  // Back-compat alias
  window.SolarCalcV01 = window.SolarCalcV02;

  document.addEventListener("DOMContentLoaded", async () => {
    wireUi();
    render();
    await loadGrid();
    render();
  });

  // Skip-link: after #main jump, browsers leave focus on <body> — move it to main
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest("a.skip-link");
    if (!link) return;
    const main = document.getElementById("main");
    if (!main) return;
    requestAnimationFrame(() => { main.focus(); });
  });

})();
