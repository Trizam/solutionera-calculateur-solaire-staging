/* Calculateur Solaire version 0.2 — Solution Era — Québec full grid + W-by-tilt */
(function () {
  "use strict";

  // Tiny S/30 fallback if fetch fails (file:// or offline without cache)
  // Used for ANY missing cell so calc never stays blank forever
  const FALLBACK_S30 = { ac_annual: 1254.8064, W_winter: 0.173323 };
  const DEFAULT_DENEIGEMENT = 0.20;

  const PANEL_KW_PER_M2 = 0.20;
  const TAX_MULT = 1.14975; // TPS 5% + TVQ 9.975% (display shows ~15 %)
  const RATE_D_T2_HT = 0.11142; // Tarif D 2e tranche HT, 1 avr 2026 (11,142 ¢/kWh)
  // 0.11142 × 1.14975 = 0.128105115 → pedagogic default rounded to 5 decimals
  const DEFAULT_RATE = 0.12811; // Tarif D 2e tranche TTC, 1 avr 2026
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

  /** Magnitude-round to 2 significant figures (display only). 14230 → 14000, 874 → 870, 12.53 → 13. */
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

  /** Annual household consumption (kWh). Empty / invalid → no cap. */
  function consoAnnuelleKwh() {
    const el = $("conso");
    if (!el) return null;
    const raw = String(el.value).trim().replace(",", ".");
    if (raw === "" || raw === "-" || raw === ".") return null;
    const v = parseFloat(raw);
    if (!isFinite(v) || v <= 0) return null;
    return v;
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
    const conso = consoAnnuelleKwh();
    const kWhCredites = creditKwh(kWh, conso);
    const ecoClamped = conso != null && kWh > conso;
    const eco = kWhCredites * rateOk;
    const years = eco > 0 ? reel / eco : Infinity;

    const kWhDay = isFinite(kWh) ? kWh / 365 : NaN;
    return {
      m2, util, deneige, tilt, az, priceW, taxesOn, subvOn, rateOk,
      kW, table, kWhAnnuel, kWh, kWhDay, W,
      conso, kWhCredites, ecoClamped,
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
      $("deneigeLive").innerHTML = "−" + fmtSig2(lossPct) + "&nbsp;%";
    }
    updateTiltViz(r.tilt);
    if ($("tiltWLabel")) {
      $("tiltWLabel").innerHTML = fmtSig2(r.W * 100) + "&nbsp;%";
    }
    updateGridStatusUi();

    if ($("outKwhDay")) {
      const dayNum = $("outKwhDay").querySelector(".prod-num");
      if (dayNum) dayNum.textContent = fmtSig2(r.kWhDay);
    }
    if ($("outKwh")) {
      const yearNum = $("outKwh").querySelector(".prod-num");
      if (yearNum) yearNum.textContent = fmtSig2(r.kWh);
    }
    $("outKw").textContent = fmtSig2(r.kW) + " kWc";
    $("outLight").textContent =
      fmtNum(r.kW * 1000, 0) + " W × " + fmtNum(r.priceW, 2) + " $/W = " + fmtMoney(r.HT) + " (HT)";

    $("lineHT").textContent = fmtMoney(r.HT);
    $("lineTaxes").textContent = r.taxesOn ? fmtMoney(r.taxes) : "—";
    $("lineSubv").textContent = r.subvOn ? ("− " + fmtMoney(r.subv)) : "—";
    $("lineTotal").textContent = fmtMoney(r.reel);

    $("outEcoYear").textContent = "≈ " + fmtMoney(r.eco) + " / an";
    if ($("outEcoFormula")) {
      $("outEcoFormula").textContent = r.ecoClamped
        ? "Crédit (plafonné à la conso) × tarif"
        : "Production × tarif";
    }
    $("kpiReel").textContent = fmtMoney(r.reel);
    $("kpiEco").textContent = fmtMoney(r.eco);
    const note = $("kpiEcoNote");
    if (note) note.hidden = !r.ecoClamped;
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
    $("unitM2").setAttribute("aria-pressed", u === "m2" ? "true" : "false");
    $("unitSqft").setAttribute("aria-pressed", u === "sqft" ? "true" : "false");
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
    else if (activeModalId === "bugModal") fallback = $("bugLink2");
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
    ["tilt", "orient", "util", "deneige", "priceW", "taxes", "subv", "rate", "conso"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    ["util", "deneige", "priceW"].forEach((id) => {
      const el = $(id);
      if (el) wireRangePointerDrag(el);
    });
    document.querySelectorAll(".slider-row").forEach(function (row) {
      wireSliderRowDrag(row);
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

    $("priceW").value = 3;
    $("util").value = 80;
    if ($("deneige")) $("deneige").value = Math.round(DEFAULT_DENEIGEMENT * 100);
    $("tilt").value = "30";
    $("orient").value = "180";
    $("rate").value = String(DEFAULT_RATE);
    $("taxes").checked = true;
    $("subv").checked = true; // LogisVert on by default (v0.2)
    $("area").value = 40;
    if ($("conso")) $("conso").value = String(DEFAULT_CONSO_KWH);
    if ($("unitM2")) $("unitM2").setAttribute("aria-pressed", "true");
    if ($("unitSqft")) $("unitSqft").setAttribute("aria-pressed", "false");
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
    lookupCell,
    winterWFromTilt,
    sig2Round,
    fmtSig2,
    validateBugReport,
    bugReportEndpoint,
    parseDisplayMode: displayModeApi && displayModeApi.parseDisplayMode,
    applyDisplayMode: displayModeApi && displayModeApi.applyDisplayMode,
    get displayMode() {
      return displayModeApi ? displayModeApi.current : "full";
    },
    AZ_LABELS,
    roundAreaInput,
    constants: {
      PANEL_KW_PER_M2,
      TAX_MULT,
      RATE_D_T2_HT,
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
