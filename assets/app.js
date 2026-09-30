/* Calculateur Solaire version 0.2 — Solution Era — Québec full grid + W-by-tilt */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  // Used for ANY missing cell so calc never stays blank forever
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323, ac_dec: 53.274 };
  /** Default: the snow is always cleared off the panels. */
  const DEFAULT_DENEIGEMENT = 1;
  const DAYS_IN_DEC = 31;
  const DAYS_IN_YEAR = 365;
  const FLAG_FOCUS_MS = 1600;

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
  /** HQ art. 2.51 — coût moyen de fourniture, 1 avr 2026. HT = TTC (pas de TPS/TVQ). */
  const BUYBACK_RATE = 0.04730;
  /** Ballpark résidentiel Québec (~17 600 kWh/ménage HQ) — round pedagogical default */
  const DEFAULT_CONSO_KWH = 17000;
  /**
   * Daily-load ladder, kWh/day in tenths.
   * Slider max is 40 kWh/day (400 tenths): enough for a fully autonomous
   * Québec house (base loads, hot water, heat pump, backup heat) and still
   * under a typical grid home (~45 kWh/day). The first nine loads stay the
   * off-grid ladder (phone through cooking) and still sum to 6.3 kWh/day.
   * Later loads open the range toward « maison pleinement autonome ».
   * The slider itself is kWh/day (0.1 steps), not a notch index. A device
   * appears once the slider reaches that device’s cumulative total.
   */
  /** 16px stroke icons, same language as the theme marks. Shown only on a visible row. */
  function loadIcon(paths) {
    return '<svg class="load-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' + paths + '</svg>';
  }
  const ICO_STROKE = ' fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const DAILY_LOADS = [
    { label: "Téléphone", tenths: 1, icon: loadIcon('<rect x="4.5" y="1.5" width="7" height="13" rx="1.5"' + ICO_STROKE + '/><path d="M7 12.25h2"' + ICO_STROKE + '/>') },
    { label: "Ordinateur et Wi-Fi", tenths: 5, icon: loadIcon('<path d="M3.2 4h9.6v6.4H3.2zM1.8 11.6h12.4"' + ICO_STROKE + '/>') },
    { label: "Éclairage", tenths: 5, icon: loadIcon('<circle cx="8" cy="6.1" r="3.15"' + ICO_STROKE + '/><path d="M6.55 9.15h2.9M6.8 10.7h2.4M7.1 12.15h1.8M7.35 13.5h1.3"' + ICO_STROKE + '/>') },
    { label: "Télévision", tenths: 4, icon: loadIcon('<rect x="1.75" y="3" width="12.5" height="8" rx="1.25"' + ICO_STROKE + '/><path d="M6.25 13.35h3.5M8 11v2.35"' + ICO_STROKE + '/>') },
    { label: "Pompe à eau", tenths: 8, icon: loadIcon('<path d="M8 1.7c1.8 2.3 3.5 4.15 3.5 6.15a3.5 3.5 0 0 1-7 0C4.5 5.85 6.2 4 8 1.7z"' + ICO_STROKE + '/>') },
    { label: "Réfrigérateur", tenths: 12, icon: loadIcon('<rect x="3.75" y="1.5" width="8.5" height="13" rx="1.2"' + ICO_STROKE + '/><path d="M3.75 7h8.5M10.4 4.2v1.15M10.4 9.3v1.15"' + ICO_STROKE + '/>') },
    { label: "Congélateur", tenths: 8, icon: loadIcon('<path d="M8 1.8v12.4M2.7 4.7 13.3 11.3M13.3 4.7 2.7 11.3"' + ICO_STROKE + '/>') },
    { label: "Laveuse", tenths: 5, icon: loadIcon('<rect x="2.15" y="2.15" width="11.7" height="11.7" rx="1.3"' + ICO_STROKE + '/><circle cx="8" cy="8.8" r="2.45"' + ICO_STROKE + '/><path d="M4.7 4.55h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') },
    { label: "Cuisson", tenths: 15, icon: loadIcon('<path d="M4.2 6.7h7.6v4.6a1.3 1.3 0 0 1-1.3 1.3H5.5a1.3 1.3 0 0 1-1.3-1.3V6.7z"' + ICO_STROKE + '/><path d="M2.4 6.7h11.2M6.3 6.7V5a1.7 1.7 0 0 1 3.4 0v1.7"' + ICO_STROKE + '/>') },
    { label: "Lave-vaisselle", tenths: 12, icon: loadIcon('<rect x="2.2" y="3" width="11.6" height="10" rx="1.2"' + ICO_STROKE + '/><path d="M2.2 6.2h11.6"' + ICO_STROKE + '/><circle cx="6.1" cy="9.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="9.9" cy="9.5" r="0.7" fill="currentColor" stroke="none"/>') },
    { label: "Sécheuse", tenths: 25, icon: loadIcon('<rect x="2.15" y="2.15" width="11.7" height="11.7" rx="1.3"' + ICO_STROKE + '/><circle cx="8" cy="9" r="2.2"' + ICO_STROKE + '/><path d="M4.3 4.6h1.3M6.5 4.6h1.3M8.7 4.6h1.3"' + ICO_STROKE + '/>') },
    { label: "Chauffe-eau", tenths: 80, icon: loadIcon('<rect x="4.3" y="1.6" width="7.4" height="12.8" rx="2.4"' + ICO_STROKE + '/><path d="M6.3 5.1h3.4M6.3 7.3h3.4M6.3 9.5h3.4"' + ICO_STROKE + '/>') },
    { label: "Thermopompe", tenths: 120, icon: loadIcon('<rect x="1.8" y="3.1" width="12.4" height="8.2" rx="1.2"' + ICO_STROKE + '/><path d="M1.8 6h12.4M4.2 8.6h2M7 8.6h2M9.8 8.6h2M8 11.3v2.2"' + ICO_STROKE + '/>') },
    { label: "Chauffage", tenths: 100, icon: loadIcon('<path d="M3.2 13.4V6.4M5.6 13.4V3M8 13.4V3M10.4 13.4V3M12.8 13.4V6.4M3.2 13.4h9.6"' + ICO_STROKE + '/>') }
  ];
  /** Slider ceiling, kWh/day. Must match the ladder sum (400 tenths). */
  const DAILY_KWH_MAX = 40;
  const DAILY_TENTH_MAX = DAILY_KWH_MAX * 10;
  const CONSO_EXTRA_MAX = 100;
  /** Installed $/W slider. Below 2,50 $/W a yellow note says the price is surprisingly low. */
  const PRICE_W_MIN = 1;
  const PRICE_W_MAX = 4.5;
  const PRICE_W_STEP = 0.05;
  const PRICE_W_LOW = 2.5;
  /**
   * Volthium module: 16.1 kWh at a module price (default 4 800 $).
   * 33 kWh of reserve is two modules, not reserve × a $/kWh draft.
   */
  const BATT_MODULE_KWH = 16.1;
  const BATT_PRICE_MIN = 2400;
  const BATT_PRICE_MAX = 7200;
  const BATT_PRICE_STEP = 100;
  const BATT_PRICE_DEFAULT = 4800;
  /**
   * Reserve duration stops. The left label is the stop name.
   * The kWh reserve stays exact (finer than these names).
   * 24 h and « 1 jour » are the same stop. Default is 1 jour.
   */
  const RESERVE_STOPS = [
    { hours: 0, label: "aucune" },
    { hours: 5 / 60, label: "5 min" },
    { hours: 15 / 60, label: "15 min" },
    { hours: 30 / 60, label: "30 min" },
    { hours: 45 / 60, label: "45 min" },
    { hours: 1, label: "1 heure" },
    { hours: 2, label: "2 heures" },
    { hours: 4, label: "4 heures" },
    { hours: 6, label: "6 heures" },
    { hours: 8, label: "8 heures" },
    { hours: 12, label: "12 heures" },
    { hours: 24, label: "1 jour" },
    { hours: 30, label: "1 jour et quart" },
    { hours: 36, label: "1 jour et demi" },
    { hours: 48, label: "2 jours" },
    { hours: 60, label: "2 jours et demi" },
    { hours: 72, label: "3 jours" }
  ];
  const RESERVE_DEFAULT_INDEX = 11;
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

  /** Runtime grid: cells[tilt][az] = { ac_annual, W_winter, ac_dec } */
  let gridCells = null;
  let baseCells = null;
  let gridReady = false;
  let gridStatus = "loading"; // loading | ready | error
  let gridIsScaled = false;
  let activeTownId = null;
  let gridToken = 0;
  const DEFAULT_VILLE = "quebec";
  let selectedVille = DEFAULT_VILLE;
  let townCatalog = [];
  let townByIdMap = null;
  let quebecS30 = FALLBACK_S30.ac_annual;
  /** Full PVWatts grids already fetched, keyed by town id. Québec stays in baseCells. */
  const fullGridCells = Object.create(null);
  /** Full-grid fetch failed; the menu then shows the same scaled sud 45° cell as the calculator. */
  const fullGridMiss = Object.create(null);
  let townListOpen = false;
  let townActiveIndex = -1;
  let townQueryDirty = false;
  let townSuppressOpen = false;
  let townBlurTimer = null;
  /** HTML ships the Québec sud 45° figure. Keep it until a computed yield replaces it. */
  let quebecYieldPlaceholder = true;

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

  /** Affichage des résultats. Règles : docs/DESIGN.md */
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
      const decRaw = c.ac_dec != null ? c.ac_dec : (c.ac_monthly && c.ac_monthly.dec);
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

  /** kWh/j with one decimal, FR comma. Whole numbers drop the decimal (0, 1, 6,3). */
  function fmtKwhDay(n) {
    if (!isFinite(n)) return "—";
    const rounded = Math.round(n * 10) / 10;
    const whole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
    return rounded.toLocaleString("fr-CA", {
      minimumFractionDigits: whole ? 0 : 1,
      maximumFractionDigits: 1
    });
  }

  /** Free-text extra kWh/day → 0.1 steps, 0…100. Empty / invalid → 0. */
  function clampExtraKwh(raw) {
    const s = String(raw == null ? "" : raw).trim().replace(GROUP_SEP_RE, "").replace(",", ".");
    if (s === "" || s === "." || s === "+" || s === "-") return 0;
    const v = Number(s);
    if (!isFinite(v) || v <= 0) return 0;
    const snapped = Math.round(v * 10) / 10;
    return snapped > CONSO_EXTRA_MAX ? CONSO_EXTRA_MAX : snapped;
  }

  /** Ladder step 0…N plus optional extra kWh/day. Sum stays in tenths. */
  function dailyLoadKwh(step, extra) {
    const n = Math.max(0, Math.min(DAILY_LOADS.length, Math.round(Number(step) || 0)));
    let tenths = 0;
    for (let i = 0; i < n; i++) tenths += DAILY_LOADS[i].tenths;
    tenths += Math.round(clampExtraKwh(extra) * 10);
    return tenths / 10;
  }

  /** Slider position in tenths of a kWh (0 … DAILY_TENTH_MAX). */
  function sliderTenths() {
    return readRange("consoJour", 0, DAILY_TENTH_MAX, 1, 0);
  }

  /**
   * kWh/day from a slider position in tenths, plus the free line.
   * Reserve uses this total, not the sum of the revealed device rows.
   */
  function sliderDailyKwh(tenths, extra) {
    const t = Math.max(0, Math.min(DAILY_TENTH_MAX, Math.round(Number(tenths) || 0)));
    return (t + Math.round(clampExtraKwh(extra) * 10)) / 10;
  }

  /** How many devices the slider has reached (cumulative tenths ≤ position). */
  function loadsVisibleCount(tenths) {
    const cap = Math.max(0, Math.round(Number(tenths) || 0));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < DAILY_LOADS.length; i++) {
      sum += DAILY_LOADS[i].tenths;
      if (sum <= cap) n = i + 1;
      else break;
    }
    return n;
  }

  function consoExtraKwh() {
    const el = $("consoExtra");
    if (!el) return 0;
    return clampExtraKwh(el.value);
  }

  function formatConsoExtraInput() {
    const el = $("consoExtra");
    if (!el) return;
    if (String(el.value).trim() === "") return;
    const v = clampExtraKwh(el.value);
    el.value = v > 0 ? fmtKwhDay(v) : "";
  }

  function renderDailyLoadRows(tenths) {
    const body = $("consoJourList");
    const table = $("consoJourTable");
    if (!body) return;
    const n = loadsVisibleCount(tenths);
    let html = "";
    for (let i = 0; i < n; i++) {
      const load = DAILY_LOADS[i];
      html += "<tr><th scope=\"row\"><span class=\"load-name\">" + load.icon + "<span>" + load.label + "</span></span></th><td>" + fmtKwhDay(load.tenths / 10) + "</td></tr>";
    }
    body.innerHTML = html;
    if (table) table.classList.toggle("is-empty", n === 0);
  }

  /** Slider kWh; the device table sits above it. Total line adds the free kWh/day. Note vs December. */
  function updateConsoJourUi(prodDay) {
    const tenths = sliderTenths();
    const extra = consoExtraKwh();
    const base = sliderDailyKwh(tenths, 0);
    const total = sliderDailyKwh(tenths, extra);
    const val = $("consoJourVal");
    if (val) val.innerHTML = fmtKwhDay(base) + "&nbsp;kWh/j";
    const slider = $("consoJour");
    if (slider) {
      const n = loadsVisibleCount(tenths);
      const last = n > 0 ? DAILY_LOADS[n - 1].label : "";
      const spoken = fmtKwhDay(base) + (base > 1 ? " kilowattheures par jour" : " kilowattheure par jour");
      slider.setAttribute("aria-valuenow", String(base));
      slider.setAttribute("aria-valuemin", "0");
      slider.setAttribute("aria-valuemax", String(DAILY_KWH_MAX));
      slider.setAttribute(
        "aria-valuetext",
        n === 0 ? spoken : spoken + ", avec " + last
      );
    }
    renderDailyLoadRows(tenths);
    const totalEl = $("consoJourTotal");
    if (totalEl) totalEl.textContent = fmtKwhDay(total) + " kWh/j";
    const note = $("consoJourNote");
    if (!note) return;
    if (!(total > 0) || !isFinite(prodDay)) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    note.hidden = false;
    const prodTxt = fmtSig2(prodDay);
    note.textContent = prodDay + 0.001 >= total
      ? "Décembre produit " + prodTxt + " kWh/j. Cette cible est couverte."
      : "Décembre produit " + prodTxt + " kWh/j. Cette cible dépasse la production du mois.";
  }

  /** Daily consumption for the reserve (kWh/day): slider plus the free line. */
  function consoJourKwh() {
    return sliderDailyKwh(sliderTenths(), consoExtraKwh());
  }

  function reserveStopIndex() {
    const el = $("autoStop");
    const max = RESERVE_STOPS.length - 1;
    if (!el) return RESERVE_DEFAULT_INDEX;
    const n = Math.round(parseFloat(el.value));
    if (!isFinite(n)) return RESERVE_DEFAULT_INDEX;
    if (n < 0) return 0;
    if (n > max) return max;
    return n;
  }

  function reserveStop() {
    return RESERVE_STOPS[reserveStopIndex()];
  }

  function autonomyHours() {
    return reserveStop().hours;
  }

  function autonomyChoice() {
    const stop = reserveStop();
    return { days: stop.hours / 24, label: stop.label };
  }

  /** Reserve kWh: finer than the duration names. Display only. */
  function fmtReserveKwh(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return detailsOn() ? fmtNum(0, 2) : "0";
    if (detailsOn()) return fmtNum(n, 2);
    const abs = Math.abs(n);
    if (abs < 0.1) return fmtNum(n, 3);
    if (abs < 100) return fmtNum(n, 2);
    return fmtSig2(n);
  }

  /** Duration 0 (aucune) hides the rest of the autonomy column. One notch shows it all. */
  function syncAutonomyColumn(hours) {
    if (!document.documentElement) return;
    const on = hours > 0;
    document.documentElement.setAttribute("data-autonomy", on ? "on" : "off");
    const note = $("autonomyNone");
    if (!note) return;
    note.hidden = on;
  }


  /** Price of one 16.1 kWh module. The slider is not a $/kWh rate. */
  function battModulePrice() {
    const el = $("battPrice");
    if (!el) return NaN;
    const v = parseFloat(el.value);
    return isFinite(v) ? v : NaN;
  }

  /**
   * Whole modules. Round the reserve to the nearest 16.1 kWh module.
   * A reserve that exists still needs at least one module.
   */
  function battModuleCount(reserveKwh) {
    if (!isFinite(reserveKwh) || reserveKwh <= 0) return 0;
    return Math.max(1, Math.round(reserveKwh / BATT_MODULE_KWH));
  }

  /** Fill duration in days at the December daily rate. One decimal under 10 days. Display only. */
  function fmtFillDuration(days) {
    if (!isFinite(days) || days < 0) return { num: "—", unit: "" };
    if (days > 365) return { num: "> 1 an", unit: "au rythme de décembre" };
    const unit = (days < 2 ? "jour" : "jours") + " · décembre";
    if (detailsOn()) return { num: fmtNum(days, 2), unit: unit };
    if (days < 0.05) return { num: "< 0,1", unit: "jour · décembre" };
    if (days < 10) return { num: fmtNum(days, 1), unit: unit };
    return { num: fmtSig2(days), unit: unit };
  }

  function fullAutoOn() {
    const el = $("fullAuto");
    return !!(el && el.checked);
  }

  function battTaxesOn() {
    const el = $("battTaxes");
    return el ? !!el.checked : true;
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

  /** kWh_credites = min(production, consommation) when conso is provided */
  function creditKwh(kWhProd, kWhConso) {
    if (!isFinite(kWhProd) || kWhProd < 0) return 0;
    if (!isFinite(kWhConso) || kWhConso <= 0) return kWhProd;
    return Math.min(kWhProd, kWhConso);
  }

  const MAX_PANS = 4;
  const SNOW_STOPS = [0, 25, 50, 75, 100];
  const SNOW_REC_SINGLE = "Vous ne déneigez pas à 100\u00a0%. En pleine autonomie, mettez les panneaux à la verticale\u00a0: la neige n’accumule pas, et décembre ne tombe pas à zéro.";
  const SNOW_REC_MULTI = "Un versant n’est pas déneigé à 100\u00a0%. En pleine autonomie, mettez ses panneaux à la verticale\u00a0: la neige n’accumule pas, et décembre ne tombe pas à zéro.";
  /** m² par versant. null tant que le mode n’est pas ouvert. */
  let pans = null;
  let pansFromUrl = false;
  let multiWasOn = false;
  const multiHomes = {};

  function multiOn() {
    const el = $("multi");
    return !!(el && el.checked);
  }

  function snowStop(n) {
    const x = Number(n);
    if (!isFinite(x)) return 100;
    return Math.min(100, Math.max(0, Math.round(x / 25) * 25));
  }

  function snapTilt(n) {
    const v = snapStep(n, 0, 90, 15);
    return isFinite(v) ? v : 45;
  }

  /** Un versant, mêmes formules que le versant unique. */
  function calcOnePan(p, util) {
    const m2 = Math.max(0, Number(p.m2) || 0);
    const usedM2 = m2 * util;
    const kW = usedM2 * PANEL_KW_PER_M2;
    const nPv = usedM2 > 0 ? Math.round(usedM2 / PANEL_M2) : 0;
    const tilt = snapTilt(p.tilt);
    const az = snapAzimuth(p.az);
    const deneige = snowStop(p.snow) / 100;
    const cell = lookupCell(String(tilt), String(az));
    const table = cell.ac_annual;
    const W = winterWFromTilt(tilt);
    const snowCover = snowCoverFromTilt(tilt);
    const kWhPerKwc = applyDeneigement(table, deneige, W);
    const kWhAnnuel = table * kW;
    const kWh = applyDeneigement(kWhAnnuel, deneige, W);
    const decCell = isFinite(cell.ac_dec) ? cell.ac_dec : FALLBACK_S30.ac_dec;
    const kWhDecMonth = decCell * kW;
    const kWhDec = applyDeneigement(kWhDecMonth, deneige, snowCover);
    return {
      m2, kW, nPv, table, kWhAnnuel, kWh, kWhPerKwc, kWhDecMonth, kWhDec, W, snowCover,
      source: cell.source,
      showVerticalRec: recommendVerticalPanels(deneige, tilt)
    };
  }

  function panFromSingle() {
    return {
      m2: areaM2(),
      az: snapAzimuth($("orient") ? $("orient").value : 180),
      tilt: snapTilt($("tilt") ? $("tilt").value : 45),
      snow: snowStop(deneigeFrac() * 100)
    };
  }

  function secondPan(first) {
    return { m2: 20, az: first.az === 90 ? 270 : 90, tilt: first.tilt, snow: first.snow };
  }

  function ensurePans() {
    if (pans && pans.length) return;
    const first = panFromSingle();
    pans = [first, secondPan(first)];
  }

  function shownArea(m2) {
    const v = areaUnit === "sqft" ? m2 * SQFT_PER_M2 : m2;
    return String(Math.max(0, Math.round(v)));
  }

  function m2FromShown(raw) {
    const n = parseFloat(String(raw == null ? "" : raw).trim().replace(",", "."));
    const shown = isFinite(n) && n > 0 ? n : 0;
    return areaUnit === "sqft" ? shown / SQFT_PER_M2 : shown;
  }

  function writePanToSingle(p) {
    if ($("area")) $("area").value = shownArea(p.m2);
    if ($("orient")) $("orient").value = String(snapAzimuth(p.az));
    if ($("tilt")) $("tilt").value = String(snapTilt(p.tilt));
    if ($("deneige")) $("deneige").value = String(snowStop(p.snow));
  }

  function parsePansParam(raw) {
    if (raw == null || String(raw).trim() === "") return [];
    return String(raw).split(";").map(function (chunk) {
      const parts = chunk.split(":").map(Number);
      if (parts.length < 4 || !parts.every(isFinite)) return null;
      return {
        m2: Math.max(0, parts[0]),
        az: snapAzimuth(parts[1]),
        tilt: snapTilt(parts[2]),
        snow: snowStop(parts[3])
      };
    }).filter(Boolean).slice(0, MAX_PANS);
  }

  function formatPansParam(list) {
    return (list || []).map(function (p) {
      return [Math.round(p.m2), snapAzimuth(p.az), snapTilt(p.tilt), snowStop(p.snow)].join(":");
    }).join(";");
  }

  function rememberHome(key, node) {
    if (!node || multiHomes[key] || !node.parentNode) return;
    multiHomes[key] = { parent: node.parentNode, next: node.nextSibling };
  }

  function parkNode(node, slot) {
    if (!node || !slot || typeof slot.appendChild !== "function") return;
    if (node.parentNode === slot) return;
    slot.appendChild(node);
  }

  function restoreHome(key, node) {
    const home = multiHomes[key];
    if (!node || !home || typeof home.parent.insertBefore !== "function") return;
    if (node.parentNode === home.parent && node.nextSibling === home.next) return;
    home.parent.insertBefore(node, home.next);
  }

  function setHeading(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function syncMultiLayout() {
    // Un lien avec un seul versant : c’est le versant unique, pas le tableau.
    if (multiOn() && pans && pans.length === 1 && pansFromUrl) {
      writePanToSingle(pans[0]);
      pansFromUrl = false;
      if ($("multi")) $("multi").checked = false;
    }
    const on = multiOn();
    if (document.documentElement) document.documentElement.setAttribute("data-multi", on ? "on" : "off");
    const loc = $("field-loc");
    const util = $("field-util");
    const results = $("sizeResults");
    rememberHome("loc", loc);
    rememberHome("util", util);
    rememberHome("results", results);
    if (on && !multiWasOn) {
      if (!pans || !pans.length) {
        const first = panFromSingle();
        pans = [first, secondPan(first)];
      } else if (!pansFromUrl) {
        pans[0] = panFromSingle();
      }
      pansFromUrl = false;
    }
    if (!on && multiWasOn && pans && pans[0]) writePanToSingle(pans[0]);
    if (on) {
      parkNode(loc, $("slotLoc"));
      parkNode(util, $("slotUtil"));
      parkNode(results, $("slotResults"));
      setHeading("h-prod-title", "Où est ma toiture ?");
      setHeading("h-prod-b-title", "Mes versants : combien de panneaux, combien d’énergie ?");
    } else {
      restoreHome("results", results);
      restoreHome("util", util);
      restoreHome("loc", loc);
      setHeading("h-prod-title", "Combien de panneaux puis-je installer sur ma toiture\u00a0?");
      setHeading("h-prod-b-title", "Combien d'énergie électrique vais-je produire\u00a0?");
    }
    const snowRec = $("autonomySnowRec");
    if (snowRec) snowRec.textContent = on ? SNOW_REC_MULTI : SNOW_REC_SINGLE;
    multiWasOn = on;
  }

  function fillSelect(sel, options, value) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + o.value + '"' + (String(o.value) === String(value) ? " selected" : "") + ">" + o.label + "</option>";
    }).join("");
  }

  function buildPanRows() {
    const body = $("pansBody");
    if (!body || typeof document.createElement !== "function" || !pans) return;
    body.innerHTML = "";
    pans.forEach(function (p, i) {
      const row = document.createElement("tr");
      row.className = "pans-row";
      row.innerHTML =
        '<td class="pans-td-area"><div class="pans-area"><input type="number" class="pan-area" min="0" step="1" inputmode="numeric" autocomplete="off" aria-label="Superficie du versant ' + (i + 1) + '" /><span class="pans-area-unit" data-unit>' + (areaUnit === "sqft" ? "pi²" : "m²") + "</span></div></td>" +
        '<td class="pans-td-az"><select class="pan-az" aria-label="Orientation du versant ' + (i + 1) + '"></select></td>' +
        '<td class="pans-td-tilt"><select class="pan-tilt" aria-label="Inclinaison du versant ' + (i + 1) + '"></select></td>' +
        '<td class="pans-td-snow"><select class="pan-snow" aria-label="Déneigement du versant ' + (i + 1) + '"></select></td>' +
        '<td class="pans-td-x"><button type="button" class="pans-remove" aria-label="Retirer le versant ' + (i + 1) + '">×</button></td>';
      const area = row.querySelector(".pan-area");
      area.value = shownArea(p.m2);
      fillSelect(row.querySelector(".pan-az"), Object.keys(AZ_LABELS).map(function (k) { return { value: k, label: AZ_LABELS[k] }; }), snapAzimuth(p.az));
      fillSelect(row.querySelector(".pan-tilt"), [0, 15, 30, 45, 60, 75, 90].map(function (t) { return { value: t, label: t + "°" }; }), snapTilt(p.tilt));
      fillSelect(row.querySelector(".pan-snow"), SNOW_STOPS.map(function (n) { return { value: n, label: n + " %" }; }), snowStop(p.snow));
      const rm = row.querySelector(".pans-remove");
      rm.disabled = pans.length <= 1;
      area.addEventListener("input", function () {
        p.m2 = m2FromShown(area.value);
        onScenarioEdit();
      });
      row.querySelector(".pan-az").addEventListener("change", function (e) { p.az = snapAzimuth(e.target.value); onScenarioEdit(); });
      row.querySelector(".pan-tilt").addEventListener("change", function (e) { p.tilt = snapTilt(e.target.value); onScenarioEdit(); });
      row.querySelector(".pan-snow").addEventListener("change", function (e) { p.snow = snowStop(e.target.value); onScenarioEdit(); });
      rm.addEventListener("click", function () {
        if (pans.length <= 1) return;
        pans.splice(i, 1);
        if (pans.length === 1) {
          // Un seul versant qui reste : on redevient le versant unique, avec ses valeurs.
          if ($("multi")) $("multi").checked = false;
          syncMultiLayout();
          buildPanRows();
          onScenarioEdit();
          return;
        }
        buildPanRows();
        onScenarioEdit();
      });
      const sub = document.createElement("tr");
      sub.className = "pans-sub";
      sub.innerHTML = '<td colspan="5"><div class="pans-sub-line"><span class="pans-sub-name">Versant ' + (i + 1) + '</span><span class="pans-out"><strong data-pv>—</strong> panneaux</span><span class="pans-out"><strong data-kw>—</strong> kWc</span><span class="pans-out"><strong data-eff>—</strong> efficacité</span></div></td>';
      body.appendChild(row);
      body.appendChild(sub);
    });
    const add = $("pansAdd");
    if (add) {
      add.disabled = pans.length >= MAX_PANS;
      add.textContent = pans.length >= MAX_PANS ? "Maximum " + MAX_PANS + " versants" : "+ Ajouter un versant";
    }
  }

  function paintPanStats(rows) {
    if (!rows || typeof document.querySelectorAll !== "function") return;
    const subs = document.querySelectorAll("#pansBody .pans-sub");
    if (subs.length !== rows.length) {
      buildPanRows();
    }
    const fresh = document.querySelectorAll("#pansBody .pans-sub");
    rows.forEach(function (row, i) {
      const sub = fresh[i];
      if (!sub || typeof sub.querySelector !== "function") return;
      const pv = sub.querySelector("[data-pv]");
      const kw = sub.querySelector("[data-kw]");
      const eff = sub.querySelector("[data-eff]");
      if (pv) pv.textContent = row.nPv > 0 ? String(row.nPv) : "—";
      if (kw) kw.textContent = row.kW > 0 ? fmtShown(row.kW, 1) : "—";
      if (eff) eff.textContent = isFinite(row.kWhPerKwc) ? fmtGroupedInt(Math.round(row.kWhPerKwc)).replace(/ /g, "\u00A0") : "—";
    });
    const totPv = $("totPv");
    const totKw = $("totKw");
    const totEff = $("totEff");
    const kW = rows.reduce(function (s, r) { return s + r.kW; }, 0);
    const nPv = rows.reduce(function (s, r) { return s + r.nPv; }, 0);
    const kWh = rows.reduce(function (s, r) { return s + r.kWh; }, 0);
    if (totPv) totPv.textContent = nPv > 0 ? String(nPv) : "—";
    if (totKw) totKw.textContent = kW > 0 ? fmtShown(kW, 1) : "—";
    if (totEff) totEff.textContent = kW > 0 ? fmtGroupedInt(Math.round(kWh / kW)).replace(/ /g, "\u00A0") : "—";
  }

  function paintPanAreas() {
    if (!pans || typeof document.querySelectorAll !== "function") return;
    const inputs = document.querySelectorAll(".pan-area");
    inputs.forEach(function (input, i) {
      if (!pans[i] || document.activeElement === input) return;
      input.value = shownArea(pans[i].m2);
      const unit = input.parentNode && input.parentNode.querySelector ? input.parentNode.querySelector("[data-unit]") : null;
      if (unit) unit.textContent = areaUnit === "sqft" ? "pi²" : "m²";
    });
  }

  function calc() {
    const util = utilFrac();
    const priceW = parseFloat($("priceW").value);
    const taxesOn = $("taxes").checked;
    const subvOn = $("subv").checked;
    const rateOk = rateDollarsPerKwh($("rate").value);

    let m2;
    let deneige;
    let tilt;
    let az;
    let table;
    let W;
    let kW;
    let nPv;
    let kWhAnnuel;
    let kWh;
    let kWhPerKwc;
    let kWhDecMonth;
    let kWhDec;
    let snowCover;
    let showVerticalRec;
    let panRows = null;
    let cellSource = "fallback";
    let usedM2;
    let acDec = NaN;

    if (multiOn()) {
      ensurePans();
      panRows = pans.map(function (p) { return calcOnePan(p, util); });
      m2 = panRows.reduce(function (s, r) { return s + r.m2; }, 0);
      kW = panRows.reduce(function (s, r) { return s + r.kW; }, 0);
      nPv = panRows.reduce(function (s, r) { return s + r.nPv; }, 0);
      if (!(kW > 0)) nPv = NaN;
      kWhAnnuel = panRows.reduce(function (s, r) { return s + r.kWhAnnuel; }, 0);
      kWh = panRows.reduce(function (s, r) { return s + r.kWh; }, 0);
      kWhDecMonth = panRows.reduce(function (s, r) { return s + r.kWhDecMonth; }, 0);
      kWhDec = panRows.reduce(function (s, r) { return s + r.kWhDec; }, 0);
      kWhPerKwc = kW > 0 ? kWh / kW : NaN;
      table = kW > 0 ? kWhAnnuel / kW : panRows[0].table;
      showVerticalRec = panRows.some(function (r) { return r.showVerticalRec; });
      tilt = String(snapTilt(pans[0].tilt));
      az = String(snapAzimuth(pans[0].az));
      deneige = snowStop(pans[0].snow) / 100;
      W = winterWFromTilt(tilt);
      snowCover = snowCoverFromTilt(tilt);
      cellSource = panRows[0].source;
      usedM2 = m2 * util;
    } else {
      m2 = areaM2();
      deneige = deneigeFrac();
      tilt = String($("tilt").value);
      az = String($("orient").value);
      const cell = lookupCell(tilt, az);
      table = cell.ac_annual;
      // v0.2: W from tilt model (not per-cell orientation W)
      W = winterWFromTilt(tilt);
      usedM2 = m2 * util;
      kW = usedM2 * PANEL_KW_PER_M2;
      nPv = usedM2 > 0 ? Math.round(usedM2 / PANEL_M2) : NaN;
      kWhAnnuel = table * kW;
      kWh = applyDeneigement(kWhAnnuel, deneige, W);
      kWhPerKwc = applyDeneigement(table, deneige, W);
      kWhDecMonth = (isFinite(cell.ac_dec) ? cell.ac_dec : FALLBACK_S30.ac_dec) * kW;
      // Autonomie (décembre) : 100 % du mois est à risque neige, pas le W annuel 18 %.
      snowCover = snowCoverFromTilt(tilt);
      kWhDec = applyDeneigement(kWhDecMonth, deneige, snowCover);
      showVerticalRec = recommendVerticalPanels(deneige, tilt);
      cellSource = cell.source;
      acDec = isFinite(cell.ac_dec) ? cell.ac_dec : FALLBACK_S30.ac_dec;
    }

    const HT = kW * 1000 * priceW;
    const TTC = HT * TAX_MULT;
    const taxes = TTC - HT;
    const subv = subvOn ? Math.min(1000 * kW, 0.4 * HT) : 0;
    const base = taxesOn ? TTC : HT;
    const reel = Math.max(0, base - subv);
    const consoJour = consoJourKwh();
    const fullAuto = fullAutoOn();
    const consoFromAuto = consoJour * DAYS_IN_YEAR;
    const conso = fullAuto ? (consoFromAuto > 0 ? consoFromAuto : null) : consoAnnuelleKwh();
    const consoShort = !fullAuto && conso != null && consoFromAuto > conso;
    const consoMin = Math.ceil(consoFromAuto);
    const kWhCredites = creditKwh(kWh, conso);
    const ecoClamped = conso != null && kWh > conso;
    const surplusKwh = ecoClamped ? kWh - conso : 0;
    const surplusBuyback = surplusKwh * BUYBACK_RATE;
    const surplusIfAvoided = surplusKwh * rateOk;
    const surplusGap = Math.max(0, surplusIfAvoided - surplusBuyback);
    const eco = kWhCredites * rateOk;
    const years = eco > 0 ? reel / eco : Infinity;

    const kWhDay = isFinite(kWhDec) ? kWhDec / DAYS_IN_DEC : NaN;
    const sunHoursDec = kW > 0 && isFinite(kWhDay) ? kWhDay / kW : NaN;
    const auto = autonomyChoice();
    const reserveKwh = consoJour == null ? NaN : consoJour * auto.days;
    const surplusDay = consoJour == null || !isFinite(kWhDay) ? NaN : kWhDay - consoJour;
    let fillState = "unknown";
    let fillDays = NaN;
    if (consoJour != null && isFinite(kWhDay)) {
      if (!(reserveKwh > 0)) fillState = "none";
      else if (!(surplusDay > 0)) fillState = "impossible";
      else {
        fillState = "ok";
        fillDays = reserveKwh / surplusDay;
      }
    }
    const shortfall = consoJour != null && consoJour > 0 && isFinite(kWhDay) && kWhDay < consoJour;
    const battPrice = battModulePrice();
    const battModules = battModuleCount(reserveKwh);
    const battTaxOn = battTaxesOn();
    const battHT = isFinite(reserveKwh) && isFinite(battPrice) ? battModules * battPrice : NaN;
    const battTaxes = battTaxOn ? battHT * (TAX_MULT - 1) : 0;
    const battCost = isFinite(battHT) ? battHT + (battTaxOn ? battHT * (TAX_MULT - 1) : 0) : NaN;
    const projectTotal = isFinite(battCost) ? reel + battCost : NaN;
    return {
      m2, util, deneige, tilt, az, priceW, taxesOn, subvOn, rateOk,
      usedM2, acDec, panRows,
      kW, nPv, table, kWhPerKwc, kWhAnnuel, kWh, kWhDecMonth, kWhDec, kWhDay, sunHoursDec, W, snowCover, showVerticalRec,
      conso, fullAuto, consoFromAuto, consoShort, consoMin,
      kWhCredites, ecoClamped, surplusKwh, surplusBuyback, surplusIfAvoided, surplusGap,
      HT, TTC, taxes, subv, reel, eco, years,
      consoJour, autonomyDays: auto.days, autonomyLabel: auto.label, reserveKwh,
      surplusDay, fillState, fillDays, shortfall,
      battPrice, battModules, battTaxOn, battHT, battTaxes, battCost, projectTotal,
      gridReady, gridStatus, cellSource: gridIsScaled ? "scaled" : cellSource
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
          loadGrid().then(function () {
            refreshTownYields();
            return Promise.all([ensureTownGrid(selectedVille), loadMenuFullGrids()]);
          }).then(function () { render(); });
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
    const priceSurprise = $("priceSurprise");
    if (priceSurprise) priceSurprise.hidden = !(isFinite(r.priceW) && r.priceW < PRICE_W_LOW);
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
    if ($("outKwhKwc")) {
      const kwcNum = $("outKwhKwc").querySelector(".prod-num");
      if (kwcNum) {
        kwcNum.textContent = isFinite(r.kWhPerKwc)
          ? fmtGroupedInt(Math.round(r.kWhPerKwc)).replace(/ /g, "\u00A0")
          : "—";
      }
    }
    if ($("outPv")) {
      const pvNum = $("outPv").querySelector(".prod-num");
      if (pvNum) pvNum.textContent = isFinite(r.nPv) ? fmtNum(r.nPv, 0) : "—";
    }
    if ($("outKw")) {
      const kwNum = $("outKw").querySelector(".prod-num");
      if (kwNum) kwNum.textContent = fmtShown(r.kW * 1000, 0);
    }
    const snowBox = $("autonomySnow");
    if (snowBox) {
      snowBox.hidden = !r.showVerticalRec;
      snowBox.classList.toggle("is-zero", r.showVerticalRec && r.kWhDec <= 0);
    }
    if (r.panRows) paintPanStats(r.panRows);
    updateConsoJourUi(r.kWhDay);
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
    renderConsoLock(r);
    $("kpiReel").textContent = fmtShownMoney(r.reel);
    $("kpiEco").textContent = fmtShownMoney(r.eco);
    const alert = $("surplusAlert");
    if (alert) {
      alert.hidden = !r.ecoClamped;
      if (r.ecoClamped) {
        if ($("surplusKwh")) $("surplusKwh").textContent = fmtShown(r.surplusKwh, 0) + " kWh / an";
        if ($("surplusBuyback")) $("surplusBuyback").textContent = fmtShownMoney(r.surplusBuyback);
        if ($("surplusAvoidedRate")) $("surplusAvoidedRate").textContent = fmtNum(r.rateOk * 100, 2) + " ¢/kWh";
        if ($("surplusGap")) $("surplusGap").textContent = fmtShownMoney(r.surplusGap);
      }
    }
    const yearsLabel = fmtYears(r.years);
    $("kpiYears").textContent = yearsLabel;
    if ($("kpiYearsPin") && $("kpiYearsPin").textContent !== yearsLabel) {
      $("kpiYearsPin").textContent = yearsLabel;
      yearsFloat.reset();
    }
    const yearText = !isFinite(r.years) || r.years <= 0
      ? "—"
      : (detailsOn() ? fmtNum(r.years, 1) : fmtSig2(r.years)) + " ans";
    $("outPayback").textContent = "Coût réel ÷ économies/an ≈ " + yearText;

    const jourWh = $("outConsoWh");
    if (jourWh) jourWh.textContent = fmtShown(r.consoJour * 1000, 0) + " Wh";
    if ($("autoStopVal")) $("autoStopVal").textContent = r.autonomyLabel;
    const autoInput = $("autoStop");
    if (autoInput) {
      autoInput.setAttribute("aria-valuenow", autoInput.value);
      autoInput.setAttribute("aria-valuetext", r.autonomyLabel);
    }
    const reserveNum = $("outReserve") && $("outReserve").querySelector(".prod-num");
    const reserveUnit = $("outReserve") && $("outReserve").querySelector(".prod-unit");
    if (reserveNum) {
      if (r.consoJour === 0) {
        reserveNum.textContent = "Aucune réserve";
        reserveNum.classList.add("is-sentence");
        if (reserveUnit) {
          reserveUnit.textContent = "à remplir";
          reserveUnit.hidden = false;
        }
      } else {
        reserveNum.textContent = fmtReserveKwh(r.reserveKwh);
        reserveNum.classList.remove("is-sentence");
        if (reserveUnit) {
          reserveUnit.textContent = "kWh";
          reserveUnit.hidden = false;
        }
      }
    }
    syncAutonomyColumn(autonomyHours());
    if ($("battPriceVal") && isFinite(r.battPrice)) {
      $("battPriceVal").textContent = fmtNum(r.battPrice, 0) + " $";
    }
    if ($("outBatt")) {
      if (!(r.battModules > 0) || !isFinite(r.battHT)) {
        $("outBatt").textContent = "Aucun module";
      } else {
        const word = r.battModules > 1 ? "modules" : "module";
        $("outBatt").textContent =
          fmtNum(r.battModules, 0) + " " + word + " × " + fmtNum(r.battPrice, 0) + " $ = " + fmtShownMoney(r.battHT);
      }
    }
    if ($("lineBattHT")) $("lineBattHT").textContent = fmtShownMoney(r.battHT);
    if ($("lineBattTaxes")) $("lineBattTaxes").textContent = r.battTaxOn ? fmtShownMoney(r.battTaxes) : "—";
    if ($("lineBattSubv")) $("lineBattSubv").textContent = fmtShownMoney(0);
    if ($("lineBatt")) $("lineBatt").textContent = fmtShownMoney(r.battCost);
    if ($("lineProjectSolar")) $("lineProjectSolar").textContent = fmtShownMoney(r.reel);
    if ($("lineProjectBatt")) $("lineProjectBatt").textContent = fmtShownMoney(r.battCost);
    if ($("outProject")) $("outProject").textContent = fmtShownMoney(r.projectTotal);

    const fillNum = $("outFillNum");
    const fillUnit = $("outFillUnit");
    if (fillNum && fillUnit) {
      let fillText = { num: "—", unit: "" };
      if (r.fillState === "none") fillText = { num: "Aucune réserve", unit: "à remplir" };
      else if (r.fillState === "impossible") fillText = { num: "Ne se remplit pas", unit: "" };
      else if (r.fillState === "ok") fillText = fmtFillDuration(r.fillDays);
      fillNum.textContent = fillText.num;
      fillNum.classList.toggle("is-sentence", r.fillState === "none" || r.fillState === "impossible");
      fillUnit.textContent = fillText.unit;
      fillUnit.hidden = !fillText.unit;
    }
    const fillSun = $("outFillSun");
    if (fillSun) {
      fillSun.textContent = isFinite(r.sunHoursDec)
        ? "Décembre : " + fmtShown(r.sunHoursDec, 2) + " h de plein soleil / j"
        : "—";
    }
    const flag = $("permaFlag");
    if (flag) flag.hidden = !r.shortfall;
    syncFlagDock();
    syncScenarioUrl();
  }

  /** 4A « 100 % autonome » freezes the annual consumption at 365 × kWh/j. */
  function renderConsoLock(r) {
    const consoEl = $("conso");
    if (consoEl) {
      consoEl.disabled = r.fullAuto;
      if (r.fullAuto) consoEl.value = fmtGroupedInt(Math.round(r.consoFromAuto));
    }
    if ($("consoHint")) $("consoHint").hidden = r.fullAuto;
    if ($("consoLockedNote")) $("consoLockedNote").hidden = !r.fullAuto;
    const flag = $("consoFlag");
    if (!flag) return;
    flag.hidden = !r.consoShort;
    if (!r.consoShort) return;
    if ($("consoFlagDay")) $("consoFlagDay").textContent = fmtKwhDay(r.consoJour) + " kWh/j";
    if ($("consoFlagYear")) $("consoFlagYear").textContent = fmtGroupedInt(Math.round(r.consoFromAuto)) + " kWh / an";
    if ($("consoFlagMin")) $("consoFlagMin").textContent = fmtGroupedInt(r.consoMin) + " kWh / an";
  }

  /* Yellow flags: every visible [data-flag] shows in the fixed dock above « Retour ». */
  let flagDockKey = "";
  let flagDockOpen = false;

  function visibleFlags() {
    return Array.prototype.filter.call(document.querySelectorAll("[data-flag]"), function (el) {
      return !el.hidden && el.getClientRects().length > 0;
    });
  }

  function markFlags() {
    document.querySelectorAll("[data-flag]").forEach(function (el) {
      if (el.querySelector(".flag-mark")) return;
      const mark = document.createElement("span");
      mark.className = "flag-mark";
      mark.setAttribute("aria-hidden", "true");
      el.insertBefore(mark, el.firstChild);
    });
  }

  function setFlagMenu(open) {
    const menu = $("flagDockMenu");
    const btn = $("flagDockBtn");
    flagDockOpen = !!open;
    if (menu) menu.hidden = !flagDockOpen;
    if (btn) btn.setAttribute("aria-expanded", flagDockOpen ? "true" : "false");
  }

  function goToFlag(el) {
    setFlagMenu(false);
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (_) {}
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("is-flag-focus");
    void el.offsetWidth;
    el.classList.add("is-flag-focus");
    clearTimeout(el._flagFocusTimer);
    el._flagFocusTimer = setTimeout(function () { el.classList.remove("is-flag-focus"); }, FLAG_FOCUS_MS);
  }

  function syncFlagDock() {
    const dock = $("flagDock");
    if (!dock) return;
    const flags = visibleFlags();
    dock.hidden = flags.length === 0;
    if (document.body) document.body.classList.toggle("has-flags", flags.length > 0);
    if (!flags.length) {
      flagDockKey = "";
      setFlagMenu(false);
      return;
    }
    const names = flags.map(function (el) { return el.getAttribute("data-flag"); });
    const key = names.join("|");
    if (key === flagDockKey) return;
    flagDockKey = key;
    const label = $("flagDockLabel");
    if (label) label.textContent = flags.length === 1 ? names[0] : String(flags.length);
    const btn = $("flagDockBtn");
    if (btn) {
      btn.setAttribute("aria-label", flags.length === 1
        ? "Point à vérifier : " + names[0]
        : flags.length + " points à vérifier");
    }
    const menu = $("flagDockMenu");
    if (!menu) return;
    menu.innerHTML = "";
    flags.forEach(function (el, i) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "flag-dock-item";
      item.setAttribute("role", "menuitem");
      const mark = document.createElement("span");
      mark.className = "flag-mark";
      mark.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = names[i];
      item.appendChild(mark);
      item.appendChild(text);
      item.addEventListener("click", function () { goToFlag(el); });
      menu.appendChild(item);
    });
  }

  function wireFlagDock() {
    markFlags();
    const dock = $("flagDock");
    const btn = $("flagDockBtn");
    if (!dock || !btn) return;
    const canHover = typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;
    btn.addEventListener("click", function () {
      setFlagMenu(canHover ? true : !flagDockOpen);
    });
    if (canHover) {
      dock.addEventListener("mouseenter", function () { setFlagMenu(true); });
      dock.addEventListener("mouseleave", function () { setFlagMenu(false); });
    }
    document.addEventListener("click", function (e) {
      if (flagDockOpen && !dock.contains(e.target)) setFlagMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && flagDockOpen) setFlagMenu(false);
    });
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
    if (typeof document.querySelectorAll === "function") {
      document.querySelectorAll("[data-unit-btn]").forEach(function (btn) {
        const on = btn.getAttribute("data-unit-btn") === areaUnit;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    paintPanAreas();
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
    ville: "quebec",
    area: 40,
    unit: "m2",
    util: 80,
    orient: 180,
    tilt: 45,
    deneige: Math.round(DEFAULT_DENEIGEMENT * 100),
    priceW: 3,
    taxes: true,
    subv: true,
    conso: DEFAULT_CONSO_KWH,
    rate: DEFAULT_RATE_CENTS,
    consoJour: 0,
    consoExtra: 0,
    autoStop: RESERVE_DEFAULT_INDEX,
    battPrice: BATT_PRICE_DEFAULT,
    battTaxes: true,
    fullAuto: false,
    multi: false
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
      const v = snapStep(q.get("priceW"), PRICE_W_MIN, PRICE_W_MAX, PRICE_W_STEP);
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
    let consoJour = d.consoJour;
    if (q.has("consoJour")) {
      /* kWh/day, 0.1 steps, not the old notch index. */
      const v = snapStep(q.get("consoJour"), 0, DAILY_KWH_MAX, 0.1);
      if (isFinite(v)) consoJour = v;
    }
    let consoExtra = d.consoExtra;
    if (q.has("consoExtra")) consoExtra = clampExtraKwh(q.get("consoExtra"));
    let autoStop = d.autoStop;
    if (q.has("autoStop")) {
      const v = snapStep(q.get("autoStop"), 0, RESERVE_STOPS.length - 1, 1);
      if (isFinite(v)) autoStop = v;
    }
    let battPrice = d.battPrice;
    if (q.has("battPrice")) {
      const v = snapStep(q.get("battPrice"), BATT_PRICE_MIN, BATT_PRICE_MAX, BATT_PRICE_STEP);
      if (isFinite(v)) battPrice = v;
    }
    const battTaxes = parseFlagParam(q.has("battTaxes") ? q.get("battTaxes") : null, d.battTaxes);
    const fullAuto = parseFlagParam(q.has("fullAuto") ? q.get("fullAuto") : null, d.fullAuto);
    const multi = parseFlagParam(q.has("multi") ? q.get("multi") : null, d.multi);
    const pansParsed = q.has("pans") ? parsePansParam(q.get("pans")) : [];
    let ville = d.ville;
    if (q.has("ville")) {
      const raw = String(q.get("ville") || "").trim().toLowerCase();
      if (/^[a-z0-9-]{1,80}$/.test(raw)) ville = raw;
    }
    return { area, unit, util, orient, tilt, deneige, priceW, taxes, subv, conso, rate, ville, consoJour, consoExtra, autoStop, battPrice, battTaxes, fullAuto, multi, pans: pansParsed };
  }

  const SCENARIO_KEYS = ["ville", "area", "unit", "util", "orient", "tilt", "deneige", "priceW", "taxes", "subv", "conso", "rate", "consoJour", "consoExtra", "autoStop", "battPrice", "battTaxes", "fullAuto", "multi", "pans"];

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
      p.set("ville", s.ville || d.ville);
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
      p.set("consoJour", trimNum(s.consoJour, 1));
      p.set("consoExtra", trimNum(s.consoExtra, 1));
      p.set("autoStop", String(s.autoStop));
      p.set("battPrice", String(s.battPrice));
      p.set("battTaxes", s.battTaxes ? "1" : "0");
      p.set("fullAuto", s.fullAuto ? "1" : "0");
      if (s.multi) {
        p.set("multi", "1");
        if (s.pans && s.pans.length) p.set("pans", formatPansParam(s.pans));
      }
      return p.toString();
    }
    if (mode === "webi") p.set("mode", "webi");
    if (s.ville && s.ville !== d.ville) p.set("ville", s.ville);
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
    if (Math.abs(s.consoJour - d.consoJour) > 0.001) p.set("consoJour", trimNum(s.consoJour, 1));
    if (Math.abs(s.consoExtra - d.consoExtra) > 0.001) p.set("consoExtra", trimNum(s.consoExtra, 1));
    if (s.autoStop !== d.autoStop) p.set("autoStop", String(s.autoStop));
    if (s.battPrice !== d.battPrice) p.set("battPrice", String(s.battPrice));
    if (!s.battTaxes) p.set("battTaxes", "0");
    if (s.fullAuto) p.set("fullAuto", "1");
    if (s.multi) {
      p.set("multi", "1");
      if (s.pans && s.pans.length) p.set("pans", formatPansParam(s.pans));
    }
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
    if ($("consoJour")) $("consoJour").value = String(Math.round(s.consoJour * 10));
    if ($("consoExtra")) $("consoExtra").value = s.consoExtra > 0 ? fmtKwhDay(s.consoExtra) : "";
    if ($("autoStop")) $("autoStop").value = String(s.autoStop);
    if ($("battPrice")) $("battPrice").value = String(s.battPrice);
    if ($("battTaxes")) $("battTaxes").checked = !!s.battTaxes;
    if ($("fullAuto")) $("fullAuto").checked = !!s.fullAuto;
    if (s.pans && s.pans.length) {
      pans = s.pans.map(function (p) { return { m2: p.m2, az: p.az, tilt: p.tilt, snow: p.snow }; });
      pansFromUrl = true;
    } else if (s.multi) {
      pans = null;
    }
    if ($("multi")) $("multi").checked = !!s.multi;
    syncMultiLayout();
    selectedVille = canonicalVille(s.ville || SCENARIO_DEFAULTS.ville);
    if ($("ville")) $("ville").value = selectedVille;
    paintTownButton();
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
      priceW: readRange("priceW", PRICE_W_MIN, PRICE_W_MAX, PRICE_W_STEP, d.priceW),
      taxes: $("taxes") ? !!$("taxes").checked : d.taxes,
      subv: $("subv") ? !!$("subv").checked : d.subv,
      conso: isFinite(conso) ? conso : 0,
      rate: isFinite(rateSnapped) ? rateSnapped : d.rate,
      consoJour: snapStep(sliderTenths() / 10, 0, DAILY_KWH_MAX, 0.1),
      consoExtra: consoExtraKwh(),
      autoStop: reserveStopIndex(),
      battPrice: readRange("battPrice", BATT_PRICE_MIN, BATT_PRICE_MAX, BATT_PRICE_STEP, d.battPrice),
      battTaxes: $("battTaxes") ? !!$("battTaxes").checked : d.battTaxes,
      fullAuto: $("fullAuto") ? !!$("fullAuto").checked : d.fullAuto,
      multi: multiOn(),
      pans: multiOn() && pans ? pans.map(function (p) { return { m2: p.m2, az: p.az, tilt: p.tilt, snow: p.snow }; }) : [],
      ville: canonicalVille(selectedVille)
    };
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

  const PRINT_WEB_COLUMNS = [
    ["sec-prod", "sec-prod-b", "sec-yield"],
    ["sec-auto", "sec-reserve", "sec-fill"]
  ];
  const PRINT_FINANCE_CARDS = ["sec-cost", "sec-batt", "sec-value", "sec-total"];

  function printNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function syncPrintControls(source, clone) {
    const sourceControls = source.querySelectorAll("input, select, textarea");
    const cloneControls = clone.querySelectorAll("input, select, textarea");
    sourceControls.forEach(function (control, index) {
      const copy = cloneControls[index];
      if (!copy) return;
      copy.value = control.value;
      if ("checked" in control) copy.checked = control.checked;
      if (copy.tagName === "SELECT") {
        Array.from(copy.options).forEach(function (option, optionIndex) {
          option.selected = optionIndex === control.selectedIndex;
        });
      }
    });
  }

  function namespacePrintIds(root, sourceId) {
    const idMap = new Map();
    const nodes = [root].concat(Array.from(root.querySelectorAll("[id]")));
    nodes.forEach(function (node, index) {
      if (!node.id) return;
      const next = "print-" + sourceId + "-" + index + "-" + node.id;
      idMap.set(node.id, next);
      node.id = next;
    });
    ["for", "aria-labelledby", "aria-describedby", "aria-controls"].forEach(function (attr) {
      [root].concat(Array.from(root.querySelectorAll("[" + attr + "]"))).forEach(function (node) {
        const value = node.getAttribute(attr);
        if (!value) return;
        node.setAttribute(attr, value.split(/\s+/).map(function (id) {
          return idMap.get(id) || id;
        }).join(" "));
      });
    });
  }

  function clonePrintCard(sourceId) {
    const source = $(sourceId);
    if (!source) return null;
    const clone = source.cloneNode(true);
    syncPrintControls(source, clone);
    namespacePrintIds(clone, sourceId);
    clone.classList.remove("mode-full-only", "mode-webi-only");
    clone.querySelectorAll(".mode-full-only, .mode-webi-only").forEach(function (node) {
      node.classList.remove("mode-full-only", "mode-webi-only");
    });
    clone.classList.add("print-card");
    clone.setAttribute("data-print-source", sourceId);
    clone.removeAttribute("tabindex");
    return clone;
  }

  function scenarioPrintUrl() {
    syncScenarioUrl();
    const canonical = document.querySelector('link[rel="canonical"]');
    const publicBase = canonical && canonical.href ? canonical.href : window.location.href;
    const url = new URL(publicBase, window.location.href);
    url.search = window.location.search;
    url.hash = "";
    return url.href;
  }

  function appendPrintBrand(parent, subtitle) {
    const header = printNode("header", "print-report-brand");
    const logo = document.querySelector(".brand-logo");
    if (logo) {
      const logoCopy = logo.cloneNode(true);
      logoCopy.removeAttribute("class");
      header.appendChild(logoCopy);
    }
    const words = printNode("div", "print-report-brand-words");
    words.appendChild(printNode("strong", "", "Solution ERA | DÉFI Autonomie Énergétique"));
    words.appendChild(printNode("span", "", subtitle));
    header.appendChild(words);
    parent.appendChild(header);
  }

  function appendPrintSharePage(report, url) {
    const page = printNode("section", "print-sheet print-share-page");
    appendPrintBrand(page, "Calculateur solaire");
    page.appendChild(printNode("h1", "", "Rouvrir ce calcul exact"));
    const town = $("villeBtn");
    page.appendChild(printNode("p", "print-share-context", "Scénario calculé pour " + (town && town.value ? town.value : "la localisation choisie") + "."));

    const share = printNode("section", "print-share");
    share.appendChild(printNode("h2", "", "Lien cliquable vers votre scénario"));
    const link = printNode("a", "print-scenario-link", url);
    link.href = url;
    share.appendChild(link);
    const qr = document.createElement("img");
    qr.className = "print-qr";
    qr.alt = "Code QR pour rouvrir ce calcul";
    qr.width = 190;
    qr.height = 190;
    if (typeof qrcode === "function") {
      const code = qrcode(0, "M");
      code.addData(url, "Byte");
      code.make();
      qr.src = code.createDataURL(5, 4);
    }
    share.appendChild(qr);
    share.appendChild(printNode("p", "print-qr-caption", "Scannez avec l’appareil photo d’un cellulaire."));
    page.appendChild(share);
    page.appendChild(printNode("p", "print-page-warning", "Les pages suivantes contiennent les hypothèses, les formules et les sources du calcul."));
    report.appendChild(page);
  }

  function appendPrintWebPage(report) {
    const page = printNode("section", "print-sheet print-card-page print-card-page-web");
    appendPrintBrand(page, "Calculateur solaire");
    page.appendChild(printNode("h1", "", "Estimation de votre projet"));
    const grid = printNode("div", "print-card-grid print-web-columns");
    PRINT_WEB_COLUMNS.forEach(function (cardIds, index) {
      const column = printNode("div", "print-web-column print-web-column-" + (index + 1));
      cardIds.forEach(function (id) {
        const card = clonePrintCard(id);
        if (card) column.appendChild(card);
      });
      grid.appendChild(column);
    });
    page.appendChild(grid);
    report.appendChild(page);
  }

  function appendPrintCardPage(report, cardIds, title, pageClass) {
    const page = printNode("section", "print-sheet print-card-page " + pageClass);
    appendPrintBrand(page, "Détails du scénario");
    page.appendChild(printNode("h1", "", title));
    const grid = printNode("div", "print-card-grid");
    cardIds.forEach(function (id) {
      const card = clonePrintCard(id);
      if (card) grid.appendChild(card);
    });
    page.appendChild(grid);
    report.appendChild(page);
  }

  function appendPrintDetailSection(parent, title, content) {
    const section = printNode("section", "print-detail-section");
    section.appendChild(printNode("h2", "", title));
    section.appendChild(content);
    parent.appendChild(section);
  }

  function appendPrintAppendix(report) {
    const appendix = printNode("section", "print-appendix");
    appendPrintBrand(appendix, "Détails de calcul");
    appendix.appendChild(printNode("h1", "", "Hypothèses, formules et sources"));
    appendix.appendChild(printNode("p", "print-appendix-intro", "Les sections suivantes regroupent les explications disponibles dans les boutons d’information du calculateur."));

    const general = $("infoDesc");
    if (general) appendPrintDetailSection(appendix, "Méthode de calcul", general.cloneNode(true));
    const rate = $("rateDesc");
    if (rate) appendPrintDetailSection(appendix, "Tarif Hydro-Québec", rate.cloneNode(true));

    const seen = new Set();
    document.querySelectorAll("[data-info]").forEach(function (button) {
      const key = button.getAttribute("data-info");
      if (!key || seen.has(key)) return;
      seen.add(key);
      const template = $("tpl-info-" + key);
      if (!template) return;
      const fragment = template.content.cloneNode(true);
      const titleNode = fragment.querySelector("[data-info-title]");
      const title = titleNode ? titleNode.textContent.trim() : "Information";
      if (titleNode) titleNode.remove();
      const body = printNode("div", "print-detail-body");
      body.appendChild(fragment);
      appendPrintDetailSection(appendix, title, body);
    });

    const disclaimers = document.querySelector(".disclaimers");
    if (disclaimers) {
      const assumptions = disclaimers.cloneNode(true);
      assumptions.querySelectorAll("button").forEach(function (button) { button.remove(); });
      appendPrintDetailSection(appendix, "À retenir", assumptions);
    }
    report.appendChild(appendix);
  }

  function buildPrintReport() {
    const report = $("printReport");
    if (!report) return null;
    report.replaceChildren();
    const url = scenarioPrintUrl();
    appendPrintWebPage(report);
    appendPrintCardPage(report, PRINT_FINANCE_CARDS, "Coûts et valeur", "print-card-page-finance");
    appendPrintSharePage(report, url);
    appendPrintAppendix(report);
    report.dataset.scenarioUrl = url;
    return report;
  }

  function waitForPrintImages(report) {
    if (!report) return Promise.resolve();
    const pending = Array.from(report.querySelectorAll("img")).filter(function (img) {
      return !img.complete;
    });
    if (!pending.length) return Promise.resolve();
    return Promise.race([
      Promise.all(pending.map(function (img) {
        return new Promise(function (resolve) {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      })),
      new Promise(function (resolve) { window.setTimeout(resolve, 4000); })
    ]);
  }

  async function printPdf() {
    closeInfo();
    const report = buildPrintReport();
    await waitForPrintImages(report);
    window.print();
  }

  const BUG_MIN_LEN = 10;
  const BUG_MIN_FORM_MS = 2000;
  /* Keep in sync with the #bugModal.bug-dock breakpoint in assets/styles.css. */
  const BUG_DOCK_QUERY = "(min-width: 900px)";

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
  let bugDoneTimer = null;

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
    bugSubmitting = false;
    const btn = $("btnBugSubmit");
    if (btn) btn.disabled = true;
    if (bugUnlockTimer) clearTimeout(bugUnlockTimer);
    bugOpenedAt = Date.now();
    bugUnlockTimer = setTimeout(function () {
      if ($("btnBugSubmit") && !bugSubmitting) $("btnBugSubmit").disabled = false;
    }, BUG_MIN_FORM_MS);
  }

  function hideBugDone() {
    const el = $("bugDone");
    if (el) el.hidden = true;
    if (bugDoneTimer) {
      clearTimeout(bugDoneTimer);
      bugDoneTimer = null;
    }
  }

  function showBugDone() {
    closeInfo();
    const el = $("bugDone");
    if (!el) return;
    el.hidden = false;
    if (bugDoneTimer) clearTimeout(bugDoneTimer);
    bugDoneTimer = setTimeout(hideBugDone, 1000);
  }

  function bugShortcutTarget(e) {
    const m = $("bugModal");
    if (!m || m.hidden || activeModalId !== "bugModal") return false;
    if ($("bugForm") && $("bugForm").hidden) return false;
    const target = e && e.target;
    return !!(target && m.contains(target));
  }

  function bugDockViewport() {
    try {
      return !!(window.matchMedia && window.matchMedia(BUG_DOCK_QUERY).matches);
    } catch (_) {
      return false;
    }
  }

  function setBugFabBlocked(blocked) {
    const fab = $("bugFab");
    if (!fab) return;
    if (blocked) {
      try { fab.inert = true; } catch (_) { fab.setAttribute("inert", ""); }
    } else {
      try { fab.inert = false; } catch (_) { fab.removeAttribute("inert"); }
    }
  }

  function holdPageForModal() {
    document.body.classList.add("modal-open");
    const wrap = document.querySelector(".wrap");
    if (wrap) {
      wrap.setAttribute("aria-hidden", "true");
      try { wrap.inert = true; } catch (_) { wrap.setAttribute("inert", ""); }
    }
    setBugFabBlocked(true);
  }

  function releasePageForModal() {
    document.body.classList.remove("modal-open");
    const wrap = document.querySelector(".wrap");
    if (wrap) {
      wrap.removeAttribute("aria-hidden");
      try { wrap.inert = false; } catch (_) { wrap.removeAttribute("inert"); }
    }
    setBugFabBlocked(false);
  }

  function syncBugChrome(open) {
    const m = $("bugModal");
    const fab = $("bugFab");
    const dock = !!(open && bugDockViewport());
    if (m) {
      m.classList.toggle("bug-dock", dock);
      if (open) m.setAttribute("aria-modal", dock ? "false" : "true");
    }
    if (fab) fab.setAttribute("aria-expanded", open ? "true" : "false");
    return dock;
  }

  function focusBugField() {
    const field = $("bugText");
    if (!field || typeof field.focus !== "function") return;
    const place = function () {
      try {
        field.focus();
        const len = typeof field.value === "string" ? field.value.length : 0;
        if (typeof field.setSelectionRange === "function") field.setSelectionRange(len, len);
      } catch (_) {}
    };
    place();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { requestAnimationFrame(place); });
    }
    if (typeof setTimeout === "function") setTimeout(place, 30);
  }

  function openBugReport(e) {
    if (e) e.preventDefault();
    hideBugDone();
    const m = $("bugModal");
    const already = !!(m && !m.hidden && activeModalId === "bugModal");
    if (!already) resetBugForm();
    openModal("bugModal");
    focusBugField();
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
      showBugDone();
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
        showBugDone();
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
    if (activeModalId === "bugModal" && bugDockViewport()) return;
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
    const bugOpen = id === "bugModal";
    const dock = bugOpen && syncBugChrome(true);
    if (!bugOpen) {
      const bug = $("bugModal");
      if (bug) bug.classList.remove("bug-dock");
      const fab = $("bugFab");
      if (fab) fab.setAttribute("aria-expanded", "false");
    }
    if (dock) releasePageForModal();
    else holdPageForModal();
    const closer = m.querySelector(".modal-close");
    if (id === "bugModal" && $("bugText")) {
      focusBugField();
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
  /*
   * « Comment c’est calculé » (issue #140). Every result box carries a ⓘ that opens
   * the same sheet: a table of the numbers behind the box, each one tagged as the
   * person’s own input, a standard assumption of the calculator, or an intermediate
   * step; then the formula, the exact result and the rounded figure the box shows.
   */
  const RESULT_KIND_LABEL = { input: "Ta donnée", std: "Hypothèse standard", calc: "Calculé" };
  const NOTE_PANEL = "Panneau générique de 2\u00A0m² (≈ 1\u00A0m × 2\u00A0m) et 400\u00A0W. Aucune marque\u00A0: le calcul ne dépend pas du fabricant.";
  const NOTE_DENSITY = "Densité de puissance\u00A0: 0,20\u00A0kWc par m² de surface utile (200\u00A0W/m²), soit 400\u00A0W pour 2\u00A0m².";
  const NOTE_PVWATTS = "Production\u00A0: PVWatts v8 (NSRDB), 1\u00A0kWc, pertes système de 14\u00A0% déjà comprises (onduleur, câblage, salissure, disponibilité). La transformation courant continu → courant alternatif est dans ces pertes.";
  const NOTE_ROUNDING = "Le calcul garde toute la précision. La boîte montre l’arrondi à deux chiffres significatifs (loi des deux chiffres).";

  function pct(n, d) {
    return fmtNum(n * 100, d == null ? 0 : d) + "\u00A0%";
  }
  function kwhVal(n, d) {
    return fmtNum(n, d == null ? 0 : d) + "\u00A0kWh";
  }
  function row(label, value, kind, note) {
    return { label: label, value: value, kind: kind, note: note || "" };
  }
  function areaRow(r) {
    const raw = parseFloat($("area") ? $("area").value : "");
    const shown = areaUnit === "sqft"
      ? fmtNum(raw, 0) + "\u00A0pi² (" + fmtNum(r.m2, 1) + "\u00A0m²)"
      : fmtNum(r.m2, 0) + "\u00A0m²";
    return row("Superficie de l’installation", shown, "input");
  }
  function usedAreaRows(r) {
    if (r.panRows) {
      return [
        row("Versants", r.panRows.length + (r.panRows.length > 1 ? " versants" : " versant"), "input", "superficie, orientation, inclinaison et déneigement de chacun"),
        row("Superficie totale", fmtNum(r.m2, 1) + "\u00A0m²", "input"),
        row("Densité d’installation", pct(r.util), "input", "une seule valeur pour toute la toiture"),
        row("Surface utile", fmtNum(r.usedM2, 2) + "\u00A0m²", "calc", "somme des versants × densité")
      ];
    }
    return [
      areaRow(r),
      row("Densité d’installation", pct(r.util), "input"),
      row("Surface utile", fmtNum(r.usedM2, 2) + "\u00A0m²", "calc", "superficie × densité")
    ];
  }
  function locationRows(r) {
    if (r.panRows) {
      return [
        row("Localisation", selectedTownLabel(), "input"),
        row("Versants", String(r.panRows.length), "input", "chacun a son orientation, son inclinaison et son déneigement"),
        row("Productible moyen pour 1\u00A0kWc", fmtNum(r.table, 1) + "\u00A0kWh/kWc/an", "calc", "production brute ÷ kWc, avant la neige")
      ];
    }
    const src = r.cellSource === "scaled"
      ? "grille de Québec mise à l’échelle de cette ville"
      : (r.cellSource === "fallback" ? "cellule de secours (grille non chargée)" : "cellule PVWatts de la ville");
    return [
      row("Localisation", selectedTownLabel(), "input"),
      row("Orientation", orientLabelFor(r.az), "input"),
      row("Inclinaison", Math.round(Number(r.tilt)) + "°", "input"),
      row("Productible pour 1\u00A0kWc", fmtNum(r.table, 1) + "\u00A0kWh/kWc/an", "std", src)
    ];
  }
  function snowRows(r, share, shareLabel) {
    return [
      row("Fréquence de déneigement (d)", pct(r.deneige), "input"),
      row(shareLabel, pct(share, 0), "std", "selon l’inclinaison\u00A0: 18\u00A0% jusqu’à 45°, 0\u00A0% à 90°, linéaire entre les deux"),
      row("Facteur neige", fmtNum(1 - (1 - r.deneige) * share, 3), "calc", "1 − (1 − d) × part à risque")
    ];
  }
  function costRows(r) {
    const rows = [
      row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc = " + fmtNum(r.kW * 1000, 0) + "\u00A0W", "calc", "boîte Puissance de 1A"),
      row("Prix au watt installé", fmtNum(r.priceW, 2) + "\u00A0$/W", "input"),
      row("Sous-total (HT)", fmtMoney(r.HT), "calc", "W × $/W"),
      row("Taxes TPS + TVQ", r.taxesOn ? fmtMoney(r.taxes) : "non comprises", r.taxesOn ? "std" : "input", r.taxesOn ? "14,975\u00A0% du HT (case cochée)" : "case décochée"),
      row("Subvention LogisVert", r.subvOn ? "− " + fmtMoney(r.subv) : "non appliquée", r.subvOn ? "std" : "input", r.subvOn ? "min(1\u00A0000\u00A0$/kW, 40\u00A0% du HT)" : "case décochée")
    ];
    return rows;
  }
  function battRows(r) {
    return [
      row("Réserve", kwhVal(r.reserveKwh, 3), "calc", "boîte Réserve de 4B"),
      row("Module", "16,1\u00A0kWh", "std", "module Volthium"),
      row("Nombre de modules", fmtNum(r.battModules, 0), "calc", "arrondi de la réserve ÷ 16,1, au moins 1"),
      row("Prix d’un module", fmtMoney(r.battPrice), "input"),
      row("Sous-total (HT)", fmtMoney(r.battHT), "calc", "modules × prix"),
      row("Taxes TPS + TVQ", r.battTaxOn ? fmtMoney(r.battTaxes) : "non comprises", r.battTaxOn ? "std" : "input", r.battTaxOn ? "14,975\u00A0% du HT (case cochée)" : "case décochée"),
      row("Subvention", "0\u00A0$", "std", "LogisVert ne couvre pas les batteries")
    ];
  }
  function consoRow(r) {
    if (r.fullAuto) return row("Consommation annuelle", kwhVal(r.consoFromAuto, 0) + " / an", "calc", "365\u00A0j × " + fmtKwhDay(r.consoJour) + "\u00A0kWh/j (case « 100\u00A0% autonome »)");
    if (r.conso == null) return row("Consommation annuelle", "aucune", "input", "sans plafond");
    return row("Consommation annuelle", kwhVal(r.conso, 0) + " / an", "input", r.conso === DEFAULT_CONSO_KWH ? "défaut du calculateur" : "");
  }
  function rateRow(r) {
    const isDefault = Math.abs(r.rateOk - DEFAULT_RATE) < 1e-9;
    return row("Tarif marginal HQ (TTC)", fmtNum(r.rateOk * 100, 3) + "\u00A0¢/kWh", "input", isDefault ? "défaut\u00A0: 2e tranche Tarif D, taxes comprises" : "");
  }

  const RESULT_INFO = {
    pv: function (r) {
      return {
        title: "Panneaux solaires installés",
        rows: usedAreaRows(r).concat([row("Surface d’un panneau", "2\u00A0m²", "std", "panneau générique de 400\u00A0W")]),
        formula: "panneaux = arrondi(surface utile ÷ 2\u00A0m²)",
        exact: isFinite(r.nPv) ? fmtNum(r.usedM2 / PANEL_M2, 2) + " panneaux" : "—",
        shown: isFinite(r.nPv) ? fmtNum(r.nPv, 0) + " panneaux" : "—",
        shownNote: "arrondi au panneau entier",
        notes: [NOTE_PANEL, NOTE_DENSITY]
      };
    },
    kw: function (r) {
      return {
        title: "Puissance",
        rows: usedAreaRows(r).concat([row("Densité de puissance", "0,20\u00A0kWc/m²", "std", "200\u00A0W par m² de surface utile")]),
        formula: "kWc = surface utile × 0,20",
        exact: fmtNum(r.kW, 3) + "\u00A0kWc",
        shown: fmtShown(r.kW, 2) + "\u00A0kWc",
        notes: [NOTE_DENSITY, NOTE_PANEL, NOTE_ROUNDING]
      };
    },
    kwhkwc: function (r) {
      if (r.panRows) {
        return {
          title: "Efficacité de l’installation",
          rows: locationRows(r).concat([
            row("Production annuelle", kwhVal(r.kWh, 1) + " / an", "calc", "somme des versants, après la neige"),
            row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc")
          ]),
          formula: "kWh/kWc/an = production annuelle ÷ kWc",
          exact: fmtNum(r.kWhPerKwc, 2) + "\u00A0kWh/kWc/an",
          shown: fmtGroupedInt(Math.round(r.kWhPerKwc)) + "\u00A0kWh/kWc/an",
          shownNote: "arrondi à l’entier, comme le menu des villes",
          notes: [NOTE_PVWATTS, "Chaque versant a son orientation, son inclinaison et son déneigement. L’efficacité est pondérée par les kWc."]
        };
      }
      return {
        title: "Efficacité de l’installation",
        rows: locationRows(r).concat(snowRows(r, r.W, "Part de l’année à risque neige (W)")),
        formula: "kWh/kWc/an = productible × (1 − (1 − d) × W)",
        exact: fmtNum(r.kWhPerKwc, 2) + "\u00A0kWh/kWc/an",
        shown: fmtGroupedInt(Math.round(r.kWhPerKwc)) + "\u00A0kWh/kWc/an",
        shownNote: "arrondi à l’entier, comme le menu des villes",
        notes: [NOTE_PVWATTS, "W est une part simplifiée de la production de décembre à février, pas une mesure de ton toit."]
      };
    },
    kwh: function (r) {
      if (r.panRows) {
        return {
          title: "Mesurage Net",
          rows: locationRows(r).concat([
            row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc", "somme des versants"),
            row("Production annuelle", kwhVal(r.kWh, 1) + " / an", "calc", "chaque versant : kWc × productible × facteur neige")
          ]),
          formula: "kWh/an = somme des versants",
          exact: kwhVal(r.kWh, 1) + " / an",
          shown: fmtShown(r.kWh, 0) + "\u00A0kWh / an",
          notes: [NOTE_PVWATTS, "Mesurage net\u00A0: les kWh produits sont crédités sur la facture Hydro-Québec. Le crédit ne dépasse pas la consommation annuelle (voir Économies).", NOTE_ROUNDING]
        };
      }
      return {
        title: "Mesurage Net",
        rows: [row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc", "boîte Puissance de 1A")]
          .concat(locationRows(r))
          .concat([row("Production brute", kwhVal(r.kWhAnnuel, 1) + " / an", "calc", "kWc × productible")])
          .concat(snowRows(r, r.W, "Part de l’année à risque neige (W)")),
        formula: "kWh/an = kWc × productible × (1 − (1 − d) × W)",
        exact: kwhVal(r.kWh, 1) + " / an",
        shown: fmtShown(r.kWh, 0) + "\u00A0kWh / an",
        notes: [NOTE_PVWATTS, "Mesurage net\u00A0: les kWh produits sont crédités sur la facture Hydro-Québec. Le crédit ne dépasse pas la consommation annuelle (voir Économies).", NOTE_ROUNDING]
      };
    },
    kwhday: function (r) {
      if (r.panRows) {
        return {
          title: "Autonomie — un jour de décembre",
          rows: locationRows(r).concat([
            row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc", "somme des versants"),
            row("Décembre, après la neige", kwhVal(r.kWhDec, 2), "calc", "somme des versants"),
            row("Jours en décembre", "31", "std")
          ]),
          formula: "kWh/j = décembre (somme des versants) ÷ 31",
          exact: fmtNum(r.kWhDay, 3) + "\u00A0kWh/j",
          shown: fmtShown(r.kWhDay, 2) + "\u00A0kWh/j",
          notes: ["Chaque versant applique sa propre part de décembre à risque neige, selon son inclinaison et son déneigement.", NOTE_PVWATTS, NOTE_ROUNDING]
        };
      }
      return {
        title: "Autonomie — un jour de décembre",
        rows: [row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc", "boîte Puissance de 1A")]
          .concat(locationRows(r).slice(0, 3))
          .concat([
            row("Décembre pour 1\u00A0kWc", fmtNum(r.acDec, 2) + "\u00A0kWh/kWc", "std", "PVWatts, même cellule que l’annuel"),
            row("Décembre brut", kwhVal(r.kWhDecMonth, 2), "calc", "kWc × décembre pour 1\u00A0kWc")
          ])
          .concat(snowRows(r, r.snowCover, "Part de décembre à risque neige (C)"))
          .concat([row("Jours en décembre", "31", "std")]),
        formula: "kWh/j = kWc × décembre (1\u00A0kWc) × (1 − (1 − d) × C) ÷ 31",
        exact: fmtNum(r.kWhDay, 3) + "\u00A0kWh/j",
        shown: fmtShown(r.kWhDay, 2) + "\u00A0kWh/j",
        notes: ["Sans déneigement, tout décembre est à risque si les panneaux ne sont pas verticaux\u00A0: C = 100\u00A0% jusqu’à 45°, 0\u00A0% à 90°.", NOTE_PVWATTS, NOTE_ROUNDING]
      };
    },
    reel: function (r) {
      return {
        title: "Coût réel des panneaux",
        rows: costRows(r),
        formula: r.taxesOn ? "coût réel = HT + taxes − subvention" : "coût réel = HT − subvention",
        exact: fmtMoney(r.reel),
        shown: fmtShownMoney(r.reel),
        notes: ["Le prix au watt couvre panneaux, onduleur, structure et pose. Estimation pédagogique, pas une soumission.", NOTE_ROUNDING]
      };
    },
    eco: function (r) {
      return {
        title: "Économies par an",
        rows: [
          row("Production (Mesurage Net)", kwhVal(r.kWh, 0) + " / an", "calc"),
          consoRow(r),
          row("kWh crédités", kwhVal(r.kWhCredites, 0) + " / an", "calc", r.ecoClamped ? "plafonné à la consommation" : "min(production, consommation)"),
          rateRow(r)
        ],
        formula: "économies = kWh crédités × tarif",
        exact: fmtMoney(r.eco) + " / an",
        shown: fmtShownMoney(r.eco) + " / an",
        notes: ["Le surplus au-delà de la consommation n’est pas compté ici\u00A0: HQ le rachète à 4,730\u00A0¢/kWh (drapeau jaune).", NOTE_ROUNDING]
      };
    },
    years: function (r) {
      return {
        title: "Retour — années pour rentrer",
        rows: [
          row("Coût réel des panneaux", fmtMoney(r.reel), "calc", "boîte Coût réel"),
          row("Économies par an", fmtMoney(r.eco) + " / an", "calc", "boîte Économies / an")
        ],
        formula: "années = coût réel ÷ économies par an",
        exact: isFinite(r.years) && r.years > 0 ? fmtNum(r.years, 2) + " ans" : "—",
        shown: fmtYears(r.years),
        notes: ["Hypothèses\u00A0: tarif constant, aucune dégradation des panneaux, aucun entretien ni financement. Le retour ne compte que les panneaux, pas les batteries.", NOTE_ROUNDING]
      };
    },
    reserve: function (r) {
      return {
        title: "Réserve",
        rows: [
          row("Consommation du jour", fmtKwhDay(r.consoJour) + "\u00A0kWh/j", "input", "curseur 4A + ligne libre"),
          row("Durée d’autonomie", r.autonomyLabel + " (" + fmtNum(r.autonomyDays * 24, 2) + "\u00A0h)", "input"),
          row("Durée en jours", fmtNum(r.autonomyDays, 4), "calc", "heures ÷ 24")
        ],
        formula: "réserve = kWh/j × durée (jours)",
        exact: kwhVal(r.reserveKwh, 3),
        shown: r.consoJour === 0 ? "Aucune réserve" : fmtReserveKwh(r.reserveKwh) + "\u00A0kWh",
        shownNote: "sous 100\u00A0kWh, au centième",
        notes: ["La réserve est l’énergie utile à stocker. Le rendement des batteries et la profondeur de décharge ne sont pas comptés."]
      };
    },
    fill: function (r) {
      let exact = "—";
      if (r.fillState === "ok") exact = fmtNum(r.fillDays, 3) + " jours";
      else if (r.fillState === "none") exact = "aucune réserve à remplir";
      else if (r.fillState === "impossible") exact = "surplus nul ou négatif\u00A0: ne se remplit pas";
      const shownText = r.fillState === "ok"
        ? (function () { const f = fmtFillDuration(r.fillDays); return f.num + " " + f.unit; })()
        : (r.fillState === "none" ? "Aucune réserve" : (r.fillState === "impossible" ? "Ne se remplit pas" : "—"));
      return {
        title: "Temps pour remplir la réserve",
        rows: [
          row("Réserve", kwhVal(r.reserveKwh, 3), "calc", "boîte Réserve de 4B"),
          row("Production d’un jour de décembre", fmtNum(r.kWhDay, 3) + "\u00A0kWh/j", "calc", "boîte Autonomie"),
          row("Consommation du jour", fmtKwhDay(r.consoJour) + "\u00A0kWh/j", "input", "curseur 4A + ligne libre"),
          row("Surplus de décembre", fmtNum(r.surplusDay, 3) + "\u00A0kWh/j", "calc", "production − consommation"),
          row("Puissance", fmtNum(r.kW, 3) + "\u00A0kWc", "calc", "boîte Puissance de 1A"),
          row("Plein soleil en décembre", isFinite(r.sunHoursDec) ? fmtNum(r.sunHoursDec, 2) + "\u00A0h/j" : "—", "calc", "production du jour ÷ kWc")
        ],
        formula: "jours = réserve ÷ surplus de décembre",
        exact: exact,
        shown: shownText,
        shownNote: "toujours en jours, une décimale sous 10 jours",
        notes: [],
        tpl: "remplissage"
      };
    },
    battcost: function (r) {
      return {
        title: "Coût des batteries",
        rows: battRows(r),
        formula: r.battTaxOn ? "batteries = modules × prix + taxes" : "batteries = modules × prix",
        exact: fmtMoney(r.battCost),
        shown: fmtShownMoney(r.battCost),
        notes: ["Le prix d’un module est une fourchette pédagogique (2\u00A0400 à 7\u00A0200\u00A0$). Estimation, pas une soumission.", NOTE_ROUNDING]
      };
    },
    project: function (r) {
      return {
        title: "Coût total du projet",
        rows: [
          row("Panneaux solaires (coût réel)", fmtMoney(r.reel), "calc", "carte 2\u00A0: HT + taxes − subvention"),
          row("Batteries", fmtMoney(r.battCost), "calc", "carte 5\u00A0: modules × prix + taxes")
        ],
        formula: "total = panneaux + batteries",
        exact: fmtMoney(r.projectTotal),
        shown: fmtShownMoney(r.projectTotal),
        notes: ["Le retour sur investissement ne compte que les panneaux.", NOTE_ROUNDING]
      };
    }
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildResultInfo(spec) {
    const frag = document.createDocumentFragment();
    const legend = el("p", "calc-legend");
    ["input", "std", "calc"].forEach(function (kind) {
      const chip = el("span", "calc-kind calc-kind-" + kind, RESULT_KIND_LABEL[kind]);
      legend.appendChild(chip);
    });
    frag.appendChild(legend);

    const table = el("table", "calc-table");
    const thead = el("thead");
    const hr = el("tr");
    hr.appendChild(el("th", null, "Donnée"));
    hr.appendChild(el("th", null, "Valeur"));
    hr.appendChild(el("th", null, "Origine"));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el("tbody");
    spec.rows.forEach(function (it) {
      const tr = el("tr", "calc-row-" + it.kind);
      const th = el("th");
      th.setAttribute("scope", "row");
      th.appendChild(document.createTextNode(it.label));
      if (it.note) th.appendChild(el("span", "calc-note", it.note));
      tr.appendChild(th);
      tr.appendChild(el("td", "amt", it.value));
      const kindTd = el("td");
      kindTd.appendChild(el("span", "calc-kind calc-kind-" + it.kind, RESULT_KIND_LABEL[it.kind]));
      tr.appendChild(kindTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const tfoot = el("tfoot");
    const fr = el("tr", "calc-row-formula");
    const fth = el("th");
    fth.setAttribute("scope", "row");
    fth.textContent = "Formule";
    fr.appendChild(fth);
    const ftd = el("td", "calc-formula", spec.formula);
    ftd.setAttribute("colspan", "2");
    fr.appendChild(ftd);
    tfoot.appendChild(fr);
    const er = el("tr", "calc-row-exact");
    const eth = el("th");
    eth.setAttribute("scope", "row");
    eth.textContent = "Résultat";
    eth.appendChild(el("span", "calc-note", "précision complète"));
    er.appendChild(eth);
    const etd = el("td", "amt", spec.exact);
    etd.setAttribute("colspan", "2");
    er.appendChild(etd);
    tfoot.appendChild(er);
    const sr = el("tr", "calc-row-shown");
    const sth = el("th");
    sth.setAttribute("scope", "row");
    sth.textContent = "Affiché dans la boîte";
    sth.appendChild(el("span", "calc-note", spec.shownNote || (detailsOn() ? "« Je veux les détails » est coché" : "arrondi à deux chiffres significatifs")));
    sr.appendChild(sth);
    const std = el("td", "amt", spec.shown);
    std.setAttribute("colspan", "2");
    sr.appendChild(std);
    tfoot.appendChild(sr);
    table.appendChild(tfoot);
    frag.appendChild(table);

    if (spec.notes && spec.notes.length) {
      const block = el("div", "info-block calc-notes");
      block.appendChild(el("h4", null, "Hypothèses"));
      const ul = el("ul");
      spec.notes.forEach(function (n) { ul.appendChild(el("li", null, n)); });
      block.appendChild(ul);
      frag.appendChild(block);
    }
    if (spec.tpl) {
      const tpl = document.getElementById("tpl-info-" + spec.tpl);
      if (tpl) {
        const extra = tpl.content.cloneNode(true);
        const t = extra.querySelector("[data-info-title]");
        if (t) t.remove();
        frag.appendChild(extra);
      }
    }
    return frag;
  }

  function openResultInfo(key) {
    const make = RESULT_INFO[key];
    const titleEl = $("fieldInfoTitle");
    const bodyEl = $("fieldInfoBody");
    if (!make || !titleEl || !bodyEl) return;
    const spec = make(calc());
    titleEl.textContent = "Comment c’est calculé — " + spec.title;
    bodyEl.replaceChildren(buildResultInfo(spec));
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
    if (m.id === "bugModal") syncBugChrome(false);
    releasePageForModal();
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

  /** Payback years stay on screen. The bar says Retour, like the box. */
  function setYearsPinned(on) {
    const bar = $("yearsPinBar");
    const pinned = !!on;
    if (bar) bar.hidden = !pinned;
    if (document.body) document.body.classList.toggle("is-years-pinned", pinned);
    const label = pinned ? "Désépingler le retour" : "Épingler le retour";
    [$("btnPinYears"), $("btnUnpinYears")].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute("aria-pressed", pinned ? "true" : "false");
      btn.setAttribute("aria-label", label);
    });
    yearsFloat.reset();
  }

  /*
   * Floating « Retour » (issue #147). One small pill, fixed on screen, its right edge
   * on the right edge of the green column (a few px inside), on phone and desktop.
   * When the Retour box of card 3 scrolls up to the pill, the pill slides onto it,
   * takes its size and fades into it (docked). When that box leaves, the pill comes
   * back out of it and floats again. Geometry is written as transform/width/height so
   * the CSS transition draws the move.
   */
  const YEARS_FOLLOW_MS = 460;
  const yearsFloat = (function () {
    let natural = null;
    let docked = null;
    let queued = false;
    let followUntil = 0;
    let following = false;

    function raf(fn) {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
      else setTimeout(fn, 16);
    }
    function now() {
      return typeof performance !== "undefined" && performance && typeof performance.now === "function" ? performance.now() : Date.now();
    }
    function styleOf(node) {
      return typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    }
    function els() {
      const bar = $("yearsPinBar");
      const card = bar ? bar.querySelector(".years-pin-card") : null;
      return { bar: bar, card: card, slot: $("yearsCard"), solar: document.querySelector(".col-solar"), fab: $("bugFab") };
    }
    function rem() {
      const cs = styleOf(document.documentElement);
      return (cs && parseFloat(cs.fontSize)) || 16;
    }
    function measure(card) {
      card.style.transition = "none";
      card.style.width = "";
      card.style.height = "";
      natural = { w: card.offsetWidth, h: card.offsetHeight };
    }
    /** Right edge of the green cards. On the wide grid `.col` is display: contents, so read its cards. */
    function solarRight(solar) {
      if (!solar) return NaN;
      const sr = solar.getBoundingClientRect();
      if (sr.width > 0) return sr.right;
      let right = NaN;
      Array.prototype.forEach.call(solar.children, function (child) {
        const cr = child.getBoundingClientRect();
        if (cr.width > 0 && (!isFinite(right) || cr.right > right)) right = cr.right;
      });
      return right;
    }
    function floatRect(e) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = rem();
      const barStyle = styleOf(e.bar);
      const edge = (barStyle && parseFloat(barStyle.paddingBottom)) || 0.4 * r;
      const inset = 0.4 * r;
      const colRight = solarRight(e.solar);
      let right = isFinite(colRight) ? colRight - inset : vw - edge;
      let left = right - natural.w;
      const minLeft = (e.fab && e.fab.getClientRects().length ? e.fab.getBoundingClientRect().right : 0) + 0.45 * r;
      if (left < minLeft) left = minLeft;
      const maxLeft = vw - 0.5 * r - natural.w;
      if (left > maxLeft) left = maxLeft;
      return { x: left, y: vh - edge - natural.h, w: natural.w, h: natural.h };
    }
    function slotRect(e) {
      const s = e.slot.getBoundingClientRect();
      return { x: s.left, y: s.top, w: s.width, h: s.height };
    }
    function apply(card, rect, animate) {
      card.style.transition = animate ? "" : "none";
      card.style.transform = "translate3d(" + rect.x.toFixed(1) + "px, " + rect.y.toFixed(1) + "px, 0)";
      card.style.width = rect.w.toFixed(1) + "px";
      card.style.height = rect.h.toFixed(1) + "px";
      if (!animate) {
        void card.offsetWidth;
        card.style.transition = "";
      }
    }
    function update() {
      queued = false;
      const e = els();
      if (!e.bar || !e.card || !e.slot || e.bar.hidden) return;
      if (!natural) measure(e.card);
      if (!(natural.w > 0) || !(natural.h > 0)) { natural = null; return; }
      const f = floatRect(e);
      const s = slotRect(e);
      const slotShown = s.w > 0 && s.h > 0;
      const shouldDock = slotShown && s.y < f.y + f.h && s.y + s.h > 0;
      if (docked === null) {
        docked = shouldDock;
        e.bar.classList.toggle("is-docked", docked);
        apply(e.card, docked ? s : f, false);
        return;
      }
      if (shouldDock && !docked) {
        docked = true;
        apply(e.card, s, true);
        e.bar.classList.add("is-docked");
        e.slot.classList.remove("is-years-landed");
        void e.slot.offsetWidth;
        e.slot.classList.add("is-years-landed");
        return;
      }
      if (!shouldDock && docked) {
        docked = false;
        e.bar.classList.remove("is-docked");
        apply(e.card, s, false);
        apply(e.card, f, true);
        return;
      }
      if (!docked) apply(e.card, f, !following);
    }
    function schedule() {
      if (queued) return;
      queued = true;
      raf(update);
    }
    function follow(ms) {
      followUntil = Math.max(followUntil, now() + (ms || YEARS_FOLLOW_MS));
      if (following) return;
      following = true;
      (function tick() {
        update();
        if (now() < followUntil) raf(tick);
        else following = false;
      })();
    }
    function reset() {
      natural = null;
      docked = null;
      schedule();
    }
    function wire() {
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", reset);
      const viewport = $("boardViewport");
      if (viewport) {
        viewport.addEventListener("board-pane-move", function (ev) {
          if (ev.detail && ev.detail.animate) follow(YEARS_FOLLOW_MS);
          else follow(40);
        });
      }
      if (typeof ResizeObserver === "function" && document.body) {
        new ResizeObserver(schedule).observe(document.body);
      }
      schedule();
    }
    return { wire: wire, schedule: schedule, reset: reset, follow: follow };
  })();

  /**
   * Wheel over the marginal rate steps the decimals (the field step, 0,001 ¢)
   * instead of scrolling the page. Hover is enough; the field need not be focused.
   */
  function wireRateWheel() {
    const el = $("rate");
    if (!el || el._rateWheel) return;
    el._rateWheel = true;
    el.addEventListener("wheel", function (e) {
      if (!e || !e.deltaY) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      const step = parseFloat(el.step);
      const dec = isFinite(step) && step > 0 ? step : 0.001;
      const dir = e.deltaY < 0 ? 1 : -1;
      const raw = parseFloat(String(el.value).trim().replace(",", "."));
      const base = isFinite(raw) ? raw : DEFAULT_RATE_CENTS;
      const places = (String(dec).split(".")[1] || "").length;
      const scale = Math.pow(10, places);
      let next = Math.round((base + dir * dec) * scale) / scale;
      if (next < dec) next = dec;
      el.value = next.toFixed(places);
      onScenarioEdit();
    }, { passive: false });
  }

  function wireUi() {
    wireFlagDock();
    ["tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate", "consoJour", "autoStop", "battPrice", "battTaxes", "fullAuto"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", onScenarioEdit);
      el.addEventListener("change", onScenarioEdit);
    });
    const pinYears = $("btnPinYears");
    const unpinYears = $("btnUnpinYears");
    function onYearsPinClick() {
      const bar = $("yearsPinBar");
      setYearsPinned(!(bar && !bar.hidden));
    }
    if (pinYears) pinYears.addEventListener("click", onYearsPinClick);
    if (unpinYears) unpinYears.addEventListener("click", onYearsPinClick);
    yearsFloat.wire();
    if (currentDisplayMode() !== "webi") setYearsPinned(true);
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
        const battDraft = $("battDraftNote");
        if (battDraft) battDraft.hidden = !showNotes.checked;
        showNotes.setAttribute("aria-expanded", showNotes.checked ? "true" : "false");
      };
      applyNotes();
      showNotes.addEventListener("change", function () {
        prefSet("solar-notes", showNotes.checked ? "1" : "0");
        applyNotes();
      });
    }
    wireRateWheel();
    ["util", "deneige", "priceW", "tilt"].forEach((id) => {
      const el = $(id);
      if (el) wireRangePointerDrag(el);
    });
    if ($("consoJour")) wireRangePointerDrag($("consoJour"));
    ["autoStop", "battPrice"].forEach((id) => {
      const el = $(id);
      if (el) wireRangePointerDrag(el);
    });
    const consoExtra = $("consoExtra");
    if (consoExtra) {
      consoExtra.addEventListener("input", onScenarioEdit);
      consoExtra.addEventListener("change", function () {
        scenarioSnapshot = true;
        formatConsoExtraInput();
        render();
      });
      consoExtra.addEventListener("blur", function () {
        scenarioSnapshot = true;
        formatConsoExtraInput();
        render();
      });
    }
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
    const bugFab = $("bugFab");
    if (bugFab) {
      bugFab.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        const m = $("bugModal");
        if (m && !m.hidden && activeModalId === "bugModal") {
          closeInfo();
          return;
        }
        openBugReport(e);
      });
    }
    if (typeof window.matchMedia === "function") {
      try {
        const bugDockMq = window.matchMedia(BUG_DOCK_QUERY);
        const onBugDockChange = function () {
          if (activeModalId !== "bugModal") return;
          const m = $("bugModal");
          if (!m || m.hidden) return;
          const dock = syncBugChrome(true);
          if (dock) releasePageForModal();
          else holdPageForModal();
        };
        if (bugDockMq.addEventListener) bugDockMq.addEventListener("change", onBugDockChange);
        else if (bugDockMq.addListener) bugDockMq.addListener(onBugDockChange);
      } catch (_) {}
    }
    if ($("bugForm")) $("bugForm").addEventListener("submit", submitBugReport);
    if ($("btnInfo")) $("btnInfo").addEventListener("click", openInfo);
    if ($("btnRateInfo")) $("btnRateInfo").addEventListener("click", openRateInfo);
    document.querySelectorAll(".field-info-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const resultKey = btn.getAttribute("data-result-info");
        if (resultKey) openResultInfo(resultKey);
        else openFieldInfo(btn.getAttribute("data-info"));
      });
    });
    ["btnInfoClose", "btnInfoOk", "btnRateClose", "btnRateOk", "btnFieldInfoClose", "btnFieldInfoOk", "btnBugClose"].forEach(function (id) {
      if ($(id)) $(id).addEventListener("click", closeInfo);
    });
    ["infoModal", "rateModal", "fieldInfoModal", "bugModal"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", function (e) {
        if (e.target !== el) return;
        if (id === "bugModal" && el.classList.contains("bug-dock")) return;
        closeInfo();
      });
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "NumpadEnter") && bugShortcutTarget(e)) {
        e.preventDefault();
        submitBugReport(e);
        return;
      }
      if (e.key === "Escape") {
        if (townListOpen) {
          closeTownList(true);
          return;
        }
        closeInfo();
      }
      trapModalTab(e);
    });

    const multiBox = $("multi");
    if (multiBox) {
      multiBox.addEventListener("change", function () {
        syncMultiLayout();
        onScenarioEdit();
      });
    }
    const pansAdd = $("pansAdd");
    if (pansAdd) {
      pansAdd.addEventListener("click", function () {
        if (!multiOn()) return;
        ensurePans();
        if (pans.length >= MAX_PANS) return;
        const last = pans[pans.length - 1];
        pans.push({ m2: 20, az: last.az === 270 ? 180 : 270, tilt: last.tilt, snow: 100 });
        buildPanRows();
        onScenarioEdit();
      });
    }
    if (typeof document.querySelectorAll === "function") {
      document.querySelectorAll("[data-unit-btn]").forEach(function (btn) {
        btn.addEventListener("click", function () { setUnit(btn.getAttribute("data-unit-btn")); });
      });
    }
    wireTownPicker();

    let initialSearch = "";
    try { initialSearch = location.search || ""; } catch (_) { initialSearch = ""; }
    if ($("autoStop")) {
      $("autoStop").min = "0";
      $("autoStop").max = String(RESERVE_STOPS.length - 1);
      $("autoStop").step = "1";
      $("autoStop").value = String(RESERVE_DEFAULT_INDEX);
    }
    if ($("battPrice")) $("battPrice").value = String(BATT_PRICE_DEFAULT);
    scenarioSnapshot = searchHasScenario(initialSearch);
    applyScenario(parseScenarioSearch(initialSearch));
    try {
      if (location.hash === "#bugModal") openBugReport();
    } catch (_) {}
  }

  function townById(id) {
    if (!townByIdMap) return null;
    return townByIdMap[id] || null;
  }

  function canonicalVille(id) {
    const v = String(id == null ? "" : id).trim().toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(v)) return DEFAULT_VILLE;
    if (townCatalog.length && !townById(v)) return DEFAULT_VILLE;
    return v;
  }

  function fmtYield(n) {
    if (!isFinite(Number(n))) return "—";
    return fmtGroupedInt(Math.round(Number(n))).replace(/ /g, "\u00A0") + " kWh/kWc/an";
  }

  function southAnnual(cells, tilt, az) {
    const row = cells && cells[tilt];
    const cell = row && row[az];
    const n = cell ? Number(cell.ac_annual) : NaN;
    return isFinite(n) && n > 0 ? n : NaN;
  }

  function usesQuebecGrid(town) {
    return !!(town && town.grid === "full" && String(town.grid_file || "").indexOf("quebec-full-grid") !== -1);
  }

  /** Québec sud 45° × this town’s measured sud 30° / Québec sud 30°. Same scale the calculator applies. */
  function scaledSouth45(town) {
    const q45 = southAnnual(baseCells, "45", "180");
    const s30 = Number(town && town.ac_annual_s30);
    if (!(isFinite(q45) && q45 > 0 && isFinite(s30) && s30 > 0 && isFinite(quebecS30) && quebecS30 > 0)) return NaN;
    return q45 * (s30 / quebecS30);
  }

  /** Sud 45° already stored on the town, so the menu can show and sort before grids load. */
  function storedSouth45(town) {
    const n = Number(town && town.ac_annual_s45);
    return isFinite(n) && n > 0 ? n : NaN;
  }

  /**
   * Dropdown kWh/kWc/an: measured south 45° (tilt 45, azimuth 180) when that grid is loaded.
   * Otherwise the stored sud 45° figure. Towns without either use Québec’s south-45° cell
   * scaled by their sud 30° ratio. NaN until one of those is available.
   */
  function menuYieldAnnual(town) {
    if (!town) return NaN;
    if (town.grid === "full") {
      const cells = usesQuebecGrid(town) ? baseCells : fullGridCells[town.id];
      const measured = southAnnual(cells, "45", "180");
      if (isFinite(measured)) return measured;
      const stored = storedSouth45(town);
      if (isFinite(stored)) return stored;
      if (!usesQuebecGrid(town) && !fullGridMiss[town.id]) return NaN;
    }
    const stored = storedSouth45(town);
    if (isFinite(stored)) return stored;
    return scaledSouth45(town);
  }

  function menuYieldText(town) {
    const n = menuYieldAnnual(town);
    if (!isFinite(n)) return "";
    return fmtYield(n);
  }

  /** Menu order: sud 45° kWh/kWc/an, highest first. Same yield: French name. */
  function sortTownCatalog() {
    townCatalog.sort(function (a, b) {
      const ya = menuYieldAnnual(a);
      const yb = menuYieldAnnual(b);
      const aOk = isFinite(ya);
      const bOk = isFinite(yb);
      if (aOk && bOk && ya !== yb) return yb - ya;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), "fr-CA", { sensitivity: "base" });
    });
  }

  function foldTownName(s) {
    return String(s || "")
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function townMatchesQuery(town, foldedQuery) {
    if (!foldedQuery) return true;
    const fields = [town.name, town.territory, town.region];
    for (let i = 0; i < fields.length; i++) {
      if (foldTownName(fields[i]).indexOf(foldedQuery) !== -1) return true;
    }
    return false;
  }

  function selectedTownLabel() {
    const town = townById(selectedVille);
    if (town) return town.name;
    return selectedVille === DEFAULT_VILLE ? "Québec" : selectedVille;
  }

  function townQueryFolded() {
    const input = $("villeBtn");
    return foldTownName(input ? input.value : "");
  }

  function townsForList() {
    if (!townListOpen || !townQueryDirty) return townCatalog;
    const q = townQueryFolded();
    if (!q) return townCatalog;
    return townCatalog.filter(function (town) { return townMatchesQuery(town, q); });
  }

  function visibleTownOptions() {
    const list = $("villeList");
    if (!list || typeof list.querySelectorAll !== "function") return [];
    return list.querySelectorAll('[role="option"]');
  }

  function paintTownButton() {
    const town = townById(selectedVille);
    const input = $("villeBtn");
    const yieldEl = $("villeYield");
    const field = $("townField");
    if (input && !(townListOpen && townQueryDirty)) input.value = selectedTownLabel();
    if (yieldEl) {
      const text = menuYieldText(town);
      if (text) {
        yieldEl.textContent = text;
        quebecYieldPlaceholder = false;
      } else if (quebecYieldPlaceholder && selectedVille === DEFAULT_VILLE && town && town.id === DEFAULT_VILLE) {
        // Leave the pre-rendered Québec sud 45° number until the grid is in.
      } else {
        quebecYieldPlaceholder = false;
        yieldEl.textContent = "—";
      }
    }
    if (input) input.setAttribute("aria-expanded", townListOpen ? "true" : "false");
    if (field && field.classList) {
      field.classList.toggle("is-open", townListOpen);
      field.classList.toggle("is-searching", !!(townListOpen && townQueryDirty));
    }
    const caret = $("villeCaret");
    if (caret) caret.setAttribute("aria-label", townListOpen ? "Masquer les villes" : "Afficher les villes");
    const options = visibleTownOptions();
    for (let i = 0; i < options.length; i++) {
      const on = options[i].getAttribute("data-id") === selectedVille;
      options[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function setTownActive(index) {
    const options = visibleTownOptions();
    const input = $("villeBtn");
    const n = options.length;
    if (!n) {
      townActiveIndex = -1;
      if (input) input.removeAttribute("aria-activedescendant");
      return;
    }
    townActiveIndex = ((index % n) + n) % n;
    for (let i = 0; i < n; i++) {
      options[i].classList.toggle("is-active", i === townActiveIndex);
    }
    const active = options[townActiveIndex];
    if (input) input.setAttribute("aria-activedescendant", active.id || "");
    const list = $("villeList");
    if (active && list && typeof active.offsetTop === "number") {
      const top = active.offsetTop;
      const bottom = top + (active.offsetHeight || 0);
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
  }

  function moveTownActive(delta) {
    const options = visibleTownOptions();
    if (!options.length) return;
    if (townActiveIndex < 0) {
      let current = -1;
      for (let i = 0; i < options.length; i++) {
        if (options[i].getAttribute("data-id") === selectedVille) {
          current = i;
          break;
        }
      }
      setTownActive(current < 0 ? 0 : current);
      return;
    }
    setTownActive(townActiveIndex + delta);
  }

  function openTownList() {
    const list = $("villeList");
    const input = $("villeBtn");
    if (!list || !townCatalog.length) return;
    const already = townListOpen;
    townListOpen = true;
    list.hidden = false;
    if (!already) townQueryDirty = false;
    paintTownButton();
    renderTownOptions();
    const towns = townsForList();
    let idx = -1;
    for (let i = 0; i < towns.length; i++) {
      if (towns[i].id === selectedVille) {
        idx = i;
        break;
      }
    }
    setTownActive(idx < 0 ? 0 : idx);
    if (!already && input && typeof input.setSelectionRange === "function") {
      try { input.setSelectionRange(0, String(input.value || "").length); } catch (_) {}
    }
    revealTownList();
  }

  function revealTownList() {
    const field = $("townField");
    if (!field || typeof field.getBoundingClientRect !== "function") return;
    if (typeof window === "undefined" || !window.innerHeight) return;
    const rect = field.getBoundingClientRect();
    const room = Math.min(320, Math.round(window.innerHeight * 0.46));
    const limit = window.innerHeight - room;
    if (rect.bottom <= limit) return;
    const delta = rect.bottom - limit;
    try { window.scrollBy({ top: delta, left: 0, behavior: "instant" }); }
    catch (_) { try { window.scrollBy(0, delta); } catch (__) {} }
  }

  function closeTownList(focusBtn) {
    const list = $("villeList");
    const input = $("villeBtn");
    townListOpen = false;
    townQueryDirty = false;
    townActiveIndex = -1;
    if (townBlurTimer) {
      clearTimeout(townBlurTimer);
      townBlurTimer = null;
    }
    if (list) {
      list.hidden = true;
      list.removeAttribute("aria-activedescendant");
    }
    if (input) input.removeAttribute("aria-activedescendant");
    paintTownButton();
    if (focusBtn && input) {
      townSuppressOpen = true;
      try { input.focus(); } catch (_) {}
      setTimeout(function () { townSuppressOpen = false; }, 0);
    }
  }

  function commitTownActive() {
    const options = visibleTownOptions();
    const active = options[townActiveIndex];
    const id = active && active.getAttribute("data-id");
    if (id) pickTown(id);
    else closeTownList(true);
  }

  function applyTownQuery() {
    const input = $("villeBtn");
    townQueryDirty = true;
    const list = $("villeList");
    if (!townListOpen && list && townCatalog.length) {
      townListOpen = true;
      list.hidden = false;
    }
    paintTownButton();
    renderTownOptions();
    const q = townQueryFolded();
    const options = visibleTownOptions();
    if (!options.length) {
      townActiveIndex = -1;
      if (input) input.removeAttribute("aria-activedescendant");
      return;
    }
    if (!q) {
      let idx = -1;
      for (let i = 0; i < options.length; i++) {
        if (options[i].getAttribute("data-id") === selectedVille) {
          idx = i;
          break;
        }
      }
      setTownActive(idx < 0 ? 0 : idx);
    } else {
      setTownActive(0);
    }
    revealTownList();
  }

  async function pickTown(id) {
    selectedVille = canonicalVille(id);
    if ($("ville")) $("ville").value = selectedVille;
    paintTownButton();
    closeTownList(true);
    scenarioSnapshot = true;
    syncScenarioUrl();
    const pending = ensureTownGrid(selectedVille);
    render();
    try {
      await pending;
    } finally {
      render();
    }
  }

  function appendTownOption(list, town) {
    const li = document.createElement("li");
    li.className = "town-option";
    li.setAttribute("role", "option");
    li.id = "ville-opt-" + town.id;
    li.setAttribute("data-id", town.id);
    li.setAttribute("aria-selected", town.id === selectedVille ? "true" : "false");
    const label = document.createElement("span");
    label.className = "town-label";
    const name = document.createElement("span");
    name.className = "town-name";
    name.textContent = town.name;
    label.appendChild(name);
    if (town.region) {
      const region = document.createElement("span");
      region.className = "town-region";
      region.textContent = town.region;
      label.appendChild(region);
    }
    const yieldEl = document.createElement("span");
    yieldEl.className = "town-yield";
    yieldEl.textContent = menuYieldText(town) || "—";
    li.appendChild(label);
    li.appendChild(yieldEl);
    list.appendChild(li);
  }

  function syncNativeSelect() {
    const sel = $("ville");
    if (!sel || typeof document.createElement !== "function") return;
    sel.textContent = "";
    townCatalog.forEach(function (town) {
      const opt = document.createElement("option");
      opt.value = town.id;
      opt.textContent = town.name;
      if (town.id === selectedVille) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.value = selectedVille;
  }

  function renderTownOptions() {
    const list = $("villeList");
    if (!list || typeof document.createElement !== "function") return;
    const towns = townsForList();
    list.textContent = "";
    if (!towns.length) {
      const empty = document.createElement("li");
      empty.className = "town-empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "Aucune ville";
      list.appendChild(empty);
      return;
    }
    towns.forEach(function (town) { appendTownOption(list, town); });
  }

  function renderTownList() {
    if (typeof document.createElement !== "function") return;
    syncNativeSelect();
    renderTownOptions();
    paintTownButton();
  }

  /** Refresh menu yields without rebuilding the list or the native select, so the selection stays put. */
  function refreshTownYields() {
    paintTownButton();
    const list = $("villeList");
    if (!list || typeof list.querySelectorAll !== "function") return;
    const options = list.querySelectorAll('[role="option"]');
    for (let i = 0; i < options.length; i++) {
      const li = options[i];
      const town = townById(li.getAttribute("data-id"));
      const yieldEl = li.querySelector && li.querySelector(".town-yield");
      if (!town || !yieldEl) continue;
      const text = menuYieldText(town);
      if (text) yieldEl.textContent = text;
    }
    const sel = $("ville");
    if (sel && sel.value !== selectedVille) sel.value = selectedVille;
  }

  function wireTownPicker() {
    const input = $("villeBtn");
    if (!input || input._townWired) return;
    input._townWired = true;
    input.addEventListener("focus", function () {
      if (townSuppressOpen) return;
      openTownList();
    });
    input.addEventListener("input", function () {
      applyTownQuery();
    });
    input.addEventListener("keydown", function (e) {
      if (!e) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (e.preventDefault) e.preventDefault();
        if (!townListOpen) openTownList();
        else moveTownActive(e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "Enter" && townListOpen) {
        if (e.preventDefault) e.preventDefault();
        commitTownActive();
      } else if (e.key === "Escape" && townListOpen) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        closeTownList(true);
      } else if (e.key === "Tab" && townListOpen) {
        closeTownList(false);
      }
    });
    input.addEventListener("blur", function () {
      if (townBlurTimer) clearTimeout(townBlurTimer);
      townBlurTimer = setTimeout(function () {
        townBlurTimer = null;
        if (!townListOpen) return;
        closeTownList(false);
      }, 200);
    });
    const caret = $("villeCaret");
    function toggleFromCaret() {
      if (townListOpen) closeTownList(true);
      else {
        townSuppressOpen = false;
        try { input.focus(); } catch (_) {}
        openTownList();
      }
    }
    if (caret) {
      caret.addEventListener("pointerdown", function (e) {
        if (e && e.preventDefault) e.preventDefault();
        toggleFromCaret();
      });
      caret.addEventListener("mousedown", function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (typeof PointerEvent !== "undefined") return;
        toggleFromCaret();
      });
    }
    const list = $("villeList");
    function optionFromEvent(e) {
      const target = e && e.target;
      if (!target || typeof target.closest !== "function") return null;
      const li = target.closest('[role="option"]');
      if (!li || (typeof list.contains === "function" && !list.contains(li))) return null;
      return li;
    }
    function keepListFocus(e) {
      const li = optionFromEvent(e);
      if (!li) return;
      if (e.preventDefault) e.preventDefault();
      if (townBlurTimer) {
        clearTimeout(townBlurTimer);
        townBlurTimer = null;
      }
    }
    if (list) {
      list.addEventListener("pointerdown", keepListFocus);
      list.addEventListener("mousedown", keepListFocus);
      list.addEventListener("click", function (e) {
        const li = optionFromEvent(e);
        if (!li) return;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        pickTown(li.getAttribute("data-id"));
      });
    }
    document.addEventListener("click", function (e) {
      if (!townListOpen) return;
      const picker = $("townPicker");
      const target = e && e.target;
      if (picker && target && typeof picker.contains === "function" && picker.contains(target)) return;
      closeTownList(false);
    });
  }

  function scaleGrid(cells, scale) {
    const out = {};
    Object.keys(cells).forEach(function (tilt) {
      out[tilt] = {};
      Object.keys(cells[tilt]).forEach(function (az) {
        const c = cells[tilt][az];
        const decRaw = c.ac_dec != null ? c.ac_dec : (c.ac_monthly && c.ac_monthly.dec);
        const dec = Number(decRaw);
        out[tilt][az] = {
          ac_annual: Number(c.ac_annual) * scale,
          W_winter: c.W_winter,
          ac_dec: (isFinite(dec) ? dec : FALLBACK_S30.ac_dec) * scale
        };
      });
    });
    return out;
  }

  async function fetchTownGridFile(town) {
    if (town && fullGridCells[town.id]) return fullGridCells[town.id];
    const file = town.grid_file || ("assets/town-grids/" + town.id + ".json");
    const res = await fetch(file, { cache: "force-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || !data.cells || data.scaled === true) throw new Error("pas une grille PVWatts complète");
    const n = Object.keys(data.cells).reduce(function (acc, tilt) {
      return acc + Object.keys(data.cells[tilt] || {}).length;
    }, 0);
    if (n < 168) throw new Error("grille incomplète");
    if (town && town.id) {
      fullGridCells[town.id] = data.cells;
      delete fullGridMiss[town.id];
    }
    return data.cells;
  }

  /** Load the other full grids so their menu figures are the measured sud 45° cells. */
  async function loadMenuFullGrids() {
    const jobs = [];
    townCatalog.forEach(function (town) {
      if (!town || town.grid !== "full" || usesQuebecGrid(town)) return;
      jobs.push(fetchTownGridFile(town).catch(function (err) {
        fullGridMiss[town.id] = true;
        console.warn("Grille complète indisponible pour le menu", town.id, err);
      }));
    });
    await Promise.all(jobs);
    const before = townCatalog.map(function (t) { return t.id; }).join("\n");
    sortTownCatalog();
    const after = townCatalog.map(function (t) { return t.id; }).join("\n");
    if (before !== after) renderTownList();
    else refreshTownYields();
  }

  function applyScaledTown(town, token) {
    const s30 = Number(town && town.ac_annual_s30);
    if (!(isFinite(s30) && s30 > 0 && isFinite(quebecS30) && quebecS30 > 0)) return false;
    if (token !== gridToken) return false;
    gridCells = scaleGrid(baseCells, s30 / quebecS30);
    gridReady = true;
    gridStatus = "ready";
    gridIsScaled = true;
    activeTownId = town.id;
    return true;
  }

  async function ensureTownGrid(id) {
    const token = ++gridToken;
    const useId = canonicalVille(id || selectedVille);
    if (!baseCells) return;
    const town = townById(useId);
    const useQuebec = !town || useId === DEFAULT_VILLE || usesQuebecGrid(town);
    if (useQuebec) {
      if (token !== gridToken) return;
      gridCells = baseCells;
      gridReady = true;
      gridStatus = "ready";
      gridIsScaled = false;
      activeTownId = DEFAULT_VILLE;
      return;
    }
    if (town.grid === "full") {
      if (fullGridCells[town.id]) {
        if (token !== gridToken) return;
        gridCells = fullGridCells[town.id];
        gridReady = true;
        gridStatus = "ready";
        gridIsScaled = false;
        activeTownId = useId;
        refreshTownYields();
        return;
      }
      applyScaledTown(town, token);
      gridStatus = "loading";
      lastGridUiStatus = null;
      updateGridStatusUi();
      try {
        const cells = await fetchTownGridFile(town);
        refreshTownYields();
        if (token !== gridToken) return;
        gridCells = cells;
        gridReady = true;
        gridStatus = "ready";
        gridIsScaled = false;
        activeTownId = useId;
        return;
      } catch (err) {
        console.warn("Grille complète indisponible — échelle sud 30°", useId, err);
        fullGridMiss[town.id] = true;
        refreshTownYields();
        if (token !== gridToken) return;
        if (applyScaledTown(town, token)) return;
      }
    }
    if (token !== gridToken) return;
    if (applyScaledTown(town, token)) return;
    gridCells = baseCells;
    gridReady = true;
    gridStatus = "ready";
    gridIsScaled = false;
    activeTownId = DEFAULT_VILLE;
  }

  async function loadTowns() {
    try {
      const res = await fetch("assets/towns.json", { cache: "force-cache" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !Array.isArray(data.towns)) return;
      const towns = data.towns.filter(function (t) { return t && t.id && t.name; });
      if (!towns.length) return;
      townCatalog = towns;
      sortTownCatalog();
      townByIdMap = {};
      towns.forEach(function (t) { townByIdMap[t.id] = t; });
      if (data.meta && isFinite(Number(data.meta.quebec_s30))) quebecS30 = Number(data.meta.quebec_s30);
      selectedVille = canonicalVille(selectedVille);
      renderTownList();
    } catch (err) {
      console.warn("Liste des villes non chargée", err);
    }
  }

  function setGridFromPayload(data) {
    if (data && data.cells) {
      baseCells = data.cells;
      if (!gridCells) {
        gridCells = baseCells;
        activeTownId = DEFAULT_VILLE;
        gridIsScaled = false;
      }
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
    dailyLoadKwh,
    sliderDailyKwh,
    loadsVisibleCount,
    clampExtraKwh,
    fmtKwhDay,
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
    fmtReserveKwh,
    fmtFillDuration,
    RESERVE_STOPS,
    fmtMoneySig2,
    fmtShown,
    fmtShownMoney,
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
      BUYBACK_RATE,
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
    await loadTowns();
    await loadGrid();
    refreshTownYields();
    await Promise.all([ensureTownGrid(selectedVille), loadMenuFullGrids()]);
    render();
  });

  window.addEventListener("beforeprint", () => {
    closeInfo();
    const report = $("printReport");
    if (report && !report.hasChildNodes()) buildPrintReport();
  });

  window.addEventListener("afterprint", () => {
    const report = $("printReport");
    if (report) report.replaceChildren();
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
    if (location.hash === "#bugModal") openBugReport();
  });

})();
