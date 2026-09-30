/* Narrow full mode: two columns, peek, flick snaps, slow drag stays. docs/DESIGN.md */
(function (factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  var root = typeof window !== "undefined" ? window : null;
  if (root && root.document) api.mount(root);
})(function () {
  var FLICK_V = 0.45;
  var FLICK_DX = 36;
  var LOCK_PX = 8;
  var TAP_PX = 8;
  var EDGE_PX = 12;
  var RESIST = 0.35;

  function paneGeometry(viewportW, paneW, gap) {
    return {
      sliver: viewportW - paneW - gap,
      green: 0,
      blue: viewportW - 2 * paneW - gap
    };
  }

  function resistX(x, min, max, factor) {
    var k = factor == null ? RESIST : factor;
    if (x > max) return max + (x - max) * k;
    if (x < min) return min + (x - min) * k;
    return x;
  }

  function releaseTarget(x, velocity, dx, min, max, flickV, flickDx) {
    var vCut = flickV == null ? FLICK_V : flickV;
    var dCut = flickDx == null ? FLICK_DX : flickDx;
    var sameDir = velocity !== 0 && dx !== 0 && (velocity > 0) === (dx > 0);
    if (sameDir && Math.abs(velocity) >= vCut && Math.abs(dx) >= dCut) {
      return velocity < 0 ? min : max;
    }
    if (x > max) return max;
    if (x < min) return min;
    return x;
  }

  function mount(win) {
    var doc = win.document;
    var viewport = doc.getElementById("boardViewport");
    var board = doc.getElementById("board");
    if (!viewport || !board) return;

    var mq = win.matchMedia("(max-width: 1099px)");
    var reduce = win.matchMedia("(prefers-reduced-motion: reduce)");
    var pointer = null;
    var samples = [];
    var fraction = 0;
    var dragging = false;
    var suppressClick = false;

    function active() {
      return doc.documentElement.getAttribute("data-mode") !== "webi" && mq.matches;
    }

    function readGap() {
      var cs = win.getComputedStyle(board);
      var g = parseFloat(cs.columnGap);
      if (!isFinite(g)) g = parseFloat(cs.gap);
      if (isFinite(g) && g >= 0) return g;
      var solar = board.querySelector(".col-solar");
      var auto = board.querySelector(".col-auto");
      if (!solar || !auto) return 0;
      return Math.max(0, auto.offsetLeft - solar.offsetLeft - solar.offsetWidth);
    }

    function metrics() {
      var solar = board.querySelector(".col-solar");
      if (!solar) return null;
      var w = viewport.clientWidth;
      var pane = solar.offsetWidth;
      var gap = readGap();
      if (w < 40 || pane < 40) return null;
      var geo = paneGeometry(w, pane, gap);
      if (geo.blue >= -1) return null;
      return {
        viewport: viewport,
        board: board,
        w: w,
        pane: pane,
        gap: gap,
        sliver: geo.sliver,
        green: geo.green,
        blue: geo.blue
      };
    }

    function visualX() {
      var t = win.getComputedStyle(board).transform;
      if (!t || t === "none") return 0;
      try {
        return new win.DOMMatrix(t).m41;
      } catch (err) {
        return 0;
      }
    }

    function mark(x, m) {
      var t = x / m.blue;
      var name = t < 0.08 ? "solar" : t > 0.92 ? "auto" : "between";
      viewport.setAttribute("data-board-pane", name);
    }

    function paint(x, animate) {
      var motion = !!(animate && !reduce.matches);
      if (motion) void board.offsetWidth;
      board.style.transition = motion
        ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      board.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
      viewport.classList.toggle("is-animating", motion);
      // The floating « Retour » follows the green column (docs/DESIGN.md).
      if (typeof win.CustomEvent === "function") {
        viewport.dispatchEvent(new win.CustomEvent("board-pane-move", { detail: { x: x, animate: motion } }));
      }
    }

    function clearMotion() {
      fraction = 0;
      dragging = false;
      pointer = null;
      viewport.classList.remove("is-dragging", "is-animating");
      viewport.removeAttribute("data-board-pane");
      board.style.transition = "";
      board.style.transform = "";
    }

    function clamp01(n) {
      if (n < 0) return 0;
      if (n > 1) return 1;
      return n;
    }

    function goFraction(next, animate) {
      var m = metrics();
      fraction = clamp01(next);
      if (!m) return;
      var x = m.blue * fraction;
      paint(x, animate);
      mark(x, m);
    }

    function onLayout() {
      if (dragging) return;
      if (!active()) {
        clearMotion();
        return;
      }
      var m = metrics();
      if (!m) return;
      var x = m.blue * clamp01(fraction);
      paint(x, false);
      mark(x, m);
    }

    function blocked(node) {
      if (!node || !node.closest) return false;
      return !!node.closest(
        "input, textarea, select, button, a, label, .orient-dial, .slider-row, .town-list"
      );
    }

    function pushSample(x, t) {
      samples.push({ x: x, t: t });
      var cutoff = t - 80;
      while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
    }

    function velocity() {
      if (samples.length < 2) return 0;
      var a = samples[0];
      var b = samples[samples.length - 1];
      var dt = b.t - a.t;
      if (dt < 8) return 0;
      return (b.x - a.x) / dt;
    }

    function armSuppress() {
      suppressClick = true;
      win.setTimeout(function () { suppressClick = false; }, 400);
    }

    function peekTap(clientX) {
      var m = metrics();
      if (!m || m.sliver < 8) return;
      var rect = viewport.getBoundingClientRect();
      var local = clientX - rect.left;
      if (fraction < 0.08 && local >= rect.width - m.sliver) {
        goFraction(1, true);
        armSuppress();
      } else if (fraction > 0.92 && local <= m.sliver) {
        goFraction(0, true);
        armSuppress();
      }
    }

    function endPointer(e, cancelled) {
      if (!pointer || e.pointerId !== pointer.id) return;
      var endX = e.clientX;
      var endY = e.clientY;
      if (cancelled && samples.length) endX = samples[samples.length - 1].x;
      var dx = endX - pointer.x0;
      var dy = endY - pointer.y0;
      var wasLocked = pointer.locked;
      var base = pointer.base;
      var v = velocity();
      pointer = null;
      samples = [];
      dragging = false;
      viewport.classList.remove("is-dragging");
      if (!wasLocked) {
        if (!cancelled && Math.abs(dx) <= TAP_PX && Math.abs(dy) <= TAP_PX) peekTap(endX);
        return;
      }
      armSuppress();
      var m = metrics();
      if (!m) return;
      var x = resistX(base + dx, m.blue, 0, RESIST);
      var target = cancelled ? Math.min(0, Math.max(m.blue, x)) : releaseTarget(x, v, dx, m.blue, 0);
      fraction = clamp01(target / m.blue);
      paint(target, Math.abs(target - x) > 0.5);
      mark(target, m);
    }

    viewport.addEventListener("pointerdown", function (e) {
      if (!active() || !e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (doc.body.classList.contains("modal-open")) return;
      if (doc.body.classList.contains("is-range-dragging")) return;
      if (blocked(e.target)) return;
      if (e.pointerType === "touch" && (e.clientX < EDGE_PX || e.clientX > win.innerWidth - EDGE_PX)) return;
      var m = metrics();
      if (!m) return;
      pointer = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        base: visualX(),
        locked: false
      };
      samples = [{ x: e.clientX, t: e.timeStamp }];
    });

    function onPointerMove(e) {
      if (!pointer || e.pointerId !== pointer.id) return;
      if (doc.body.classList.contains("is-range-dragging")) {
        pointer = null;
        samples = [];
        return;
      }
      var dx = e.clientX - pointer.x0;
      var dy = e.clientY - pointer.y0;
      if (!pointer.locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          pointer = null;
          samples = [];
          return;
        }
        pointer.locked = true;
        dragging = true;
        viewport.classList.add("is-dragging");
        viewport.classList.remove("is-animating");
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* pointer already ended */ }
      }
      if (e.cancelable) e.preventDefault();
      pushSample(e.clientX, e.timeStamp);
      var m = metrics();
      if (!m) return;
      var x = resistX(pointer.base + dx, m.blue, 0, RESIST);
      paint(x, false);
      mark(x, m);
    }

    win.addEventListener("pointermove", onPointerMove, { passive: false });
    win.addEventListener("touchmove", function (e) {
      if (!pointer || !pointer.locked) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    win.addEventListener("pointerup", function (e) { endPointer(e, false); });
    win.addEventListener("pointercancel", function (e) { endPointer(e, true); });

    viewport.addEventListener("click", function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    viewport.addEventListener("focusin", function (e) {
      if (!active() || dragging) return;
      var el = e.target;
      if (!el || !el.getBoundingClientRect) return;
      var m = metrics();
      if (!m) return;
      var rect = el.getBoundingClientRect();
      var vr = viewport.getBoundingClientRect();
      var visible = Math.min(rect.right, vr.right) - Math.max(rect.left, vr.left);
      if (visible >= Math.min(rect.width, 48)) return;
      var next = el.closest && el.closest(".col-auto") ? 1 : 0;
      goFraction(next, true);
    });

    board.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "transform") return;
      viewport.classList.remove("is-animating");
    });

    if (typeof win.ResizeObserver === "function") {
      var observer = new win.ResizeObserver(onLayout);
      observer.observe(viewport);
    }
    win.addEventListener("resize", onLayout);
    if (mq.addEventListener) mq.addEventListener("change", onLayout);
    else if (mq.addListener) mq.addListener(onLayout);
    onLayout();
  }

  return {
    paneGeometry: paneGeometry,
    resistX: resistX,
    releaseTarget: releaseTarget,
    mount: mount
  };
});
