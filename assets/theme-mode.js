/* Theme preference — Solution Era calculateur solaire
 * 3 positions: light | sys | dark (default sys).
 * Sets data-theme-pref + resolved data-theme before first paint.
 */
(function (root) {
  "use strict";

  var PREF_LIGHT = "light";
  var PREF_SYS = "sys";
  var PREF_DARK = "dark";
  var PREFS = [PREF_LIGHT, PREF_SYS, PREF_DARK];
  var STORAGE_KEY = "era-theme-pref";
  var THEME_COLOR_LIGHT = "#1b4332";
  var THEME_COLOR_DARK = "#101814";

  var currentPref = PREF_SYS;
  var currentResolved = PREF_LIGHT;

  function normalizePref(raw) {
    var p = String(raw || "").trim().toLowerCase();
    if (p === PREF_LIGHT || p === PREF_DARK || p === PREF_SYS) return p;
    return PREF_SYS;
  }

  function systemPrefersDark() {
    try {
      return !!(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (err) {
      return false;
    }
  }

  function resolveTheme(pref) {
    var p = normalizePref(pref);
    if (p === PREF_SYS) return systemPrefersDark() ? PREF_DARK : PREF_LIGHT;
    return p;
  }

  function readStoredPref() {
    try {
      if (root.localStorage) return normalizePref(root.localStorage.getItem(STORAGE_KEY));
    } catch (err) { /* private mode / blocked storage */ }
    return PREF_SYS;
  }

  function writeStoredPref(pref) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, pref);
    } catch (err) { /* ignore quota / blocked storage */ }
  }

  function updateThemeColor(resolved) {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.querySelector) return;
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", resolved === PREF_DARK ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }

  function syncToggleUi() {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.querySelectorAll) return;
    var buttons = doc.querySelectorAll("[data-theme-pref-btn]");
    var i;
    var btn;
    var pref;
    var on;
    for (i = 0; i < buttons.length; i++) {
      btn = buttons[i];
      pref = btn.getAttribute("data-theme-pref-btn");
      on = pref === currentPref;
      if (btn.classList && btn.classList.toggle) {
        btn.classList.toggle("active", on);
      }
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    }
  }

  function focusActive() {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.querySelector) return;
    var active = doc.querySelector('[data-theme-pref-btn][aria-checked="true"]');
    if (active && active.focus) active.focus();
  }

  function applyTheme(pref, persist) {
    var p = normalizePref(pref);
    var resolved = resolveTheme(p);
    currentPref = p;
    currentResolved = resolved;
    var doc = typeof document !== "undefined" ? document : null;
    if (doc && doc.documentElement) {
      doc.documentElement.setAttribute("data-theme-pref", p);
      doc.documentElement.setAttribute("data-theme", resolved);
    }
    updateThemeColor(resolved);
    if (persist) writeStoredPref(p);
    syncToggleUi();
    return resolved;
  }

  function initTheme() {
    return applyTheme(readStoredPref(), false);
  }

  function onSystemChange() {
    if (currentPref === PREF_SYS) applyTheme(PREF_SYS, false);
  }

  function bindSystemListener() {
    if (!root.matchMedia) return;
    try {
      var mq = root.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
      else if (mq.addListener) mq.addListener(onSystemChange);
    } catch (err) { /* ignore */ }
  }

  function cyclePref(delta) {
    var i = PREFS.indexOf(currentPref);
    if (i < 0) i = 1;
    var next = PREFS[(i + delta + PREFS.length) % PREFS.length];
    applyTheme(next, true);
    focusActive();
  }

  function prefFromClientX(rootEl, clientX) {
    var rect = rootEl.getBoundingClientRect();
    var w = rect.width || 1;
    var t = (clientX - rect.left) / w;
    if (t < 1 / 3) return PREF_LIGHT;
    if (t < 2 / 3) return PREF_SYS;
    return PREF_DARK;
  }

  function closestPrefBtn(node) {
    if (!node) return null;
    if (node.getAttribute && node.getAttribute("data-theme-pref-btn")) return node;
    if (node.closest) return node.closest("[data-theme-pref-btn]");
    return null;
  }

  /** Prefer composedPath: setPointerCapture retargets click onto the capture root. */
  function prefButtonFromEvent(e, rootEl) {
    var path = e && e.composedPath && e.composedPath();
    var i;
    var node;
    if (path && path.length) {
      for (i = 0; i < path.length; i++) {
        node = closestPrefBtn(path[i]);
        if (node) return node;
      }
    }
    node = closestPrefBtn(e && e.target);
    if (node) return node;
    if (rootEl && typeof document !== "undefined" && document.elementFromPoint && e && isFinite(e.clientX) && isFinite(e.clientY)) {
      return closestPrefBtn(document.elementFromPoint(e.clientX, e.clientY));
    }
    return null;
  }

  function wireSwipe(rootEl) {
    var tracking = false;
    var moved = false;
    var startX = 0;
    var pointerId = null;
    var startBtn = null;
    var capturing = false;
    var SWIPE_PX = 12;

    function captureIfNeeded(el, id) {
      if (capturing || !el || !el.setPointerCapture) return;
      try {
        el.setPointerCapture(id);
        capturing = true;
      } catch (err) { /* ignore */ }
    }

    function onMove(clientX, captureEl, captureId) {
      if (!tracking) return;
      if (!moved && Math.abs(clientX - startX) >= SWIPE_PX) {
        moved = true;
        if (captureEl && captureId != null) captureIfNeeded(captureEl, captureId);
      }
      if (moved) applyTheme(prefFromClientX(rootEl, clientX), false);
    }

    function onEnd(clientX) {
      if (!tracking) return;
      tracking = false;
      capturing = false;
      if (moved) {
        applyTheme(prefFromClientX(rootEl, clientX), true);
        rootEl.setAttribute("data-swiped", "1");
      } else {
        rootEl.removeAttribute("data-swiped");
        if (startBtn) applyTheme(startBtn.getAttribute("data-theme-pref-btn"), true);
      }
      startBtn = null;
    }

    if (root.addEventListener && root.PointerEvent) {
      rootEl.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        tracking = true;
        moved = false;
        capturing = false;
        startX = e.clientX;
        pointerId = e.pointerId;
        startBtn = prefButtonFromEvent(e, rootEl);
        /* Capture only after a real swipe — early capture steals the click. */
      });
      rootEl.addEventListener("pointermove", function (e) {
        if (!tracking || (pointerId != null && e.pointerId !== pointerId)) return;
        onMove(e.clientX, rootEl, e.pointerId);
      });
      rootEl.addEventListener("pointerup", function (e) {
        if (pointerId != null && e.pointerId !== pointerId) return;
        onEnd(e.clientX);
        pointerId = null;
      });
      rootEl.addEventListener("pointercancel", function () {
        tracking = false;
        moved = false;
        capturing = false;
        pointerId = null;
        startBtn = null;
        rootEl.removeAttribute("data-swiped");
      });
    } else {
      rootEl.addEventListener("touchstart", function (e) {
        if (!e.touches || !e.touches[0]) return;
        tracking = true;
        moved = false;
        startX = e.touches[0].clientX;
        startBtn = prefButtonFromEvent(e, rootEl) || closestPrefBtn(e.target);
      }, { passive: true });
      rootEl.addEventListener("touchmove", function (e) {
        if (!tracking || !e.touches || !e.touches[0]) return;
        onMove(e.touches[0].clientX);
        if (moved && e.cancelable) e.preventDefault();
      }, { passive: false });
      rootEl.addEventListener("touchend", function (e) {
        var t = e.changedTouches && e.changedTouches[0];
        onEnd(t ? t.clientX : startX);
      });
    }
  }

  function wireToggle() {
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || !doc.getElementById) return;
    var rootEl = doc.getElementById("themeToggle");
    if (!rootEl || rootEl.getAttribute("data-wired") === "1") return;
    rootEl.setAttribute("data-wired", "1");
    rootEl.addEventListener("click", function (e) {
      if (rootEl.getAttribute("data-swiped") === "1") {
        rootEl.removeAttribute("data-swiped");
        e.preventDefault();
        return;
      }
      var btn = prefButtonFromEvent(e, rootEl);
      if (!btn) return;
      applyTheme(btn.getAttribute("data-theme-pref-btn"), true);
    });
    rootEl.addEventListener("keydown", function (e) {
      var key = e.key;
      if (key === "ArrowRight" || key === "ArrowDown") {
        e.preventDefault();
        cyclePref(1);
      } else if (key === "ArrowLeft" || key === "ArrowUp") {
        e.preventDefault();
        cyclePref(-1);
      } else if (key === "Home") {
        e.preventDefault();
        applyTheme(PREF_LIGHT, true);
        focusActive();
      } else if (key === "End") {
        e.preventDefault();
        applyTheme(PREF_DARK, true);
        focusActive();
      }
    });
    wireSwipe(rootEl);
    syncToggleUi();
  }

  currentResolved = initTheme();
  bindSystemListener();

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireToggle);
    } else {
      wireToggle();
    }
  }

  root.SolarThemeMode = {
    PREF_LIGHT: PREF_LIGHT,
    PREF_SYS: PREF_SYS,
    PREF_DARK: PREF_DARK,
    STORAGE_KEY: STORAGE_KEY,
    THEME_COLOR_LIGHT: THEME_COLOR_LIGHT,
    THEME_COLOR_DARK: THEME_COLOR_DARK,
    parseThemePref: normalizePref,
    resolveTheme: resolveTheme,
    prefButtonFromEvent: prefButtonFromEvent,
    applyTheme: applyTheme,
    initTheme: initTheme,
    get currentPref() {
      return currentPref;
    },
    get current() {
      return currentResolved;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
