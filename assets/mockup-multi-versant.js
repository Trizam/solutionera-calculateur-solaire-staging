/* Maquette multi-versant (issue #146). Même modèle que assets/app.js, une rangée par versant. */
(function () {
  "use strict";

  const FALLBACK_S30 = { ac_annual: 1254.8064, ac_dec: 53.274 };
  const DAYS_IN_DEC = 31;
  const PANEL_KW_PER_M2 = 0.20;
  const PANEL_M2 = 2;
  const SQFT_PER_M2 = 10.76391041671;
  const MAX_PANS = 4;

  const AZ_LABELS = {
    "0": "0° (Nord)", "15": "15°", "30": "30°", "45": "45° (Nord-Est)", "60": "60°", "75": "75°",
    "90": "90° (Est)", "105": "105°", "120": "120°", "135": "135° (Sud-Est)", "150": "150°", "165": "165°",
    "180": "180° (Sud)", "195": "195°", "210": "210°", "225": "225° (Sud-Ouest)", "240": "240°", "255": "255°",
    "270": "270° (Ouest)", "285": "285°", "300": "300°", "315": "315° (Nord-Ouest)", "330": "330°", "345": "345°"
  };
  const TILTS = [0, 15, 30, 45, 60, 75, 90];
  const SNOW_STOPS = [
    { value: 100, label: "toujours" },
    { value: 75, label: "75 %" },
    { value: 50, label: "50 %" },
    { value: 25, label: "25 %" },
    { value: 0, label: "jamais" }
  ];

  /** Deux versants d’un toit à pignon : le meilleur au sud, l’autre à l’est. */
  const DEFAULT_PANS = [
    { m2: 40, az: 180, tilt: 45, snow: 100 },
    { m2: 20, az: 90, tilt: 45, snow: 100 }
  ];

  const $ = (id) => document.getElementById(id);

  let gridCells = null;
  let areaUnit = "m2";
  let pans = DEFAULT_PANS.map((p) => Object.assign({}, p));

  /**
   * Format d’URL proposé pour le partage : `pans=m2:az:tilt:snow;…` (m² entiers, jusqu’à MAX_PANS).
   * Exemple : ?pans=40:180:45:100;20:90:45:50&unit=sqft
   */
  function readUrlState() {
    const q = new URLSearchParams(location.search);
    if (q.get("theme") === "dark" || q.get("theme") === "light") {
      document.documentElement.setAttribute("data-theme-pref", q.get("theme"));
      document.documentElement.setAttribute("data-theme", q.get("theme"));
    }
    if (q.get("unit") === "sqft") areaUnit = "sqft";
    const raw = q.get("pans");
    if (!raw) return;
    const parsed = raw.split(";").map((chunk) => {
      const [m2, az, tilt, snow] = chunk.split(":").map(Number);
      if (![m2, az, tilt, snow].every(isFinite)) return null;
      return { m2: Math.max(0, m2), az: ((az % 360) + 360) % 360, tilt: Math.min(90, Math.max(0, tilt)), snow: Math.min(100, Math.max(0, snow)) };
    }).filter(Boolean).slice(0, MAX_PANS);
    if (parsed.length) pans = parsed;
  }

  function fmtNum(n, d) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
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
    const abs = Math.abs(rounded);
    const whole = Math.abs(rounded - Math.round(rounded)) <= 1e-9 * Math.max(1, abs);
    const exp = abs === 0 ? 0 : Math.floor(Math.log10(abs));
    const decimals = whole ? 0 : Math.max(0, 1 - exp);
    return rounded.toLocaleString("fr-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function winterWFromTilt(tilt) {
    const t = Number(tilt);
    if (!isFinite(t)) return 0.18;
    if (t <= 45) return 0.18;
    if (t >= 90) return 0;
    return Math.round(18 * (90 - t) / 45) / 100;
  }
  function snowCoverFromTilt(tilt) {
    const W = winterWFromTilt(tilt);
    return W <= 0 ? 0 : W / 0.18;
  }
  function applyDeneigement(kWh, d, W) {
    return kWh * (1 - (1 - d) * W);
  }
  function lookupCell(tilt, az) {
    const t = String(tilt);
    const a = String(az);
    if (gridCells && gridCells[t] && gridCells[t][a]) {
      const c = gridCells[t][a];
      const dec = c.ac_dec != null ? c.ac_dec : (c.ac_monthly && c.ac_monthly.dec);
      return { ac_annual: c.ac_annual, ac_dec: isFinite(Number(dec)) ? Number(dec) : FALLBACK_S30.ac_dec };
    }
    return { ac_annual: FALLBACK_S30.ac_annual, ac_dec: FALLBACK_S30.ac_dec };
  }

  /** Un versant → panneaux, kWc, efficacité, kWh/an, kWh déc. */
  function calcPan(p, util) {
    const usedM2 = Math.max(0, p.m2) * util;
    const kW = usedM2 * PANEL_KW_PER_M2;
    const nPv = usedM2 > 0 ? Math.round(usedM2 / PANEL_M2) : 0;
    const cell = lookupCell(p.tilt, p.az);
    const d = p.snow / 100;
    const eff = applyDeneigement(cell.ac_annual, d, winterWFromTilt(p.tilt));
    const kWh = eff * kW;
    const kWhDec = applyDeneigement(cell.ac_dec * kW, d, snowCoverFromTilt(p.tilt));
    const verticalRec = d < 1 && p.tilt < 90;
    return { nPv, kW, eff, kWh, kWhDec, verticalRec };
  }

  function calcAll() {
    const util = parseFloat($("util").value) / 100;
    const rows = pans.map((p) => calcPan(p, util));
    const tot = rows.reduce((a, r) => ({
      nPv: a.nPv + r.nPv,
      kW: a.kW + r.kW,
      kWh: a.kWh + r.kWh,
      kWhDec: a.kWhDec + r.kWhDec,
      verticalRec: a.verticalRec || r.verticalRec
    }), { nPv: 0, kW: 0, kWh: 0, kWhDec: 0, verticalRec: false });
    tot.eff = tot.kW > 0 ? tot.kWh / tot.kW : NaN;
    tot.kWhDay = tot.kWhDec / DAYS_IN_DEC;
    return { rows, tot };
  }

  function fillSelect(sel, options, value) {
    sel.innerHTML = options.map((o) => '<option value="' + o.value + '"' + (String(o.value) === String(value) ? " selected" : "") + ">" + o.label + "</option>").join("");
  }

  function areaShown(m2) {
    const v = areaUnit === "sqft" ? m2 * SQFT_PER_M2 : m2;
    return String(Math.round(v));
  }

  function renderRows() {
    const body = $("pansBody");
    const tpl = $("tpl-pan-row");
    body.innerHTML = "";
    pans.forEach((p, i) => {
      const frag = tpl.content.cloneNode(true);
      const area = frag.querySelector(".pan-area");
      area.value = areaShown(p.m2);
      frag.querySelector("[data-unit]").textContent = areaUnit === "sqft" ? "pi²" : "m²";
      fillSelect(frag.querySelector(".pan-az"), Object.keys(AZ_LABELS).map((k) => ({ value: k, label: AZ_LABELS[k] })), p.az);
      fillSelect(frag.querySelector(".pan-tilt"), TILTS.map((t) => ({ value: t, label: t + "°" })), p.tilt);
      fillSelect(frag.querySelector(".pan-snow"), SNOW_STOPS, p.snow);
      frag.querySelector("[data-name]").textContent = "Versant " + (i + 1);
      const rm = frag.querySelector(".pans-remove");
      rm.disabled = pans.length <= 1;
      area.addEventListener("input", () => {
        const raw = parseFloat(area.value);
        const shown = isFinite(raw) && raw > 0 ? raw : 0;
        p.m2 = areaUnit === "sqft" ? shown / SQFT_PER_M2 : shown;
        render();
      });
      frag.querySelector(".pan-az").addEventListener("change", (e) => { p.az = Number(e.target.value); render(); });
      frag.querySelector(".pan-tilt").addEventListener("change", (e) => { p.tilt = Number(e.target.value); render(); });
      frag.querySelector(".pan-snow").addEventListener("change", (e) => { p.snow = Number(e.target.value); render(); });
      rm.addEventListener("click", () => { pans.splice(i, 1); renderRows(); render(); });
      body.appendChild(frag);
    });
    $("pansAdd").disabled = pans.length >= MAX_PANS;
    $("pansAdd").textContent = pans.length >= MAX_PANS ? "Maximum " + MAX_PANS + " versants" : "+ Ajouter un versant";
  }

  function setNum(id, text) {
    const el = $(id);
    if (!el) return;
    const num = el.querySelector(".prod-num");
    (num || el).textContent = text;
  }

  function render() {
    const { rows, tot } = calcAll();
    $("utilVal").textContent = $("util").value + " %";
    const subs = document.querySelectorAll("#pansBody .pans-sub");
    rows.forEach((r, i) => {
      const sub = subs[i];
      if (!sub) return;
      sub.querySelector("[data-pv]").textContent = r.nPv > 0 ? String(r.nPv) : "—";
      sub.querySelector("[data-kw]").textContent = r.kW > 0 ? fmtNum(r.kW, 1) : "—";
      sub.querySelector("[data-eff]").textContent = fmtNum(Math.round(r.eff), 0);
    });
    $("totPv").textContent = tot.nPv > 0 ? String(tot.nPv) : "—";
    $("totKw").textContent = tot.kW > 0 ? fmtNum(tot.kW, 1) : "—";
    $("totEff").textContent = isFinite(tot.eff) ? fmtNum(Math.round(tot.eff), 0) : "—";
    setNum("outPv", tot.nPv > 0 ? String(tot.nPv) : "—");
    setNum("outKw", tot.kW > 0 ? fmtNum(tot.kW, 1) : "—");
    setNum("outKwh", tot.kWh > 0 ? fmtSig2(tot.kWh) : "—");
    setNum("outKwhDay", tot.kW > 0 ? fmtSig2(tot.kWhDay) : "—");
    $("autonomySnow").hidden = !tot.verticalRec;
  }

  function setUnit(unit) {
    areaUnit = unit;
    $("unitM2").classList.toggle("active", unit === "m2");
    $("unitM2").setAttribute("aria-pressed", String(unit === "m2"));
    $("unitSqft").classList.toggle("active", unit === "sqft");
    $("unitSqft").setAttribute("aria-pressed", String(unit === "sqft"));
    renderRows();
    render();
  }

  function loadGrid() {
    const status = $("gridStatus");
    fetch("assets/quebec-full-grid.json", { cache: "force-cache" })
      .then((r) => r.json())
      .then((g) => {
        gridCells = g.cells;
        status.hidden = true;
        render();
      })
      .catch(() => {
        status.classList.remove("is-loading");
        status.classList.add("is-error");
        status.textContent = "Grille indisponible — valeurs de secours (sud 30°).";
        render();
      });
  }

  $("unitM2").addEventListener("click", () => setUnit("m2"));
  $("unitSqft").addEventListener("click", () => setUnit("sqft"));
  $("util").addEventListener("input", render);
  $("pansAdd").addEventListener("click", () => {
    if (pans.length >= MAX_PANS) return;
    pans.push({ m2: 20, az: 270, tilt: 45, snow: 100 });
    renderRows();
    render();
  });
  $("multi").addEventListener("change", (e) => {
    document.documentElement.setAttribute("data-multi", e.target.checked ? "on" : "off");
  });

  readUrlState();
  setUnit(areaUnit);
  loadGrid();
})();
