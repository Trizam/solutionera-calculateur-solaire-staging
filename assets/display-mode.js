/* URL display modes — Solution Era calculateur solaire
 * Bare URL / ?mode=full / unknown → full (all sections).
 * ?mode=webi (alias ?mode=webinar) → block 1 only (toit → kWh/an).
 */
(function (root) {
  "use strict";

  var MODE_FULL = "full";
  var MODE_WEBI = "webi";

  function isWebiToken(raw) {
    var m = String(raw || "").trim().toLowerCase();
    return m === MODE_WEBI || m === "webinar";
  }

  var current = MODE_FULL;

  function parseDisplayMode(search) {
    var q = search == null ? "" : String(search);
    var params = new URLSearchParams(q);
    return isWebiToken(params.get("mode")) ? MODE_WEBI : MODE_FULL;
  }

  function applyDisplayMode(mode) {
    var resolved = isWebiToken(mode) ? MODE_WEBI : MODE_FULL;
    current = resolved;
    var doc = typeof document !== "undefined" ? document : null;
    if (doc && doc.documentElement) {
      doc.documentElement.setAttribute("data-mode", resolved);
    }
    if (doc && doc.body) {
      doc.body.setAttribute("data-mode", resolved);
    }
    return resolved;
  }

  function initDisplayMode(search) {
    var loc = typeof location !== "undefined" ? location : null;
    var q = search != null ? search : loc ? loc.search : "";
    return applyDisplayMode(parseDisplayMode(q));
  }

  current = initDisplayMode();

  if (typeof document !== "undefined" && !document.body) {
    document.addEventListener("DOMContentLoaded", function () {
      applyDisplayMode(current);
    });
  }

  root.SolarDisplayMode = {
    MODE_FULL: MODE_FULL,
    MODE_WEBI: MODE_WEBI,
    MODE_WEBINAR: MODE_WEBI,
    parseDisplayMode: parseDisplayMode,
    applyDisplayMode: applyDisplayMode,
    initDisplayMode: initDisplayMode,
    get current() {
      return current;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
