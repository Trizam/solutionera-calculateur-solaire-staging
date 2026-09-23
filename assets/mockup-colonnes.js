/* Maquette — production (grille Québec) + jours de batterie.
   Jours = (capacité × réserve) ÷ (kWh décembre / 31). */
(function () {
  "use strict";

  var PANEL_M2 = 2;
  var PANEL_KW_PER_M2 = 0.2;
  var DAYS_IN_DEC = 31;
  var FALLBACK = { ac_annual: 1254.8064, ac_dec: 53.274 };

  var AZ_LABELS = {
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

  var gridCells = null;
  var gridSource = "secours";

  function $(id) {
    return document.getElementById(id);
  }

  function winterWFromTilt(tilt) {
    var t = Number(tilt);
    if (!isFinite(t)) return 0.18;
    if (t <= 45) return 0.18;
    if (t >= 90) return 0;
    return Math.round(18 * (90 - t) / 45) / 100;
  }

  function snowCoverFromTilt(tilt) {
    var w = winterWFromTilt(tilt);
    if (w <= 0) return 0;
    return w / 0.18;
  }

  function sig2Round(n) {
    var x = Number(n);
    if (!isFinite(x)) return NaN;
    if (x === 0) return 0;
    var sign = x < 0 ? -1 : 1;
    var abs = Math.abs(x);
    var exp = Math.floor(Math.log10(abs));
    var factor = Math.pow(10, exp - 1);
    return sign * Math.round(abs / factor) * factor;
  }

  function fmtSig2(n) {
    if (!isFinite(n)) return "—";
    var rounded = sig2Round(n);
    if (!isFinite(rounded)) return "—";
    var abs = Math.abs(rounded);
    var whole = Math.abs(rounded - Math.round(rounded)) <= 1e-9 * Math.max(1, abs);
    var exp = abs === 0 ? 0 : Math.floor(Math.log10(abs));
    var decimals = whole ? 0 : Math.max(0, 1 - exp);
    return rounded.toLocaleString("fr-CA", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtInt(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("fr-CA");
  }

  function fmtDays(n) {
    if (!isFinite(n)) return "—";
    if (n >= 10) return fmtSig2(n);
    return n.toLocaleString("fr-CA", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  function lookup(tilt, az) {
    var t = String(tilt);
    var a = String(az);
    if (gridCells && gridCells[t] && gridCells[t][a]) {
      var cell = gridCells[t][a];
      var dec = cell.ac_monthly && Number(cell.ac_monthly.dec);
      return {
        ac_annual: Number(cell.ac_annual),
        ac_dec: isFinite(dec) ? dec : FALLBACK.ac_dec
      };
    }
    return { ac_annual: FALLBACK.ac_annual, ac_dec: FALLBACK.ac_dec };
  }

  function num(id, fallback) {
    var el = $(id);
    var v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : fallback;
  }

  function render() {
    var area = Math.max(0, num("area", 0));
    var util = num("util", 80) / 100;
    var az = num("orient", 180);
    var tilt = num("tilt", 30);
    var deneige = Math.min(1, Math.max(0, num("deneige", 20) / 100));
    var battery = Math.max(0, num("battery", 0));
    var reserve = Math.min(1, Math.max(0, num("reserve", 80) / 100));

    var usedM2 = area * util;
    var kW = usedM2 * PANEL_KW_PER_M2;
    var nPv = usedM2 > 0 ? Math.round(usedM2 / PANEL_M2) : NaN;
    var cell = lookup(tilt, az);
    var w = winterWFromTilt(tilt);
    var cover = snowCoverFromTilt(tilt);
    var kWh = cell.ac_annual * kW * (1 - (1 - deneige) * w);
    var kWhDec = cell.ac_dec * kW * (1 - (1 - deneige) * cover);
    var kWhDay = kWhDec / DAYS_IN_DEC;
    var usable = battery * reserve;
    var days = kWhDay > 0.05 ? usable / kWhDay : NaN;
    var lossPct = Math.round((1 - deneige) * w * 100);

    $("utilVal").textContent = Math.round(util * 100) + " %";
    $("orientVal").textContent = AZ_LABELS[String(az)] || (az + "°");
    $("tiltVal").textContent = Math.round(tilt) + "°";
    $("deneigeVal").textContent = "−" + lossPct + " %";
    $("batteryVal").textContent = fmtInt(battery) + " kWh";
    $("reserveVal").textContent = Math.round(reserve * 100) + " %";

    $("outPv").textContent = fmtInt(nPv);
    $("outKw").textContent = fmtSig2(kW);
    $("outKwh").textContent = fmtSig2(kWh);
    $("outDay").textContent = fmtSig2(kWhDay);
    $("outUsable").textContent = fmtSig2(usable);
    $("outDays").textContent = fmtDays(days);

    var dayLabel = fmtSig2(kWhDay);
    var usableLabel = fmtSig2(usable);
    if (kWhDay <= 0.05) {
      $("formula").textContent = "Décembre est à zéro : la batterie ne se recharge pas au soleil.";
    } else {
      $("formula").textContent = usableLabel + " kWh utiles ÷ " + dayLabel + " kWh/j";
    }

    var fill = !isFinite(days) ? 0 : Math.max(0, Math.min(1, days / 7));
    $("batteryFill").style.width = (fill * 100) + "%";
    $("batteryCaption").textContent = isFinite(days)
      ? (days >= 7 ? "7 jours et plus, jauge pleine" : "Jauge sur 7 jours sans soleil")
      : "Jauge vide — décembre à zéro";

    var showSnow = deneige < 1 && tilt < 90;
    $("snowNote").hidden = !showSnow;

    $("gridStatus").textContent = gridSource === "grid"
      ? "Irradiation : ville de Québec, même grille que le calculateur."
      : "Irradiation de secours (sud, 30°) — la grille n’a pas chargé.";
  }

  function bind() {
    var ids = ["area", "util", "orient", "tilt", "deneige", "battery", "reserve"];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (!el) continue;
      el.addEventListener("input", render);
    }
  }

  bind();
  render();

  fetch("assets/quebec-full-grid.json")
    .then(function (res) {
      if (!res.ok) throw new Error("grid");
      return res.json();
    })
    .then(function (data) {
      gridCells = data && data.cells ? data.cells : null;
      gridSource = gridCells ? "grid" : "secours";
      render();
    })
    .catch(function () {
      gridSource = "secours";
      render();
    });
})();
