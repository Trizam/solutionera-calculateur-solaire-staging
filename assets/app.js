/* Calculateur Solaire version 0.2 — Solution Era — Québec full grid + W-by-tilt */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  // Used for ANY missing cell so calc never stays blank forever
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323, ac_dec: 53.274 };
  const DEFAULT_DENEIGEMENT = 0.20;
  const DAYS_IN_DEC = 31;

  const PANEL_KW_PER_M2 = 0.20;
  /** Standard pedagogical panel footprint (not used for kWc). */
  const PANEL_M2 = 2;
  /** Implied module wattage: 2 m² × 0,20 kW/m² → 400 W. Kept for docs / export. */
  const PANEL_W = 400;
  const TAX_MULT = 1.14975; // TPS 5% + TVQ 9.975% (display shows ~15 %)
  const RATE_D_T2_HT = 0.11142; // Tarif D 2e tranche HT, 1 avr 2026 (11,142 ¢/kWh)
  // 0.11142 × 1.14975 = 0.128105115 → pedagogic default rounded to 5 decimals
  const DEFAULT_RATE_CENTS = 12.811; // champ tarif: ¢/kWh (2e tranche TTC)
  const DEFAULT_RATE = 0.12811; // DEFAULT_RATE_CENTS / 100 — $/kWh for money math
  /** Ballpark résidentiel Québec (~17 600 kWh/ménage HQ) — round pedagogical default */
  const DEFAULT_CONSO_KWH = 17000;
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
  const AZ_STEP = 15;

  /** Snap compass degrees to the 15° grid (0…345). Invalid → 180 (Sud). */
  function snapAzimuth(deg) {
    const n = Number(deg);
    if (!isFinite(n)) return 180;
    let x = ((n % 360) + 360) % 360;
    x = Math.round(x / AZ_STEP) * AZ_STEP;
    if (x === 360) x = 0;
    return x;
  }

  /**
   * Compass azimuth from offsets relative to dial centre.
   * 0° = Nord (up), clockwise. Tiny/zero vector → 180 (Sud).
   */
  function azimuthFromOffsets(dx, dy) {
    if (!isFinite(dx) || !isFinite(dy)) return 180;
    if (dx === 0 && dy === 0) return 180;
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    return snapAzimuth(deg);
  }

  function orientLabelFor(az) {
    const key = String(snapAzimuth(az));
    return AZ_LABELS[key] || (key + "°");
  }

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

  /**
   * Loi des deux chiffres (docs/DESIGN.md) — affichage seulement.
   * Magnitude-round to 2 significant figures. 14230 → 14000, 874 → 870, 12.53 → 13.
   * Les calculs ne passent jamais par ici. #showDetails montre la précision de lecture.
   */
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

  /** Poster-style 2 sig figs, FR grouping. Integers drop decimals (13%, 14 000); 6.4 → « 6,4 ». */
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

  /** Currency with the same 2-sig-fig scheme as production (display only). 15675 → 16 000 $. */
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
  /** View preference. Absent checkbox = rounded display (the default). */
  function detailsOn() {
    const el = $("showDetails");
    return !!(el && el.checked);
  }

  /** Result number: 2 sig figs, or `digits` decimals when details are on. */
  function fmtShown(n, digits) {
    if (!isFinite(n)) return "—";
    if (detailsOn()) return fmtNum(n, digits);
    return fmtSig2(n);
  }

  /** Result money: 2 sig figs, or cents when details are on. */
  function fmtShownMoney(n) {
    if (!isFinite(n)) return "—";
    if (detailsOn()) return fmtMoney(n);
    return fmtMoneySig2(n);
  }

  function fmtDaysFr(n) {
    if (!isFinite(n)) return "—";
    const whole = Math.abs(n - Math.round(n)) < 1e-9;
    return n.toLocaleString("fr-CA", {
      minimumFractionDigits: whole ? 0 : 1,
      maximumFractionDigits: 1
    });
  }

  function fmtYears(n) {
    if (!isFinite(n) || n <= 0) return "—";
    if (n > 100) return "> 100 ans";
    if (detailsOn()) return "~ " + fmtNum(n, 1) + " ans";
    return "~ " + fmtSig2(n) + " ans";
  }

  function prefGet(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function prefSet(key, value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  /** Grouping spaces used by FR locales (regular, NBSP, NNBSP, thin). */
  const GROUP_SEP_RE = /[\s\u00A0\u202F\u2009\u2007]/g;

  function digitsOnly(raw) {
    return String(raw == null ? "" : raw).replace(GROUP_SEP_RE, "").replace(/[^\d]/g, "");
  }

  /** Parse a grouped FR integer ("17 000", "17000") → number or NaN. */
  function parseGroupedInt(raw) {
    const digits = digitsOnly(raw);
    if (digits === "") return NaN;
    const v = parseInt(digits, 10);
    return isFinite(v) ? v : NaN;
  }

  /** Integer with a visible thousand space, same grouping as page copy (17 000). */
  function fmtGroupedInt(n) {
    if (!isFinite(n)) return "";
    const digits = String(Math.max(0, Math.round(n)));
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function formatConsoInput(keepCursor) {
    const el = $("conso");
    if (!el) return;
    const old = String(el.value);
    const digits = digitsOnly(old);
    if (digits === "") {
      if (old !== "") el.value = "";
      return;
    }
    const next = fmtGroupedInt(parseInt(digits, 10));
    if (next === old) return;
    let sel = 0;
    if (keepCursor && typeof el.selectionStart === "number") {
      sel = old.slice(0, el.selectionStart).replace(/\D/g, "").length;
    }
    el.value = next;
    if (keepCursor) {
      let pos = 0;
      let seen = 0;
      while (pos < next.length && seen < sel) {
        if (/\d/.test(next.charAt(pos))) seen += 1;
        pos += 1;
      }
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }
  }

  /**
   * Winter-loss fraction W from tilt (whole percent → fraction).
   * ≤45° → 18%; 90° → 0%; else round(18 * (90 - tilt) / 45) / 100
   * Table: 0→18, 45→18, 60→12, 75→6, 90→0
   * Used for mesurage net (annual). December / autonomie uses snowCoverFromTilt.
   */
  function winterWFromTilt(tilt) {
    const t = Number(tilt);
    if (!isFinite(t)) return 0.18;
    if (t <= 45) return 0.18;
    if (t >= 90) return 0;
    return Math.round(18 * (90 - t) / 45) / 100;
  }

  /**
   * Share of December production at risk if panels are not cleared.
   * ≤45° → 1 (décembre entier à zéro si d=0); 90° → 0; same steps as W / 0.18
   * Table: 0→1, 45→1, 60→2/3, 75→1/3, 90→0
   */
  function snowCoverFromTilt(tilt) {
    const W = winterWFromTilt(tilt);
    if (W <= 0) return 0;
    return W / 0.18;
  }

  /** Recommend vertical panels unless the user already clears 100 % or is at 90°. */
  function recommendVerticalPanels(deneige, tilt) {
    const d = Number(deneige);
    const t = Number(tilt);
    if (!isFinite(d) || d >= 1) return false;
    if (!isFinite(t) || t >= 90) return false;
    return true;
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
      const decRaw = c.ac_monthly && c.ac_monthly.dec;
      const ac_dec = isFinite(Number(decRaw)) ? Number(decRaw) : FALLBACK_S30.ac_dec;
      return { ac_annual: c.ac_annual, W_winter: c.W_winter, ac_dec: ac_dec, source: "grid" };
    }
    // Never blank forever: S/30 annual as secours for any missing cell
    return {
      ac_annual: FALLBACK_S30.ac_annual,
      W_winter: FALLBACK_S30.W_winter,
      ac_dec: FALLBACK_S30.ac_dec,
      source: "fallback"
    };
  }

  /** kWh_effectif = kWh_annuel * (1 - (1 - deneigement) * W) */
  function applyDeneigement(kWhAnnuel, d, W) {
    const w = isFinite(W) ? W : 0.18;
    return kWhAnnuel * (1 - (1 - d) * w);
  }

  /** Annual household consumption (kWh). Empty / invalid → no cap. */
  function consoAnnuelleKwh() {
    const el = $("conso");
    if (!el) return null;
    const v = parseGroupedInt(el.value);
    if (!isFinite(v) || v <= 0) return null;
    return v;
  }

  /**
   * Field is ¢/kWh. Convert to $/kWh for money math.
   * Empty / invalid → default 2e tranche TTC (issue #59: 9,53 stays 9,53 ¢).
   */
  function rateDollarsPerKwh(raw) {
    const v = typeof raw === "number" ? raw : parseFloat(String(raw).trim().replace(",", "."));
    if (!isFinite(v) || v <= 0) return DEFAULT_RATE;
    return v / 100;
  }

  /** Daily kWh from annual consumption. Exact: the field may show fewer decimals. */
  function kwhJourAuto(conso) {
    if (!isFinite(conso) || conso <= 0) return NaN;
    return conso / 365;
  }

  /**
   * Battery quote at full precision.
   * reserve kWh = kWh/day × days. Cost = reserve × $/kWh, × taxes when requested.
   * days = 0 → no battery. LogisVert is not applied here.
   */
  function batteryQuote(kwhJour, reserveDays, pricePerKwh, taxesOn) {
    const days = isFinite(reserveDays) ? reserveDays : 0;
    const kwh = days === 0 ? 0 : (isFinite(kwhJour) ? kwhJour * days : NaN);
    const ht = isFinite(kwh) && isFinite(pricePerKwh) ? kwh * pricePerKwh : NaN;
    const taxes = taxesOn && isFinite(ht) ? ht * (TAX_MULT - 1) : 0;
    const cost = isFinite(ht) ? ht + taxes : NaN;
    return { kwh: kwh, ht: ht, taxes: taxes, cost: cost };
  }

  /** kWh_credites = min(production, consommation) when conso is provided */
  function creditKwh(kWhProd, kWhConso) {
    if (!isFinite(kWhProd) || kWhProd < 0) return 0;
    if (!isFinite(kWhConso) || kWhConso <= 0) return kWhProd;
    return Math.min(kWhProd, kWhConso);
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
    const rateOk = rateDollarsPerKwh($("rate").value);

    const cell = lookupCell(tilt, az);
    const table = cell.ac_annual;
    // v0.2: W from tilt model (not per-cell orientation W)
    const W = winterWFromTilt(tilt);

    const usedM2 = m2 * util;
    const kW = usedM2 * PANEL_KW_PER_M2;
    const nPv = usedM2 > 0 ? Math.round(usedM2 / PANEL_M2) : NaN;
    const kWhAnnuel = table * kW;
    const kWh = applyDeneigement(kWhAnnuel, deneige, W);
    const kWhDecMonth = (isFinite(cell.ac_dec) ? cell.ac_dec : FALLBACK_S30.ac_dec) * kW;
    // Autonomie (décembre) : 100 % du mois est à risque neige, pas le W annuel 18 %.
    const snowCover = snowCoverFromTilt(tilt);
    const kWhDec = applyDeneigement(kWhDecMonth, deneige, snowCover);
    const showVerticalRec = recommendVerticalPanels(deneige, tilt);

    const HT = kW * 1000 * priceW;
    const TTC = HT * TAX_MULT;
    const taxes = TTC - HT;
    const subv = subvOn ? Math.min(1000 * kW, 0.4 * HT) : 0;
    const base = taxesOn ? TTC : HT;
    const reel = Math.max(0, base - subv);
    const conso = consoAnnuelleKwh();
    const kWhCredites = creditKwh(kWh, conso);
    const ecoClamped = conso != null && kWh > conso;
    const eco = kWhCredites * rateOk;
    const years = eco > 0 ? reel / eco : Infinity;

    const kWhDay = isFinite(kWhDec) ? kWhDec / DAYS_IN_DEC : NaN;
    const jourEl = $("kwhJour");
    const kwhJourManual = !!(jourEl && jourEl.getAttribute("data-manual") === "1");
    let kwhJour = kwhJourAuto(conso);
    if (kwhJourManual && jourEl) {
      const typed = parseFloat(String(jourEl.value).trim().replace(/\s/g, "").replace(",", "."));
      if (isFinite(typed) && typed >= 0) kwhJour = typed;
    }
    const reserveDays = readRange("reserveDays", 0, 5, 0.5, 1);
    const battPrice = readRange("battPrice", 600, 2000, 50, 1200);
    const batt = batteryQuote(kwhJour, reserveDays, battPrice, taxesOn);
    const project = isFinite(batt.cost) ? reel + batt.cost : NaN;
    return {
      m2, util, deneige, tilt, az, priceW, taxesOn, subvOn, rateOk,
      kW, nPv, table, kWhAnnuel, kWh, kWhDecMonth, kWhDec, kWhDay, W, snowCover, showVerticalRec,
      conso, kWhCredites, ecoClamped,
      HT, TTC, taxes, subv, reel, eco, years,
      kwhJour, kwhJourManual, reserveDays, kwhReserve: batt.kwh,
      battPrice, battHT: batt.ht, battTaxes: batt.taxes, battCost: batt.cost, project,
      gridReady, gridStatus, cellSource: cell.source
    };
  }

  function ensureOrientTicks() {
    const g = $("orientTicks");
    if (!g || g.childElementCount) return;
    const ns = "http://www.w3.org/2000/svg";
    const cx = 100;
    const cy = 100;
    for (let i = 0; i < 24; i++) {
      const az = i * AZ_STEP;
      const major = az % 90 === 0;
      const rad = (az * Math.PI) / 180;
      const r1 = major ? 76 : 82;
      const r2 = 90;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("class", major ? "orient-tick is-major" : "orient-tick");
      line.setAttribute("x1", String(cx + r1 * Math.sin(rad)));
      line.setAttribute("y1", String(cy - r1 * Math.cos(rad)));
      line.setAttribute("x2", String(cx + r2 * Math.sin(rad)));
      line.setAttribute("y2", String(cy - r2 * Math.cos(rad)));
      g.appendChild(line);
    }
  }

  function updateOrientDial(az) {
    const snapped = snapAzimuth(az);
    const needle = $("orientNeedle");
    if (needle) needle.setAttribute("transform", "rotate(" + snapped + " 100 100)");
    const val = $("orientVal");
    if (val) val.textContent = orientLabelFor(snapped);
  }

  /**
   * Circular compass: map pointer to 15° azimuth and write #orient.
   * Mobile: start on the padded face, then follow the finger on window
   * so a drag can swing around (and outside) the gage without dropping.
   * Do not focus the clipped <select> after touch — iOS would open the picker.
   */
  function wireOrientDial() {
    const dial = $("orientDial");
    const input = $("orient");
    const wrap = $("orientControl");
    if (!dial || !input || !wrap) return;
    ensureOrientTicks();
    updateOrientDial(input.value);

    let touching = false;
    let viaTouch = false;
    let activeId = null;
    let mouseDown = false;
    let winTouchWired = false;

    function faceRect() {
      const svg = dial.querySelector(".orient-dial-svg");
      return (svg || dial).getBoundingClientRect();
    }

    function applyClient(clientX, clientY, fireChange) {
      const rect = faceRect();
      if (!rect.width || !rect.height) return;
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < 10) return;
      const next = String(azimuthFromOffsets(dx, dy));
      if (input.value !== next) {
        input.value = next;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (fireChange) input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function nearFace(clientX, clientY) {
      const rect = faceRect();
      if (!rect.width || !rect.height) return false;
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const r = Math.min(rect.width, rect.height) / 2;
      return Math.hypot(dx, dy) <= r + 28;
    }

    function startVisual() {
      wrap.classList.add("is-orient-dragging");
      setRangeDragging(true);
    }
    function stopVisual() {
      wrap.classList.remove("is-orient-dragging");
      setRangeDragging(false);
    }

    function onWinTouchMove(e) {
      if (!touching || !e.touches || !e.touches[0]) return;
      applyClient(e.touches[0].clientX, e.touches[0].clientY, false);
      if (e.cancelable) e.preventDefault();
    }
    function onWinTouchEnd(e) {
      if (!touching) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) applyClient(t.clientX, t.clientY, true);
      touching = false;
      stopVisual();
      setTimeout(function () { if (!touching) viaTouch = false; }, 0);
    }
    function ensureWinTouch() {
      if (winTouchWired) return;
      winTouchWired = true;
      window.addEventListener("touchmove", onWinTouchMove, { passive: false, capture: true });
      window.addEventListener("touchend", onWinTouchEnd, { capture: true });
      window.addEventListener("touchcancel", onWinTouchEnd, { capture: true });
    }

    wrap.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches[0]) return;
      if (e.target === input) return;
      const t = e.touches[0];
      if (!nearFace(t.clientX, t.clientY)) return;
      touching = true;
      viaTouch = true;
      activeId = null;
      startVisual();
      ensureWinTouch();
      applyClient(t.clientX, t.clientY, false);
      e.preventDefault();
    }, { passive: false });

    if (typeof window.PointerEvent === "function") {
      wrap.addEventListener("pointerdown", function (e) {
        if (viaTouch || touching) return;
        if (e.target === input) return;
        if (!nearFace(e.clientX, e.clientY)) return;
        activeId = e.pointerId;
        startVisual();
        try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
        applyClient(e.clientX, e.clientY, false);
        e.preventDefault();
      }, { passive: false });
      wrap.addEventListener("pointermove", function (e) {
        if (viaTouch || touching) return;
        if (activeId === null || e.pointerId !== activeId) return;
        applyClient(e.clientX, e.clientY, false);
        e.preventDefault();
      }, { passive: false });
      function endPointer(e) {
        if (viaTouch || touching) { activeId = null; return; }
        if (activeId === null || e.pointerId !== activeId) return;
        applyClient(e.clientX, e.clientY, true);
        activeId = null;
        stopVisual();
        try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      wrap.addEventListener("pointerup", endPointer);
      wrap.addEventListener("pointercancel", endPointer);
    } else {
      wrap.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        if (!nearFace(e.clientX, e.clientY)) return;
        mouseDown = true;
        startVisual();
        applyClient(e.clientX, e.clientY, false);
        e.preventDefault();
      });
      window.addEventListener("mousemove", function (e) {
        if (!mouseDown) return;
        applyClient(e.clientX, e.clientY, false);
      });
      window.addEventListener("mouseup", function (e) {
        if (!mouseDown) return;
        mouseDown = false;
        applyClient(e.clientX, e.clientY, true);
        stopVisual();
      });
    }
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

  let lastGridUiStatus = null;
  function updateGridStatusUi() {
    const el = $("gridStatus");
    if (!el) return;
    // Avoid thrashing DOM (and retry button) on every slider render
    if (lastGridUiStatus === gridStatus) return;
    lastGridUiStatus = gridStatus;
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
      el.innerHTML = 'Grille indisponible — estimation de secours (réf. Sud / 30°). <button type="button" class="grid-retry" id="btnGridRetry">Réessayer</button>';
      const btn = $("btnGridRetry");
      if (btn && !btn._wired) {
        btn._wired = true;
        btn.addEventListener("click", function () {
          loadGrid().then(function () { render(); });
        });
      }
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
    if ($("deneigeLive")) {
      const lossPct = (1 - r.deneige) * r.W * 100;
      $("deneigeLive").innerHTML = detailsOn()
        ? ("−" + fmtNum(lossPct, 1) + "&nbsp;%")
        : ("−" + fmtSig2(lossPct) + "&nbsp;%");
    }
    if ($("tiltVal")) $("tiltVal").textContent = Math.round(Number(r.tilt)) + "°";
    updateTiltViz(r.tilt);
    updateOrientDial(r.az);
    if ($("tiltWLabel")) {
      const wPct = r.W * 100;
      $("tiltWLabel").innerHTML = (detailsOn() ? fmtNum(wPct, 1) : fmtSig2(r.W * 100)) + "&nbsp;%";
    }
    updateGridStatusUi();

    if ($("outKwhDay")) {
      const dayNum = $("outKwhDay").querySelector(".prod-num");
      if (dayNum) dayNum.textContent = fmtShown(r.kWhDay, 2);
    }
    if ($("outKwh")) {
      const yearNum = $("outKwh").querySelector(".prod-num");
      if (yearNum) yearNum.textContent = fmtShown(r.kWh, 0);
    }
    if ($("outPv")) {
      const pvNum = $("outPv").querySelector(".prod-num");
      if (pvNum) pvNum.textContent = isFinite(r.nPv) ? fmtNum(r.nPv, 0) : "—";
    }
    if ($("outKw")) {
      const kwNum = $("outKw").querySelector(".prod-num");
      if (kwNum) kwNum.textContent = fmtShown(r.kW, 2);
    }
    const snowBox = $("autonomySnow");
    if (snowBox) {
      snowBox.hidden = !r.showVerticalRec;
      snowBox.classList.toggle("is-zero", r.showVerticalRec && r.kWhDec <= 0);
    }
    $("outLight").textContent =
      fmtNum(r.kW * 1000, 0) + " W × " + fmtNum(r.priceW, 2) + " $/W = " + fmtShownMoney(r.HT) + " (HT)";

    $("lineHT").textContent = fmtShownMoney(r.HT);
    $("lineTaxes").textContent = r.taxesOn ? fmtShownMoney(r.taxes) : "—";
    $("lineSubv").textContent = r.subvOn ? ("− " + fmtShownMoney(r.subv)) : "—";
    $("lineTotal").textContent = fmtShownMoney(r.reel);

    $("outEcoYear").textContent = "≈ " + fmtShownMoney(r.eco) + " / an";
    if ($("outEcoFormula")) {
      $("outEcoFormula").textContent = r.ecoClamped
        ? "Crédit (plafonné à la conso) × tarif"
        : "Production × tarif";
    }
    $("kpiReel").textContent = fmtShownMoney(r.reel);
    $("kpiEco").textContent = fmtShownMoney(r.eco);
    const note = $("kpiEcoNote");
    if (note) note.hidden = !r.ecoClamped;
    $("kpiYears").textContent = fmtYears(r.years);
    const yearText = !isFinite(r.years) || r.years <= 0
      ? "—"
      : (detailsOn() ? fmtNum(r.years, 1) : fmtSig2(r.years)) + " ans";
    $("outPayback").textContent = "Coût réel ÷ économies/an ≈ " + yearText;

    syncAutoKwhJour(r.conso);
    if ($("reserveVal")) $("reserveVal").textContent = fmtDaysFr(r.reserveDays) + " j";
    if ($("battPriceVal")) $("battPriceVal").textContent = fmtGroupedInt(r.battPrice) + " $";
    if ($("outReserveEq")) {
      $("outReserveEq").textContent = isFinite(r.kwhJour)
        ? fmtShown(r.kwhJour, 2) + " kWh/j × " + fmtDaysFr(r.reserveDays) + " j"
        : "—";
    }
    const reserveNum = $("outReserve") && $("outReserve").querySelector(".prod-num");
    if (reserveNum) reserveNum.textContent = fmtShown(r.kwhReserve, 2);
    if ($("outBattEq")) {
      $("outBattEq").textContent = isFinite(r.battHT)
        ? fmtShown(r.kwhReserve, 2) + " kWh × " + fmtGroupedInt(r.battPrice) + " $/kWh = " + fmtShownMoney(r.battHT) + " (HT)"
        : "—";
    }
    const battNum = $("outBatt") && $("outBatt").querySelector(".prod-num");
    if (battNum) battNum.textContent = fmtShownMoney(r.battCost);
    if ($("outBattUnit")) {
      $("outBattUnit").textContent = r.taxesOn ? "taxes incluses" : "hors taxes";
    }
    if ($("outProjectEq")) {
      $("outProjectEq").textContent = isFinite(r.project)
        ? fmtShownMoney(r.reel) + " + " + fmtShownMoney(r.battCost)
        : "—";
    }
    if ($("lineSolar")) $("lineSolar").textContent = fmtShownMoney(r.reel);
    if ($("lineBattery")) $("lineBattery").textContent = fmtShownMoney(r.battCost);
    const projectNum = $("outProject") && $("outProject").querySelector(".prod-num");
    if (projectNum) projectNum.textContent = fmtShownMoney(r.project);
    syncScenarioUrl();
  }

  /** Keep the daily field on annual ÷ 365 until the person edits it. */
  function syncAutoKwhJour(conso) {
    const el = $("kwhJour");
    if (!el || el.getAttribute("data-manual") === "1") return;
    if (typeof document !== "undefined" && document.activeElement === el) return;
    const auto = kwhJourAuto(conso);
    const next = isFinite(auto) ? trimNum(auto, 1) : "";
    if (el.value !== next) el.value = next;
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

  function paintUnit(u) {
    areaUnit = u === "sqft" ? "sqft" : "m2";
    const m2 = areaUnit === "m2";
    $("unitM2").classList.toggle("active", m2);
    $("unitSqft").classList.toggle("active", !m2);
    $("unitM2").setAttribute("aria-pressed", m2 ? "true" : "false");
    $("unitSqft").setAttribute("aria-pressed", !m2 ? "true" : "false");
    const pu = $("printUnit");
    if (pu) pu.textContent = m2 ? "m²" : "pi²";
  }

  function setUnit(u) {
    const prevM2 = areaM2();
    paintUnit(u);
    if (prevM2 > 0) {
      $("area").value = areaUnit === "sqft"
        ? String(Math.round(prevM2 * SQFT_PER_M2))
        : String(Math.round(prevM2));
    }
    onScenarioEdit();
  }

  /**
   * Shareable roof scenario. Only non-default inputs go in the query.
   * Area is the number on screen; unit=sqft does not convert it.
   */
  const SCENARIO_DEFAULTS = {
    area: 40,
    unit: "m2",
    util: 80,
    orient: 180,
    tilt: 30,
    deneige: Math.round(DEFAULT_DENEIGEMENT * 100),
    priceW: 3,
    taxes: true,
    subv: true,
    conso: DEFAULT_CONSO_KWH,
    rate: DEFAULT_RATE_CENTS,
    reserve: 1,
    battPrice: 1200,
    kwhJour: null
  };

  function snapStep(n, min, max, step) {
    const x = Number(n);
    if (!isFinite(x)) return NaN;
    let v = Math.round(x / step) * step;
    if (v < min) v = min;
    if (v > max) v = max;
    const places = (String(step).split(".")[1] || "").length;
    v = Number(v.toFixed(places));
    if (v < min) v = min;
    if (v > max) v = max;
    return v;
  }

  function trimNum(n, places) {
    return Number(n).toFixed(places).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  function parseUnitParam(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase().replace(/²/g, "2").replace(/\s+/g, "");
    if (s === "m2" || s === "m") return "m2";
    if (s === "sqft" || s === "pi2" || s === "ft2" || s === "p2") return "sqft";
    return null;
  }

  function parseFlagParam(raw, fallback) {
    if (raw == null) return fallback;
    const s = String(raw).trim().toLowerCase();
    if (s === "0" || s === "false" || s === "off" || s === "non" || s === "no") return false;
    if (s === "1" || s === "true" || s === "on" || s === "oui" || s === "yes") return true;
    return fallback;
  }

  function parseScenarioSearch(search) {
    const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const d = SCENARIO_DEFAULTS;
    let area = d.area;
    if (q.has("area")) {
      const v = parseFloat(String(q.get("area")).trim().replace(",", "."));
      if (isFinite(v)) area = Math.max(0, Math.round(v));
    }
    const unit = parseUnitParam(q.get("unit")) || d.unit;
    let util = d.util;
    if (q.has("util")) {
      const v = snapStep(q.get("util"), 60, 100, 1);
      if (isFinite(v)) util = v;
    }
    const orient = q.has("orient") ? snapAzimuth(q.get("orient")) : d.orient;
    let tilt = d.tilt;
    if (q.has("tilt")) {
      const v = snapStep(q.get("tilt"), 0, 90, 15);
      if (isFinite(v)) tilt = v;
    }
    let deneige = d.deneige;
    if (q.has("deneige")) {
      const v = snapStep(q.get("deneige"), 0, 100, 1);
      if (isFinite(v)) deneige = v;
    }
    let priceW = d.priceW;
    if (q.has("priceW")) {
      const v = snapStep(q.get("priceW"), 2.5, 4.5, 0.05);
      if (isFinite(v)) priceW = v;
    }
    const taxes = parseFlagParam(q.has("taxes") ? q.get("taxes") : null, d.taxes);
    const subv = parseFlagParam(q.has("subv") ? q.get("subv") : null, d.subv);
    let conso = d.conso;
    if (q.has("conso")) {
      const s = String(q.get("conso")).trim();
      if (s === "" || s === "0") conso = 0;
      else if (/^[\d\s\u00A0\u202F]+$/.test(s)) {
        const n = parseInt(s.replace(/[\s\u00A0\u202F]/g, ""), 10);
        if (isFinite(n)) conso = n;
      }
    }
    let rate = d.rate;
    if (q.has("rate")) {
      const s = String(q.get("rate")).trim();
      if (s !== "") {
        const v = parseFloat(s.replace(",", "."));
        if (isFinite(v) && v > 0) {
          const snapped = snapStep(v, 0.001, 100000, 0.001);
          if (isFinite(snapped)) rate = snapped;
        }
      }
    }
    let reserve = d.reserve;
    if (q.has("reserve")) {
      const v = snapStep(q.get("reserve"), 0, 5, 0.5);
      if (isFinite(v)) reserve = v;
    }
    let battPrice = d.battPrice;
    if (q.has("battPrice")) {
      const v = snapStep(q.get("battPrice"), 600, 2000, 50);
      if (isFinite(v)) battPrice = v;
    }
    let kwhJour = d.kwhJour;
    if (q.has("kwhJour")) {
      const v = parseFloat(String(q.get("kwhJour")).trim().replace(",", "."));
      if (isFinite(v) && v >= 0) kwhJour = v;
    }
    return { area, unit, util, orient, tilt, deneige, priceW, taxes, subv, conso, rate, reserve, battPrice, kwhJour };
  }

  const SCENARIO_KEYS = ["area", "unit", "util", "orient", "tilt", "deneige", "priceW", "taxes", "subv", "conso", "rate", "reserve", "battPrice", "kwhJour"];

  /** True after a control is used, or when the link already carries scenario values. */
  let scenarioSnapshot = false;

  function searchHasScenario(search) {
    const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return SCENARIO_KEYS.some(function (key) { return q.has(key); });
  }

  function onScenarioEdit() {
    scenarioSnapshot = true;
    render();
  }

  function serializeScenario(s, mode, full) {
    const d = SCENARIO_DEFAULTS;
    const p = new URLSearchParams();
    if (full) {
      p.set("mode", mode === "webi" ? "webi" : "full");
      p.set("area", String(s.area));
      p.set("unit", s.unit === "sqft" ? "sqft" : "m2");
      p.set("util", String(s.util));
      p.set("orient", String(s.orient));
      p.set("tilt", String(s.tilt));
      p.set("deneige", String(s.deneige));
      p.set("priceW", trimNum(s.priceW, 2));
      p.set("taxes", s.taxes ? "1" : "0");
      p.set("subv", s.subv ? "1" : "0");
      p.set("conso", String(s.conso));
      p.set("rate", trimNum(s.rate, 3));
      p.set("reserve", trimNum(s.reserve, 1));
      p.set("battPrice", String(Math.round(s.battPrice)));
      if (s.kwhJour != null) p.set("kwhJour", trimNum(s.kwhJour, 2));
      return p.toString();
    }
    if (mode === "webi") p.set("mode", "webi");
    if (s.unit === "sqft" || s.area !== d.area) p.set("area", String(s.area));
    if (s.unit === "sqft") p.set("unit", "sqft");
    if (s.util !== d.util) p.set("util", String(s.util));
    if (s.orient !== d.orient) p.set("orient", String(s.orient));
    if (s.tilt !== d.tilt) p.set("tilt", String(s.tilt));
    if (s.deneige !== d.deneige) p.set("deneige", String(s.deneige));
    if (s.priceW !== d.priceW) p.set("priceW", trimNum(s.priceW, 2));
    if (!s.taxes) p.set("taxes", "0");
    if (!s.subv) p.set("subv", "0");
    if (s.conso !== d.conso) p.set("conso", String(s.conso));
    if (Math.abs(s.rate - d.rate) > 0.0001) p.set("rate", trimNum(s.rate, 3));
    if (s.reserve !== d.reserve) p.set("reserve", trimNum(s.reserve, 1));
    if (s.battPrice !== d.battPrice) p.set("battPrice", String(Math.round(s.battPrice)));
    if (s.kwhJour != null) p.set("kwhJour", trimNum(s.kwhJour, 2));
    return p.toString();
  }

  /** Write a shared scenario onto the fields. Area stays as given; setUnit would convert it. */
  function applyScenario(s) {
    paintUnit(s.unit);
    $("area").value = String(s.area);
    $("util").value = String(s.util);
    $("orient").value = String(s.orient);
    $("tilt").value = String(s.tilt);
    if ($("deneige")) $("deneige").value = String(s.deneige);
    $("priceW").value = trimNum(s.priceW, 2);
    $("taxes").checked = !!s.taxes;
    $("subv").checked = !!s.subv;
    if ($("conso")) $("conso").value = s.conso > 0 ? fmtGroupedInt(s.conso) : "";
    $("rate").value = trimNum(s.rate, 3);
    if ($("reserveDays")) $("reserveDays").value = trimNum(s.reserve, 1);
    if ($("battPrice")) $("battPrice").value = String(Math.round(s.battPrice));
    if ($("kwhJour")) {
      if (s.kwhJour != null) {
        $("kwhJour").value = trimNum(s.kwhJour, 2);
        $("kwhJour").setAttribute("data-manual", "1");
      } else {
        $("kwhJour").removeAttribute("data-manual");
      }
    }
  }

  function readRange(id, min, max, step, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = snapStep(el.value, min, max, step);
    return isFinite(v) ? v : fallback;
  }

  function readScenarioFromDom() {
    const d = SCENARIO_DEFAULTS;
    const areaEl = $("area");
    const areaRaw = areaEl ? parseFloat(String(areaEl.value).trim().replace(",", ".")) : NaN;
    const area = isFinite(areaRaw) ? Math.max(0, Math.round(areaRaw)) : 0;
    const consoEl = $("conso");
    const consoDigits = consoEl ? digitsOnly(consoEl.value) : "";
    const conso = consoDigits === "" ? 0 : parseInt(consoDigits, 10);
    const rateEl = $("rate");
    const rateRaw = rateEl ? parseFloat(String(rateEl.value).trim().replace(",", ".")) : NaN;
    const rateSnapped = isFinite(rateRaw) && rateRaw > 0 ? snapStep(rateRaw, 0.001, 100000, 0.001) : d.rate;
    return {
      area,
      unit: areaUnit === "sqft" ? "sqft" : "m2",
      util: readRange("util", 60, 100, 1, d.util),
      orient: snapAzimuth($("orient") ? $("orient").value : d.orient),
      tilt: readRange("tilt", 0, 90, 15, d.tilt),
      deneige: readRange("deneige", 0, 100, 1, d.deneige),
      priceW: readRange("priceW", 2.5, 4.5, 0.05, d.priceW),
      taxes: $("taxes") ? !!$("taxes").checked : d.taxes,
      subv: $("subv") ? !!$("subv").checked : d.subv,
      conso: isFinite(conso) ? conso : 0,
      rate: isFinite(rateSnapped) ? rateSnapped : d.rate,
      reserve: readRange("reserveDays", 0, 5, 0.5, d.reserve),
      battPrice: readRange("battPrice", 600, 2000, 50, d.battPrice),
      kwhJour: readManualKwhJour()
    };
  }

  function readManualKwhJour() {
    const el = $("kwhJour");
    if (!el || el.getAttribute("data-manual") !== "1") return null;
    const v = parseFloat(String(el.value).trim().replace(/\s/g, "").replace(",", "."));
    return isFinite(v) && v >= 0 ? v : null;
  }

  function shareMode() {
    return currentDisplayMode() === "webi" ? "webi" : "full";
  }

  function syncScenarioUrl() {
    if (typeof history === "undefined" || !history || typeof history.replaceState !== "function") return;
    if (typeof location === "undefined" || !location) return;
    const search = serializeScenario(readScenarioFromDom(), shareMode(), scenarioSnapshot);
    const next = search ? "?" + search : "";
    if ((location.search || "") === next) return;
    const path = (location.pathname || "/") + next + (location.hash || "");
    history.replaceState(history.state, "", path);
  }

  function printPdf() {
    closeInfo();
    window.print();
  }

  const BUG_MIN_LEN = 10;
  const BUG_MIN_FORM_MS = 2000;
  const BUG_ISSUES_URL =
    "https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report";

  function bugReportEndpoint() {
    if (typeof window !== "undefined" && window.__BUG_REPORT_ENDPOINT__) {
      return String(window.__BUG_REPORT_ENDPOINT__).trim();
    }
    const meta = document.querySelector('meta[name="bug-report-endpoint"]');
    return meta ? String(meta.getAttribute("content") || "").trim() : "";
  }

  function formatBuildId(version, sha) {
    const ver = String(version || "0.2").replace(/^v/i, "");
    const shortSha = String(sha || "").replace(/^#/, "").slice(0, 7);
    return shortSha ? ("v" + ver + "+" + shortSha) : ("v" + ver);
  }

  function applyBuildId(data) {
    const el = $("buildId");
    if (!el || !data) return;
    el.textContent = formatBuildId(data.version, data.sha);
  }

  function loadBuildId() {
    fetch("assets/build.json", { cache: "no-cache" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { applyBuildId(data); })
      .catch(function () {});
  }

  function appVersionString() {
    const el = document.querySelector(".bug-ver") || document.querySelector(".brand-sub");
    const t = el ? el.textContent.replace(/\s+/g, " ") : "";
    const m = t.match(/\bv(?:ersion)?\s*([0-9.]+)/i);
    return m ? m[1] : "0.2";
  }

  function currentDisplayMode() {
    const api = typeof window !== "undefined" && window.SolarDisplayMode;
    if (api && api.current) return api.current;
    return (document.documentElement.getAttribute("data-mode") || "full").toLowerCase();
  }

  function validateBugReport(payload, nowMs) {
    const now = typeof nowMs === "number" ? nowMs : Date.now();
    const data = payload && typeof payload === "object" ? payload : {};
    if (String(data.honeypot || data.hp || "").trim() !== "") return { ok: false, reason: "honeypot" };
    const bug = String(data.bug || "").trim();
    const name = String(data.name || "").trim();
    if (bug.length < BUG_MIN_LEN) return { ok: false, reason: "bug-min" };
    const openedAt = Number(data.openedAt);
    if (!isFinite(openedAt) || now - openedAt < BUG_MIN_FORM_MS) {
      return { ok: false, reason: "too-fast" };
    }
    return { ok: true, bug: bug, name: name };
  }

  let bugOpenedAt = 0;
  let bugSubmitting = false;
  let bugUnlockTimer = null;

  function setBugStatus(msg) {
    const el = $("bugFormStatus");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = msg;
  }

  function resetBugForm() {
    const form = $("bugForm");
    if (form) form.reset();
    if ($("bugHp")) $("bugHp").value = "";
    setBugStatus("");
    if ($("bugForm")) $("bugForm").hidden = false;
    if ($("bugSuccess")) $("bugSuccess").hidden = true;
    bugSubmitting = false;
    const btn = $("btnBugSubmit");
    if (btn) btn.disabled = true;
    if (bugUnlockTimer) clearTimeout(bugUnlockTimer);
    bugOpenedAt = Date.now();
    bugUnlockTimer = setTimeout(function () {
      if ($("btnBugSubmit") && !bugSubmitting) $("btnBugSubmit").disabled = false;
    }, BUG_MIN_FORM_MS);
  }

  function showBugSuccess(url) {
    if ($("bugForm")) $("bugForm").hidden = true;
    const ok = $("bugSuccess");
    if (ok) ok.hidden = false;
    const link = $("bugIssueLink");
    if (link) {
      link.href = url || BUG_ISSUES_URL;
      link.textContent = url ? "Ouvrir le signalement" : "Voir les signalements";
    }
    const closer = $("btnBugOk") || $("btnBugClose");
    if (closer) closer.focus();
  }

  function openBugReport(e) {
    if (e) e.preventDefault();
    resetBugForm();
    openModal("bugModal");
    const field = $("bugText");
    if (field) {
      try { field.focus(); } catch (_) {}
    }
  }

  function buildBugPayload() {
    let mode = currentDisplayMode();
    try {
      const q = new URLSearchParams(location.search).get("mode");
      if (q) mode = String(q).trim().toLowerCase() || mode;
    } catch (_) {}
    return {
      bug: $("bugText") ? $("bugText").value : "",
      name: $("bugName") ? $("bugName").value : "",
      honeypot: $("bugHp") ? $("bugHp").value : "",
      openedAt: bugOpenedAt,
      context: {
        url: String(location.href || ""),
        mode: mode,
        version: appVersionString(),
        userAgent: String(navigator.userAgent || "").slice(0, 180),
        timestamp: new Date().toISOString(),
        calc: calc()
      }
    };
  }

  async function submitBugReport(e) {
    if (e) e.preventDefault();
    if (bugSubmitting) return;
    const payload = buildBugPayload();
    const checked = validateBugReport(payload);
    if (!checked.ok && checked.reason === "honeypot") {
      showBugSuccess(BUG_ISSUES_URL);
      return;
    }
    if (!checked.ok) {
      if (checked.reason === "bug-min") {
        setBugStatus("Décris le bug en au moins 10 caractères.");
      } else if (checked.reason === "too-fast") {
        setBugStatus("Un instant — réessaie dans une seconde.");
      } else {
        setBugStatus("Vérifie la description, puis réessaie.");
      }
      return;
    }
    const endpoint = bugReportEndpoint();
    if (!endpoint) {
      setBugStatus("Signalement temporairement indisponible");
      return;
    }
    bugSubmitting = true;
    if ($("btnBugSubmit")) $("btnBugSubmit").disabled = true;
    setBugStatus("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(function () { return {}; });
      if (data && data.ok) {
        showBugSuccess(data.html_url || BUG_ISSUES_URL);
        return;
      }
      throw new Error("api");
    } catch (_) {
      setBugStatus("Signalement temporairement indisponible");
    } finally {
      bugSubmitting = false;
      if ($("btnBugSubmit") && $("bugForm") && !$("bugForm").hidden) {
        $("btnBugSubmit").disabled = false;
      }
    }
  }

  let infoOpener = null;
  let activeModalId = null;

  function currentModal() {
    if (activeModalId && $(activeModalId)) return $(activeModalId);
    const ids = ["bugModal", "infoModal", "rateModal", "fieldInfoModal"];
    for (let i = 0; i < ids.length; i++) {
      const el = $(ids[i]);
      if (el && !el.hidden) return el;
    }
    return $("infoModal");
  }

  function modalFocusables() {
    const m = currentModal();
    if (!m || m.hidden) return [];
    const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(m.querySelectorAll(sel)).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function trapModalTab(e) {
    const m = currentModal();
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

  function hideModalEl(m) {
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
  }

  function openModal(id) {
    const m = $(id);
    if (!m) return;
    if (activeModalId && activeModalId !== id) hideModalEl($(activeModalId));
    infoOpener = document.activeElement;
    activeModalId = id;
    m.hidden = false;
    m.removeAttribute("aria-hidden");
    document.body.classList.add("modal-open");
    const wrap = document.querySelector(".wrap");
    if (wrap) {
      wrap.setAttribute("aria-hidden", "true");
      try { wrap.inert = true; } catch (_) { wrap.setAttribute("inert", ""); }
    }
    const closer = m.querySelector(".modal-close");
    if (id === "bugModal" && $("bugText")) {
      $("bugText").focus();
    } else if (closer) {
      closer.focus();
    }
  }
  function openInfo() {
    openModal("infoModal");
  }
  function openRateInfo() {
    openModal("rateModal");
  }
  function openFieldInfo(key) {
    const tpl = document.getElementById("tpl-info-" + key);
    const titleEl = $("fieldInfoTitle");
    const bodyEl = $("fieldInfoBody");
    if (!tpl || !titleEl || !bodyEl) return;
    const frag = tpl.content.cloneNode(true);
    const titleSrc = frag.querySelector("[data-info-title]");
    titleEl.textContent = titleSrc && titleSrc.textContent ? titleSrc.textContent : "Aide";
    if (titleSrc) titleSrc.remove();
    bodyEl.replaceChildren(frag);
    openModal("fieldInfoModal");
  }
  function closeInfo() {
    const m = currentModal();
    if (!m || m.hidden) return;
    let fallback = $("btnInfo");
    if (activeModalId === "rateModal") fallback = $("btnRateInfo");
    else if (activeModalId === "bugModal") fallback = $("bugLink");
    else if (activeModalId === "fieldInfoModal") fallback = document.querySelector(".field-info-btn");
    hideModalEl(m);
    document.body.classList.remove("modal-open");
    const wrap = document.querySelector(".wrap");
    if (wrap) {
      wrap.removeAttribute("aria-hidden");
      try { wrap.inert = false; } catch (_) { wrap.removeAttribute("inert"); }
    }
    const back = infoOpener && document.contains(infoOpener) ? infoOpener : fallback;
    if (back && typeof back.focus === "function") back.focus();
    infoOpener = null;
    activeModalId = null;
  }

  /**
   * iOS Safari often eats range drag (page scroll / pointercancel wins).
   * Dual path: ALWAYS wire touchstart/move with preventDefault (stops iOS
   * gesture recognition before pointercancel), PLUS PointerEvent capture for
   * pen / browsers where touch is absent. Mouse stays native.
   * viaTouch gates pointer handlers so we do not double-fire on iOS.
   */
  let docDragGuardWired = false;
  function onDocTouchMoveWhileDragging(e) {
    if (!document.body.classList.contains("is-range-dragging")) return;
    // Finger left the control: still kill iOS rubber-band / page scroll
    if (e.cancelable) e.preventDefault();
  }
  function clearRangeDragging() {
    document.body.classList.remove("is-range-dragging");
  }
  function setRangeDragging(on) {
    document.body.classList.toggle("is-range-dragging", !!on);
    if (!docDragGuardWired) {
      docDragGuardWired = true;
      document.addEventListener("touchmove", onDocTouchMoveWhileDragging, { passive: false, capture: true });
      window.addEventListener("pagehide", clearRangeDragging);
      // iOS bfcache restore can leave body.is-range-dragging stuck
      window.addEventListener("pageshow", clearRangeDragging);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") clearRangeDragging();
      });
      window.addEventListener("blur", clearRangeDragging);
    }
  }

  function wireRangePointerDrag(input) {
    if (!input || input.type !== "range") return;
    let activeId = null;
    let touching = false;
    let viaTouch = false;

    function valueFromClientX(clientX) {
      const rect = input.getBoundingClientRect();
      if (!rect.width) return Number(input.value);
      const min = Number(input.min);
      const max = Number(input.max);
      const stepRaw = input.step === "any" ? 0 : Number(input.step);
      const step = isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
      const lo = isFinite(min) ? min : 0;
      const hi = isFinite(max) ? max : 100;
      let ratio = (clientX - rect.left) / rect.width;
      if (getComputedStyle(input).direction === "rtl") ratio = 1 - ratio;
      ratio = Math.min(1, Math.max(0, ratio));
      let raw = lo + ratio * (hi - lo);
      const steps = Math.round((raw - lo) / step);
      raw = lo + steps * step;
      // Avoid float dust (e.g. 0.05 steps)
      const decimals = (String(step).split(".")[1] || "").length;
      if (decimals) raw = Number(raw.toFixed(decimals));
      return Math.min(hi, Math.max(lo, raw));
    }

    function applyClientX(clientX, fireChange) {
      const next = valueFromClientX(clientX);
      if (String(input.value) !== String(next)) {
        input.value = String(next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (fireChange) input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Touch first: iOS needs preventDefault on touch* to avoid pointercancel
    input.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches[0]) return;
      touching = true;
      viaTouch = true;
      activeId = null;
      setRangeDragging(true);
      applyClientX(e.touches[0].clientX, false);
      e.preventDefault();
    }, { passive: false });
    input.addEventListener("touchmove", function (e) {
      if (!touching || !e.touches || !e.touches[0]) return;
      applyClientX(e.touches[0].clientX, false);
      e.preventDefault();
    }, { passive: false });
    function endTouch(e) {
      if (!touching) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) applyClientX(t.clientX, true);
      touching = false;
      setRangeDragging(false);
      // Keep viaTouch until next pointerdown without touch
      setTimeout(function () { if (!touching) viaTouch = false; }, 0);
    }
    input.addEventListener("touchend", endTouch);
    input.addEventListener("touchcancel", endTouch);

    if (typeof window.PointerEvent === "function") {
      input.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse") return;
        if (viaTouch || touching) return; // touch path owns this gesture
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        activeId = e.pointerId;
        setRangeDragging(true);
        try { input.setPointerCapture(e.pointerId); } catch (_) {}
        applyClientX(e.clientX, false);
        e.preventDefault();
      }, { passive: false });

      input.addEventListener("pointermove", function (e) {
        if (viaTouch || touching) return;
        if (activeId === null || e.pointerId !== activeId) return;
        applyClientX(e.clientX, false);
        e.preventDefault();
      }, { passive: false });

      function endDrag(e) {
        if (viaTouch || touching) { activeId = null; return; }
        if (activeId === null || e.pointerId !== activeId) return;
        applyClientX(e.clientX, true);
        activeId = null;
        setRangeDragging(false);
        try { input.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      input.addEventListener("pointerup", endDrag);
      input.addEventListener("pointercancel", endDrag);
    }
  }

  /**
   * iOS miss-hits: finger often lands on .slider-val-left / .slider-meta, not the
   * <input>. Map those touches onto the row's range (same viaTouch dual path).
   * Skip when target is already the range (input handlers own that gesture).
   */
  function wireSliderRowDrag(row) {
    if (!row || row._rowDragWired) return;
    const input = row.querySelector('input[type="range"]');
    if (!input) return;
    row._rowDragWired = true;
    let touching = false;
    let viaTouch = false;
    let activeId = null;

    function valueFromClientX(clientX) {
      const rect = input.getBoundingClientRect();
      if (!rect.width) return Number(input.value);
      const min = Number(input.min);
      const max = Number(input.max);
      const stepRaw = input.step === "any" ? 0 : Number(input.step);
      const step = isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
      const lo = isFinite(min) ? min : 0;
      const hi = isFinite(max) ? max : 100;
      let ratio = (clientX - rect.left) / rect.width;
      if (getComputedStyle(input).direction === "rtl") ratio = 1 - ratio;
      ratio = Math.min(1, Math.max(0, ratio));
      let raw = lo + ratio * (hi - lo);
      const steps = Math.round((raw - lo) / step);
      raw = lo + steps * step;
      const decimals = (String(step).split(".")[1] || "").length;
      if (decimals) raw = Number(raw.toFixed(decimals));
      return Math.min(hi, Math.max(lo, raw));
    }

    function applyClientX(clientX, fireChange) {
      const next = valueFromClientX(clientX);
      if (String(input.value) !== String(next)) {
        input.value = String(next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (fireChange) input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function fromInput(el) {
      return el === input || (el && input.contains && input.contains(el));
    }

    row.addEventListener("touchstart", function (e) {
      if (fromInput(e.target)) return;
      if (!e.touches || !e.touches[0]) return;
      touching = true;
      viaTouch = true;
      activeId = null;
      setRangeDragging(true);
      applyClientX(e.touches[0].clientX, false);
      e.preventDefault();
    }, { passive: false });
    row.addEventListener("touchmove", function (e) {
      if (!touching || !e.touches || !e.touches[0]) return;
      applyClientX(e.touches[0].clientX, false);
      e.preventDefault();
    }, { passive: false });
    function endTouch(e) {
      if (!touching) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) applyClientX(t.clientX, true);
      touching = false;
      setRangeDragging(false);
      setTimeout(function () { if (!touching) viaTouch = false; }, 0);
    }
    row.addEventListener("touchend", endTouch);
    row.addEventListener("touchcancel", endTouch);

    if (typeof window.PointerEvent === "function") {
      row.addEventListener("pointerdown", function (e) {
        if (fromInput(e.target)) return;
        if (e.pointerType === "mouse") return;
        if (viaTouch || touching) return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        activeId = e.pointerId;
        setRangeDragging(true);
        try { row.setPointerCapture(e.pointerId); } catch (_) {}
        applyClientX(e.clientX, false);
        e.preventDefault();
      }, { passive: false });
      row.addEventListener("pointermove", function (e) {
        if (viaTouch || touching) return;
        if (activeId === null || e.pointerId !== activeId) return;
        applyClientX(e.clientX, false);
        e.preventDefault();
      }, { passive: false });
      function endDrag(e) {
        if (viaTouch || touching) { activeId = null; return; }
        if (activeId === null || e.pointerId !== activeId) return;
        applyClientX(e.clientX, true);
        activeId = null;
        setRangeDragging(false);
        try { row.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      row.addEventListener("pointerup", endDrag);
      row.addEventListener("pointercancel", endDrag);
    }
  }

  function wireUi() {
    ["tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate", "reserveDays", "battPrice"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", onScenarioEdit);
      el.addEventListener("change", onScenarioEdit);
    });
    const conso = $("conso");
    if (conso) {
      conso.addEventListener("input", function () { scenarioSnapshot = true; formatConsoInput(true); render(); });
      conso.addEventListener("change", function () { scenarioSnapshot = true; formatConsoInput(false); render(); });
      conso.addEventListener("blur", function () { scenarioSnapshot = true; formatConsoInput(false); render(); });
      conso.addEventListener("paste", function () {
        scenarioSnapshot = true;
        requestAnimationFrame(function () { formatConsoInput(true); render(); });
      });
    }
    const kwhJour = $("kwhJour");
    if (kwhJour) {
      const markKwhJour = function () {
        const raw = String(kwhJour.value).trim();
        if (raw === "") kwhJour.removeAttribute("data-manual");
        else kwhJour.setAttribute("data-manual", "1");
        onScenarioEdit();
      };
      kwhJour.addEventListener("input", markKwhJour);
      kwhJour.addEventListener("change", markKwhJour);
    }
    const showDetails = $("showDetails");
    if (showDetails) {
      showDetails.checked = prefGet("solar-details") === "1";
      showDetails.addEventListener("change", function () {
        prefSet("solar-details", showDetails.checked ? "1" : "0");
        render();
      });
    }
    const showNotes = $("showNotes");
    const editorNotes = $("editorNotes");
    if (showNotes) {
      showNotes.checked = prefGet("solar-notes") === "1";
      const applyNotes = function () {
        if (editorNotes) editorNotes.hidden = !showNotes.checked;
        showNotes.setAttribute("aria-expanded", showNotes.checked ? "true" : "false");
      };
      applyNotes();
      showNotes.addEventListener("change", function () {
        prefSet("solar-notes", showNotes.checked ? "1" : "0");
        applyNotes();
      });
    }
    ["util", "deneige", "priceW", "tilt", "reserveDays", "battPrice"].forEach((id) => {
      const el = $(id);
      if (el) wireRangePointerDrag(el);
    });
    document.querySelectorAll(".slider-row").forEach(function (row) {
      wireSliderRowDrag(row);
    });
    wireOrientDial();
    const area = $("area");
    if (area) {
      area.addEventListener("input", () => { scenarioSnapshot = true; roundAreaInput(); render(); });
      area.addEventListener("change", () => { scenarioSnapshot = true; roundAreaInput(); render(); });
      area.addEventListener("blur", () => { scenarioSnapshot = true; roundAreaInput(); render(); });
      area.addEventListener("paste", () => {
        scenarioSnapshot = true;
        // After clipboard lands in the field, coerce to integer
        requestAnimationFrame(() => { roundAreaInput(); render(); });
      });
    }
    $("unitM2").addEventListener("click", () => setUnit("m2"));
    $("unitSqft").addEventListener("click", () => setUnit("sqft"));
    $("btnPdf").addEventListener("click", printPdf);
    document.querySelectorAll(".bug-report").forEach((a) => {
      a.addEventListener("click", openBugReport);
    });
    if ($("bugForm")) $("bugForm").addEventListener("submit", submitBugReport);
    if ($("btnInfo")) $("btnInfo").addEventListener("click", openInfo);
    if ($("btnRateInfo")) $("btnRateInfo").addEventListener("click", openRateInfo);
    document.querySelectorAll(".field-info-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openFieldInfo(btn.getAttribute("data-info"));
      });
    });
    ["btnInfoClose", "btnInfoOk", "btnRateClose", "btnRateOk", "btnFieldInfoClose", "btnFieldInfoOk", "btnBugClose", "btnBugOk"].forEach(function (id) {
      if ($(id)) $(id).addEventListener("click", closeInfo);
    });
    ["infoModal", "rateModal", "fieldInfoModal", "bugModal"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", function (e) {
        if (e.target === el) closeInfo();
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeInfo();
      trapModalTab(e);
    });

    let initialSearch = "";
    try { initialSearch = location.search || ""; } catch (_) { initialSearch = ""; }
    scenarioSnapshot = searchHasScenario(initialSearch);
    applyScenario(parseScenarioSearch(initialSearch));
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

  async function fetchGridOnce(cacheMode) {
    const mode = cacheMode || "force-cache";
    const res = await fetch("assets/quebec-full-grid.json", { cache: mode });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!setGridFromPayload(data)) throw new Error("payload sans cells");
  }

  async function loadGrid() {
    gridStatus = "loading";
    lastGridUiStatus = null; // force status UI refresh
    updateGridStatusUi();
    try {
      await fetchGridOnce("force-cache");
    } catch (err1) {
      // One quiet retry with reload (bypass bad CDN cache), then fail-soft
      try {
        await new Promise((r) => setTimeout(r, 400));
        await fetchGridOnce("reload");
      } catch (err2) {
        console.warn("Grille Québec non chargée — repli S/30", err2);
        gridReady = false;
        gridStatus = "error";
      }
    }
    updateGridStatusUi();
  }

  const displayModeApi = (typeof window !== "undefined" && window.SolarDisplayMode) || null;

  window.SolarCalcV02 = {
    calc,
    applyDeneigement,
    creditKwh,
    consoAnnuelleKwh,
    parseGroupedInt,
    fmtGroupedInt,
    formatConsoInput,
    rateDollarsPerKwh,
    lookupCell,
    winterWFromTilt,
    snowCoverFromTilt,
    recommendVerticalPanels,
    sig2Round,
    fmtSig2,
    fmtMoneySig2,
    fmtShown,
    fmtShownMoney,
    batteryQuote,
    kwhJourAuto,
    validateBugReport,
    bugReportEndpoint,
    parseDisplayMode: displayModeApi && displayModeApi.parseDisplayMode,
    applyDisplayMode: displayModeApi && displayModeApi.applyDisplayMode,
    get displayMode() {
      return displayModeApi ? displayModeApi.current : "full";
    },
    AZ_LABELS,
    snapAzimuth,
    parseScenarioSearch,
    serializeScenario,
    SCENARIO_DEFAULTS,
    azimuthFromOffsets,
    orientLabelFor,
    roundAreaInput,
    constants: {
      PANEL_KW_PER_M2,
      PANEL_M2,
      PANEL_W,
      DAYS_IN_DEC,
      TAX_MULT,
      RATE_D_T2_HT,
      DEFAULT_RATE_CENTS,
      DEFAULT_RATE,
      DEFAULT_DENEIGEMENT,
      DEFAULT_CONSO_KWH,
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
    if (displayModeApi && typeof displayModeApi.applyDisplayMode === "function") {
      displayModeApi.applyDisplayMode(displayModeApi.current);
    }
    ["infoModal", "rateModal", "fieldInfoModal", "bugModal"].forEach(function (id) {
      const m0 = $(id);
      if (m0) m0.setAttribute("aria-hidden", "true");
    });
    loadBuildId();
    wireUi();
    render();
    await loadGrid();
    render();
  });

  window.addEventListener("beforeprint", () => {
    closeInfo();
  });

  // Skip-link: browsers often leave focus on <body> after hash jump — force #main
  function focusSkipTarget() {
    const main = document.getElementById("main");
    if (!main) return;
    const go = () => {
      try { main.focus({ preventScroll: false }); } catch (_) { main.focus(); }
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest("a.skip-link");
    if (!link) return;
    focusSkipTarget();
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#main") focusSkipTarget();
  });

})();
