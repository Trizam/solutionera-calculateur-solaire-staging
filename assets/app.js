/* Calculateur Solaire version 0.2 — Solution Era — Québec full grid + W-by-tilt */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  // Used for ANY missing cell so calc never stays blank forever
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323, ac_dec: 53.274 };
  /** Default: the snow is always cleared off the panels. */
  const DEFAULT_DENEIGEMENT = 1;
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
  /** Draft installed-battery range until a real $/kWh band is chosen. */
  const BATT_PRICE_DEFAULT = 1200;
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
    if (!body) return;
    const n = loadsVisibleCount(tenths);
    let html = "";
    for (let i = 0; i < n; i++) {
      const load = DAILY_LOADS[i];
      html += "<span class=\"load-chip\" role=\"listitem\"><span class=\"load-name\">" + load.icon + "<span>" + load.label + "</span></span><span class=\"load-kwh\">" + fmtKwhDay(load.tenths / 10) + "</span></span>";
    }
    body.innerHTML = html;
    body.classList.toggle("is-empty", n === 0);
    if (n === 0) body.setAttribute("aria-hidden", "true");
    else body.removeAttribute("aria-hidden");
  }

  /** Slider kWh; chips above it; total line adds the free kWh/day. Note vs December. */
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
    if (totalEl) totalEl.textContent = fmtKwhDay(total) + " kWh";
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
    document.documentElement.setAttribute("data-autonomy", hours > 0 ? "on" : "off");
  }

  /**
   * Opt-in reveal. Cards above the December daily figure start higher and
   * settle down toward that axis; cards below start lower and settle up.
   * They land in the board’s own slots. The viewport then eases, like a
   * map drag, to just above 4A. A user scroll cancels the pan.
   */
  const AUTONOMY_MOTION_MS = 620;
  let autonomyAnims = [];
  let autonomyPanStop = null;

  function motionReduced() {
    const win = typeof window !== "undefined" ? window : null;
    if (!win || typeof win.matchMedia !== "function") return true;
    try {
      return !!win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (err) {
      return true;
    }
  }

  function cancelAutonomyMotion() {
    autonomyAnims.forEach(function (anim) {
      try { anim.cancel(); } catch (err) { /* finished */ }
    });
    autonomyAnims = [];
    if (typeof document.querySelectorAll === "function") {
      const stuck = document.querySelectorAll("#board .block, #board .result-pill, #board .result-pair, .dec-daily");
      Array.prototype.forEach.call(stuck || [], clearMotionStyles);
    }
    if (autonomyPanStop) autonomyPanStop();
  }

  function axisCenterY() {
    const axis = $("outKwhDay");
    if (!axis || typeof axis.getBoundingClientRect !== "function") return null;
    const r = axis.getBoundingClientRect();
    if (!r || !(r.height > 0)) return null;
    return r.top + r.height / 2;
  }

  function gravityTravel(el, axisY) {
    if (axisY == null || !el || typeof el.getBoundingClientRect !== "function") return null;
    if (el.id === "outKwhDay" || (typeof el.contains === "function" && el.contains($("outKwhDay")))) return null;
    const r = el.getBoundingClientRect();
    if (!r || !(r.height > 1) || !(r.width > 1)) return null;
    const delta = (r.top + r.height / 2) - axisY;
    if (Math.abs(delta) < 24) return null;
    const travel = Math.min(96, Math.abs(delta) * 0.34);
    return delta < 0 ? -travel : travel;
  }

  function autonomyMotionCards() {
    const board = $("board");
    if (!board || typeof board.querySelectorAll !== "function") return [];
    const nodes = board.querySelectorAll(":scope > .block, :scope > .result-pill, :scope > .slot-need > .block");
    return Array.prototype.slice.call(nodes || []);
  }

  function clearMotionStyles(el) {
    if (!el || !el.style) return;
    el.style.transform = "";
    el.style.opacity = "";
    el.style.willChange = "";
  }

  function playGravity() {
    const axisY = axisCenterY();
    const cards = autonomyMotionCards();
    const freshSel = ".autonomy-column";
    cards.forEach(function (el) {
      const from = gravityTravel(el, axisY);
      if (from == null) return;
      const fresh = typeof el.closest === "function" && !!el.closest(freshSel);
      if (motionReduced() || typeof el.animate !== "function") return;
      el.style.willChange = "transform";
      const frames = fresh
        ? [
          { transform: "translateY(" + from + "px)", opacity: 0 },
          { transform: "translateY(0px)", opacity: 1 }
        ]
        : [
          { transform: "translateY(" + from + "px)" },
          { transform: "translateY(0px)" }
        ];
      if (fresh) el.style.opacity = "0";
      el.style.transform = "translateY(" + from + "px)";
      const anim = el.animate(frames, {
        duration: AUTONOMY_MOTION_MS,
        easing: "cubic-bezier(0.22, 0.61, 0.24, 1)",
        fill: "both"
      });
      autonomyAnims.push(anim);
      anim.onfinish = function () {
        anim.cancel();
        clearMotionStyles(el);
      };
    });
    const decNodes = typeof document.querySelectorAll === "function"
      ? document.querySelectorAll(".dec-daily")
      : [];
    Array.prototype.forEach.call(decNodes || [], function (el) {
      if (!el || el.hidden || typeof el.animate !== "function") return;
      const r = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
      if (!r || !(r.height > 1)) return;
      if (motionReduced()) return;
      el.style.opacity = "0";
      const anim = el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 420, easing: "ease-out", fill: "both" }
      );
      autonomyAnims.push(anim);
      anim.onfinish = function () {
        anim.cancel();
        clearMotionStyles(el);
      };
    });
  }

  /**
   * Viewport Y of the anchor as laid out, without the gravity translate
   * on an ancestor. Grid position comes from getBoundingClientRect;
   * offsetTop would ignore it.
   */
  function layoutViewportTop(el) {
    let adjust = 0;
    let node = el.parentElement;
    while (node && node !== document.body) {
      let tr = "none";
      try {
        tr = window.getComputedStyle(node).transform;
      } catch (err) {
        tr = "none";
      }
      if (tr && tr !== "none" && typeof DOMMatrix !== "undefined") {
        try {
          adjust += new DOMMatrix(tr).m42 || 0;
        } catch (err2) { /* keep the raw rect */ }
      }
      node = node.parentElement;
    }
    return el.getBoundingClientRect().top - adjust;
  }

  function panTargetY(anchor, margin) {
    const win = window;
    const current = win.scrollY || win.pageYOffset || 0;
    return Math.max(0, current + layoutViewportTop(anchor) - margin);
  }

  /**
   * The page eases anchor jumps (scroll-behavior: smooth). A map pan writes
   * its own curve, so those writes have to land in the same frame.
   */
  function holdInstantScroll() {
    const root = document.documentElement;
    if (!root || !root.style) return function () {};
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    return function () {
      root.style.scrollBehavior = prev;
    };
  }

  function clampScrollY(win, y) {
    const root = document.scrollingElement || document.documentElement;
    const max = Math.max(0, (root.scrollHeight || 0) - (win.innerHeight || 0));
    if (!isFinite(y)) return 0;
    return Math.min(max, Math.max(0, y));
  }

  function panToAutonomy(instant) {
    if (autonomyPanStop) autonomyPanStop();
    const anchor = $("h-auto") || $("autonomyAnchor") || $("sec-auto");
    const win = typeof window !== "undefined" ? window : null;
    if (!anchor || !win || typeof anchor.getBoundingClientRect !== "function") return;
    /* Rest just above the first autonomy question. */
    const margin = 72;
    const releaseScroll = holdInstantScroll();
    const targetNow = panTargetY(anchor, margin);
    if (instant || motionReduced() || typeof win.requestAnimationFrame !== "function" || typeof win.scrollTo !== "function") {
      if (typeof win.scrollTo === "function") win.scrollTo(0, clampScrollY(win, targetNow));
      releaseScroll();
      return;
    }
    const start = win.scrollY || win.pageYOffset || 0;
    if (Math.abs(targetNow - start) < 2) {
      releaseScroll();
      return;
    }
    const t0 = typeof win.performance !== "undefined" && win.performance.now ? win.performance.now() : Date.now();
    let stopped = false;
    let frameId = 0;
    /* Last scrollY this pan wrote. A scroll event that lands elsewhere is the user. */
    let lastSet = start;
    function cleanup() {
      stopped = true;
      if (frameId) win.cancelAnimationFrame(frameId);
      frameId = 0;
      autonomyPanStop = null;
      win.removeEventListener("wheel", onUser, true);
      win.removeEventListener("touchstart", onUser, true);
      win.removeEventListener("touchmove", onUser, true);
      win.removeEventListener("keydown", onUser, true);
      win.removeEventListener("scroll", onScroll, true);
      releaseScroll();
    }
    function onUser(ev) {
      if (stopped) return;
      if (ev && ev.type === "keydown") {
        const k = ev.key;
        if (k !== "ArrowUp" && k !== "ArrowDown" && k !== "PageUp" && k !== "PageDown" && k !== "Home" && k !== "End" && k !== " ") return;
      }
      cleanup();
    }
    function onScroll() {
      if (stopped) return;
      const y = win.scrollY || win.pageYOffset || 0;
      if (Math.abs(y - lastSet) > 2) cleanup();
    }
    win.addEventListener("wheel", onUser, true);
    win.addEventListener("touchstart", onUser, true);
    win.addEventListener("touchmove", onUser, true);
    win.addEventListener("keydown", onUser, true);
    win.addEventListener("scroll", onScroll, true);
    autonomyPanStop = cleanup;
    function frame(now) {
      if (stopped) return;
      const t = Math.min(1, ((now || Date.now()) - t0) / AUTONOMY_MOTION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const liveTarget = panTargetY(anchor, margin);
      const next = clampScrollY(win, start + (liveTarget - start) * eased);
      /* Set before scrollTo so a synchronous scroll event matches this write. */
      lastSet = next;
      win.scrollTo(0, next);
      if (stopped || t >= 1) {
        if (!stopped) cleanup();
        return;
      }
      frameId = win.requestAnimationFrame(frame);
    }
    frameId = win.requestAnimationFrame(frame);
  }

  function revealAutonomyView() {
    cancelAutonomyMotion();
    if (currentDisplayMode() === "webi") return;
    if (motionReduced()) {
      panToAutonomy(true);
      return;
    }
    playGravity();
    const win = typeof window !== "undefined" ? window : null;
    if (win && typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(function () { panToAutonomy(false); });
    } else {
      panToAutonomy(true);
    }
  }

  function setWantAutonomy(on) {
    const root = document.documentElement;
    if (!root) return;
    const next = on ? "on" : "off";
    const prev = root.getAttribute("data-want-autonomy");
    root.setAttribute("data-want-autonomy", next);
    const box = $("wantAutonomy");
    if (box && box.checked !== !!on) box.checked = !!on;
    if (!on) {
      cancelAutonomyMotion();
      return;
    }
    if (prev === "on") return;
    revealAutonomyView();
  }

  function battPricePerKwh() {
    const el = $("battPrice");
    if (!el) return NaN;
    const v = parseFloat(el.value);
    return isFinite(v) ? v : NaN;
  }

  /** Fill duration at the December daily rate. Display only. */
  function fmtFillDuration(days) {
    if (!isFinite(days) || days < 0) return { num: "—", unit: "" };
    if (days > 365) return { num: "> 1 an", unit: "au rythme de décembre" };
    const minutes = days * 24 * 60;
    if (minutes < 90) return { num: fmtShown(minutes, 0), unit: "min · décembre" };
    const hours = days * 24;
    if (hours < 48) return { num: fmtShown(hours, 1), unit: "h · décembre" };
    return { num: fmtShown(days, 1), unit: "jours · décembre" };
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
    const kWhPerKwc = applyDeneigement(table, deneige, W);
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
    const auto = autonomyChoice();
    const consoJour = consoJourKwh();
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
    const battPrice = battPricePerKwh();
    const battCost = isFinite(reserveKwh) && isFinite(battPrice) ? reserveKwh * battPrice : NaN;
    const projectTotal = isFinite(battCost) ? reel + battCost : NaN;
    return {
      m2, util, deneige, tilt, az, priceW, taxesOn, subvOn, rateOk,
      kW, nPv, table, kWhPerKwc, kWhAnnuel, kWh, kWhDecMonth, kWhDec, kWhDay, W, snowCover, showVerticalRec,
      conso, kWhCredites, ecoClamped,
      HT, TTC, taxes, subv, reel, eco, years,
      consoJour, autonomyDays: auto.days, autonomyLabel: auto.label, reserveKwh,
      surplusDay, fillState, fillDays, shortfall,
      battPrice, battCost, projectTotal,
      gridReady, gridStatus, cellSource: gridIsScaled ? "scaled" : cell.source
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
      if (kwNum) kwNum.textContent = fmtShown(r.kW, 2);
    }
    const snowBox = $("autonomySnow");
    if (snowBox) {
      snowBox.hidden = !r.showVerticalRec;
      snowBox.classList.toggle("is-zero", r.showVerticalRec && r.kWhDec <= 0);
    }
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
    $("kpiReel").textContent = fmtShownMoney(r.reel);
    $("kpiEco").textContent = fmtShownMoney(r.eco);
    const note = $("kpiEcoNote");
    if (note) note.hidden = !r.ecoClamped;
    const yearsLabel = fmtYears(r.years);
    $("kpiYears").textContent = yearsLabel;
    if ($("kpiYearsPin")) $("kpiYearsPin").textContent = yearsLabel;
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
    if (reserveNum) reserveNum.textContent = fmtReserveKwh(r.reserveKwh);
    syncAutonomyColumn(autonomyHours());
    if ($("battPriceVal") && isFinite(r.battPrice)) {
      $("battPriceVal").textContent = fmtNum(r.battPrice, 0) + " $";
    }
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
    const flag = $("permaFlag");
    if (flag) flag.hidden = !r.shortfall;
    syncScenarioUrl();
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
    consoExtra: 0
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
    let consoJour = d.consoJour;
    if (q.has("consoJour")) {
      /* kWh/day, 0.1 steps, not the old notch index. */
      const v = snapStep(q.get("consoJour"), 0, DAILY_KWH_MAX, 0.1);
      if (isFinite(v)) consoJour = v;
    }
    let consoExtra = d.consoExtra;
    if (q.has("consoExtra")) consoExtra = clampExtraKwh(q.get("consoExtra"));
    let ville = d.ville;
    if (q.has("ville")) {
      const raw = String(q.get("ville") || "").trim().toLowerCase();
      if (/^[a-z0-9-]{1,80}$/.test(raw)) ville = raw;
    }
    return { area, unit, util, orient, tilt, deneige, priceW, taxes, subv, conso, rate, ville, consoJour, consoExtra };
  }

  const SCENARIO_KEYS = ["ville", "area", "unit", "util", "orient", "tilt", "deneige", "priceW", "taxes", "subv", "conso", "rate", "consoJour", "consoExtra"];

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
      priceW: readRange("priceW", 2.5, 4.5, 0.05, d.priceW),
      taxes: $("taxes") ? !!$("taxes").checked : d.taxes,
      subv: $("subv") ? !!$("subv").checked : d.subv,
      conso: isFinite(conso) ? conso : 0,
      rate: isFinite(rateSnapped) ? rateSnapped : d.rate,
      consoJour: snapStep(sliderTenths() / 10, 0, DAILY_KWH_MAX, 0.1),
      consoExtra: consoExtraKwh(),
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

  function printPdf() {
    closeInfo();
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

  /** Sticky clone of the payback years. The card in the form stays put. */
  function setYearsPinned(on) {
    const bar = $("yearsPinBar");
    const pinned = !!on;
    if (bar) bar.hidden = !pinned;
    if (document.body) document.body.classList.toggle("is-years-pinned", pinned);
    const label = pinned ? "Désépingler la rentabilité" : "Épingler la rentabilité";
    [$("btnPinYears"), $("btnUnpinYears")].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute("aria-pressed", pinned ? "true" : "false");
      btn.setAttribute("aria-label", label);
    });
  }

  function wireUi() {
    ["tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate", "consoJour", "autoStop", "battPrice"].forEach((id) => {
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
    const wantAutonomy = $("wantAutonomy");
    if (wantAutonomy) {
      wantAutonomy.checked = document.documentElement.getAttribute("data-want-autonomy") === "on";
      wantAutonomy.addEventListener("change", function () {
        setWantAutonomy(!!wantAutonomy.checked);
      });
    }
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
        showNotes.setAttribute("aria-expanded", showNotes.checked ? "true" : "false");
      };
      applyNotes();
      showNotes.addEventListener("change", function () {
        prefSet("solar-notes", showNotes.checked ? "1" : "0");
        applyNotes();
      });
    }
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
        openFieldInfo(btn.getAttribute("data-info"));
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

    wireTownPicker();

    let initialSearch = "";
    try { initialSearch = location.search || ""; } catch (_) { initialSearch = ""; }
    scenarioSnapshot = searchHasScenario(initialSearch);
    applyScenario(parseScenarioSearch(initialSearch));
    if ($("autoStop")) {
      $("autoStop").min = "0";
      $("autoStop").max = String(RESERVE_STOPS.length - 1);
      $("autoStop").step = "1";
      $("autoStop").value = String(RESERVE_DEFAULT_INDEX);
    }
    if ($("battPrice")) $("battPrice").value = String(BATT_PRICE_DEFAULT);
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
    return fmtGroupedInt(Math.round(Number(n))).replace(/ /g, "\u00A0") + " kWh/kWc";
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

  /**
   * Dropdown kWh/kWc: measured south 45° (tilt 45, azimuth 180) when that grid is loaded.
   * Towns without a full grid use Québec’s south-45° cell scaled by their sud 30° ratio.
   * NaN until the needed grid is available — the list is refreshed once it loads.
   */
  function menuYieldAnnual(town) {
    if (!town) return NaN;
    if (town.grid === "full") {
      const cells = usesQuebecGrid(town) ? baseCells : fullGridCells[town.id];
      const measured = southAnnual(cells, "45", "180");
      if (isFinite(measured)) return measured;
      if (!usesQuebecGrid(town) && !fullGridMiss[town.id]) return NaN;
    }
    return scaledSouth45(town);
  }

  function menuYieldText(town) {
    const n = menuYieldAnnual(town);
    if (!isFinite(n)) return "";
    return fmtYield(n);
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
    const name = document.createElement("span");
    name.className = "town-name";
    name.textContent = town.name;
    const yieldEl = document.createElement("span");
    yieldEl.className = "town-yield";
    yieldEl.textContent = menuYieldText(town) || "—";
    li.appendChild(name);
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
    refreshTownYields();
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
      towns.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), "fr-CA", { sensitivity: "base" });
      });
      townCatalog = towns;
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
