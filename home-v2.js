/* ==========================================================================
   ALLEGIANT ATTIRE — home-v2.js  (rail edition)

   THE RAIL
   --------
   Background-free garment cut-outs hang from a chrome rail, every piece seen
   in SIDE profile. The rail carries them past the viewer with a slow,
   continuous glide; the piece under the pointer (or focused with the
   keyboard, or the one resting mid-rail) swings round to face straight on.

     · DRIFT   — constant motion at sample-room speed, wrapping seamlessly
                 (two copies of the strip, so there is no start or end)
     · DRAG    — scrubs the rail; momentum decays on release
     · DEPTH   — pieces shrink, tip away and recede as they leave the centre
     · TURN    — hovered / nearest piece cross-fades side → front, the hanger
                 turning edge-on → face-on with it
     · EXPLORE — tap opens the piece over a blurred rail
   ========================================================================== */
(function () {
  "use strict";

  var CATS = window.AA_CATEGORIES || [];
  var ITEMS = window.AA_CATALOG || [];
  var ART = window.AA_ART || {};
  var BASE = window.AA_IMG_BASE || "";
  var STORE = "https://allegiantattire.store";
  var WA = "971582045242";
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) { return "AED " + Number(n).toLocaleString("en-US"); };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  /* pieces that actually hang: everything except print services */
  var HANGING = ITEMS.filter(function (p) { return p.cat !== "services"; });

  var ART_DIR = "/assets/garments/";
  var WOOD =
    '<svg class="hang-wood" viewBox="0 0 78 32" aria-hidden="true">' +
      '<path d="M39 14 c0 -5.5 7.5 -7.5 8.5 -2.5" fill="none" stroke="#8a5a2b" stroke-width="2.1" stroke-linecap="round"/>' +
      '<path d="M39 14 L10 28 H68 Z" fill="#c08a4a" stroke="#8a5a2b" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M13 28 h52" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="39" cy="13" r="1.7" fill="#8a5a2b"/>' +
    "</svg>";

  /* artwork for a catalogue item: same colourway on both views, cycling
     through the colourways so the rail reads as a real sample rail */
  function artFor(p, i) {
    var set = ART[p.cat];
    if (!set || !set.side || !set.side.length || !set.front || !set.front.length) return null;
    return {
      side: set.side[i % set.side.length],
      front: set.front[i % set.front.length],
    };
  }

  /* ======================================================================
     PIECE MARKUP
     ====================================================================== */
  function hangHTML(p, i) {
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
    var art = artFor(p, i);
    var media;

    if (art) {
      /* background-free cut-outs: side profile resting, front view on hover */
      media =
        '<div class="hang-media" style="--ar:' + (art.side.w / art.side.h).toFixed(4) +
          ';--ar2:' + (art.front.w / art.front.h).toFixed(4) + '">' +
          '<img class="art art-side" loading="lazy" draggable="false" alt="' + p.name + ' in profile" src="' +
            ART_DIR + art.side.file + '" />' +
          '<img class="art art-front" loading="lazy" draggable="false" alt="' + p.name + '" src="' +
            ART_DIR + art.front.file + '" />' +
        "</div>";
    } else {
      /* fallback until a garment type has cut-outs: catalogue photo keyed onto
         the studio wall by its own plate + multiply blend */
      media =
        '<div class="hang-media hang-media-photo">' +
          '<span class="hang-plate" aria-hidden="true"></span>' +
          '<img class="hang-img" loading="lazy" draggable="false" alt="' + p.name + '" src="' + BASE + p.img + '" />' +
        "</div>";
    }

    return (
      '<article class="hang' + (art ? " has-art" : "") + '" data-id="' + p.id +
        '" data-cat="' + p.cat + '" data-type="' + (ART[p.cat] ? ART[p.cat].type : "photo") +
        '" data-i="' + i + '">' +
        '<span class="hang-string" aria-hidden="true"></span>' +
        WOOD +
        media +
        '<button class="hang-btn" type="button" aria-label="Explore ' + p.name + '"></button>' +
        '<span class="hang-view">' + (art ? "SIDE → FRONT ON HOVER" : "") + "</span>" +
        '<span class="hang-label">' + money(p.price) + (off ? " · −" + off + "%" : "") + " · " +
          p.name.toUpperCase() + "</span>" +
      "</article>"
    );
  }

  /* ======================================================================
     RAIL
     ====================================================================== */
  var viewport = $("#railViewport");
  var track = $("#railTrack");
  var cue = $("#railCue");
  var nameEl = $("#railName");
  var metaEl = $("#railMeta");
  var exploreBtn = $("#railExplore");
  var openCatBtn = $("#railOpen");

  var rail = {
    x: 0, vel: 0, dragging: false, moved: false, downBtn: null,
    speed: 18, reduced: REDUCED,
    items: [], centers: [], loopW: 0, n: 0,
    hotEl: null, hotIdx: -1, centerIdx: -1,
    pointerId: null, lastX: 0, startX: 0, samples: [],
    last: 0, startedAt: 0, tween: null,
  };

  function renderRail() {
    var half = HANGING.map(hangHTML).join("");
    // two identical copies → the drift can wrap with no visible seam
    track.innerHTML =
      '<div class="rail-copy">' + half + "</div>" +
      '<div class="rail-copy" aria-hidden="true">' + half + "</div>";
    rail.items = $$(".hang", track);
    measureRail();

    $$("img.art, img.hang-img", track).forEach(function (img) {
      if (img.complete) return;
      img.addEventListener("load", function () {
        if (!rail._reflow) {
          rail._reflow = true;
          setTimeout(function () { rail._reflow = false; measureRail(); }, 60);
        }
      });
    });
    requestAnimationFrame(measureRail);
  }

  function measureRail() {
    var copy = $(".rail-copy", track);
    if (!copy || !rail.items.length) return;
    rail.loopW = copy.getBoundingClientRect().width || copy.offsetWidth;
    rail.n = rail.items.length / 2;
    // centre of every piece, in track coordinates (position:relative on track)
    rail.centers = rail.items.map(function (el) { return el.offsetLeft + el.offsetWidth / 2; });
    rail._reflow = false;
    paint();
  }

  function centreOf(i, lap) {
    var n = rail.n || 1;
    var k = ((i % n) + n) % n;
    return rail.centers[k] + (lap || 0) * rail.loopW;
  }

  /* which piece is closest to the middle of the viewport right now */
  function nearestIndex() {
    if (!rail.centers.length) return 0;
    var mid = viewport.clientWidth / 2;
    var n = rail.n, best = 0, bestD = Infinity;
    for (var i = 0; i < n; i++) {
      var c = rail.centers[i] + rail.x;
      // consider the piece, and the same piece one lap either side
      for (var k = -1; k <= 1; k++) {
        var d = Math.abs(c + k * rail.loopW - mid);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /* perspective: how far a piece sits from the centre of the viewport */
  function paint() {
    if (!rail.centers.length) return;
    var vw = viewport.clientWidth;
    if (!vw) return;
    var mid = vw / 2;
    for (var k = 0; k < rail.items.length; k++) {
      var el = rail.items[k];
      var lap = k < rail.n ? 0 : 1;
      var cx = rail.x + rail.centers[k] + (lap && rail.loopW ? 0 : 0);
      // centres are stored for both copies, so no lap offset is needed here
      var p = (cx - mid) / mid;
      var a = Math.abs(p);
      if (a > 1.45) {
        if (el._parked !== 1) {
          el._parked = 1;
          el.style.transform = "translate3d(0,0,0) scale(0.68)";
          el.style.opacity = "0";
        }
        continue;
      }
      el._parked = 0;
      var hot = el.classList.contains("is-hot");
      var s = 1 - a * a * 0.24;
      var lift = hot ? 1.24 : 1;
      var y = hot ? -12 : 0;
      el.style.transform =
        "translate3d(0," + y + "px,0) rotateY(" + (hot ? 0 : -p * 5).toFixed(2) +
        "deg) scale(" + (s * lift).toFixed(3) + ")";
      el.style.zIndex = String(hot ? 9999 : Math.round(s * 1000));
      el.style.opacity = a > 1.1 ? String(Math.max(0, (1.45 - a) / 0.35).toFixed(2)) : "1";
    }
  }

  function wrap() {
    if (!rail.loopW) return;
    while (rail.x <= -rail.loopW) rail.x += rail.loopW;
    while (rail.x > 0) rail.x -= rail.loopW;
  }

  /* the transform that parks a given piece in the middle of the screen */
  function xForIndex(i) {
    var target = viewport.clientWidth / 2 - (rail.centers[((i % rail.n) + rail.n) % rail.n] || 0);
    // choose the equivalent position nearest to where we already are
    while (target - rail.x > rail.loopW / 2) target -= rail.loopW;
    while (target - rail.x < -rail.loopW / 2) target += rail.loopW;
    return target;
  }

  function caption(idx) {
    var el = rail.items[((idx % rail.n) + rail.n) % rail.n];
    if (!el || el.dataset.id === nameEl.dataset.id) return;
    var p = ITEMS.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!p) return;
    nameEl.dataset.id = p.id;
    nameEl.style.opacity = "0";
    setTimeout(function () {
      nameEl.textContent = p.name;
      metaEl.textContent = p.catLabel + " · MOQ " + p.moq + " · " + money(p.price) +
        (p.was ? " (was " + money(p.was) + ")" : "");
      nameEl.style.opacity = "1";
    }, 130);
  }

  function setHot(el) {
    if (rail.hotEl === el) return;
    if (rail.hotEl) rail.hotEl.classList.remove("is-hot");
    rail.hotEl = el;
    rail.hotIdx = el ? Number(el.dataset.i) : -1;
    viewport.classList.toggle("is-dimmed", !!el);
    if (el) {
      el.classList.add("is-hot");
      caption(rail.hotIdx);
    }
    paint();
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - rail.last) / 1000) || 0.016;
    rail.last = now;
    if (!rail.startedAt) rail.startedAt = now;

    if (!rail.dragging) {
      if (Math.abs(rail.vel) > 4) {
        rail.x += rail.vel * dt;
        rail.vel *= Math.pow(0.0018, dt);
      } else if (rail.tween) {
        rail.vel = 0;
        var d = rail.tween.to - rail.x;
        rail.x += d * Math.min(1, dt * 6.5);
        if (Math.abs(d) < 0.7) { rail.x = rail.tween.to; rail.tween = null; }
      } else {
        rail.vel = 0;
        if (!rail.reduced && !rail.hotEl && !document.body.classList.contains("is-pov")) {
          rail.x -= rail.speed * dt;
        }
      }
      wrap();
    }

    track.style.transform = "translate3d(" + rail.x.toFixed(2) + "px,0,0)";
    paint();

    var idx = nearestIndex();
    if (idx !== rail.centerIdx) rail.centerIdx = idx;
    if (!rail.hotEl) caption(idx);

    if (!cue.classList.contains("is-hidden") && (rail.moved || now - rail.startedAt > 7000)) {
      cue.classList.add("is-hidden");
    }
    requestAnimationFrame(frame);
  }

  function bindRail() {
    viewport.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      rail.dragging = true; rail.moved = false; rail.pointerId = e.pointerId;
      rail.lastX = e.clientX; rail.startX = e.clientX;
      rail.vel = 0; rail.samples = []; rail.tween = null;
      rail.downBtn = e.target.closest ? e.target.closest(".hang-btn") : null;
      viewport.classList.add("is-dragging");
    });

    viewport.addEventListener("pointermove", function (e) {
      if (rail.dragging && e.pointerId === rail.pointerId) {
        var dx = e.clientX - rail.lastX;
        rail.lastX = e.clientX;
        if (!rail.moved && Math.abs(e.clientX - rail.startX) > 5) {
          rail.moved = true;
          // capture only once the drag is real, so a tap still reaches the button
          if (viewport.setPointerCapture) { try { viewport.setPointerCapture(e.pointerId); } catch (err) {} }
        }
        if (rail.moved) {
          rail.x += dx;
          rail.samples.push({ t: performance.now(), x: e.clientX });
          if (rail.samples.length > 6) rail.samples.shift();
          wrap();
          track.style.transform = "translate3d(" + rail.x.toFixed(2) + "px,0,0)";
          paint();
        }
        return;
      }
    });

    // hover (cheap: one bubbling listener, no per-frame hit testing)
    viewport.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;          // touch is served by the tap
      setHot(e.target.closest ? e.target.closest(".hang") : null);
    });
    viewport.addEventListener("pointerout", function (e) {
      if (e.pointerType === "touch") return;
      var to = e.relatedTarget;
      if (!to || !viewport.contains(to)) setHot(null);
    });

    function endDrag() {
      if (!rail.dragging) return;
      rail.dragging = false;
      viewport.classList.remove("is-dragging");
      var s = rail.samples;
      if (s.length >= 2) {
        var a = s[0], b = s[s.length - 1], dtms = b.t - a.t;
        if (dtms > 0 && dtms < 260) {
          rail.vel = ((b.x - a.x) / dtms) * 1000;
          if (Math.abs(rail.vel) < 70) rail.vel = 0;
        }
      }
      rail.samples = [];
      if (!rail.moved && rail.downBtn) openPov(rail.downBtn.closest(".hang").dataset.id);
      rail.downBtn = null;
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("lostpointercapture", endDrag);

    viewport.addEventListener("click", function (e) {
      if (rail.moved) { e.preventDefault(); e.stopPropagation(); }
      rail.moved = false;
    }, true);

    viewport.addEventListener("pointerleave", function () { if (!rail.dragging) setHot(null); });

    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      rail.tween = null;
      rail.x -= (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.1;
      wrap();
    }, { passive: false });

    viewport.addEventListener("focusin", function (e) {
      var el = e.target.closest && e.target.closest(".hang");
      if (el) setHot(el);
    });
    viewport.addEventListener("focusout", function () { setHot(null); });

    viewport.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { rail.tween = { to: xForIndex(nearestIndex() + 1) }; e.preventDefault(); }
      if (e.key === "ArrowLeft") { rail.tween = { to: xForIndex(nearestIndex() - 1) }; e.preventDefault(); }
    });

    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".hang-btn");
      if (btn && !rail.downBtn && !e.detail) openPov(btn.closest(".hang").dataset.id);
    });
  }

  function jumpToCategory(slug) {
    for (var i = 0; i < rail.n; i++) {
      var el = rail.items[i];
      if (el && el.dataset.cat === slug) {
        rail.tween = { to: xForIndex(i) };
        setHot(el);
        cue.classList.add("is-hidden");
        return;
      }
    }
  }

  function scrollToRail() {
    var y = viewport.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
  }

  /* ======================================================================
     EXPLORE OVERLAY
     ====================================================================== */
  var pov = $("#pov");

  function openPov(id) {
    var idx = 0;
    var p = null;
    for (var i = 0; i < HANGING.length; i++) {
      if (HANGING[i].id === id) { p = HANGING[i]; idx = i; break; }
    }
    if (!p) p = ITEMS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
    var art = artFor(p, idx);

    $("#povSku").textContent = "SKU " + p.id.toUpperCase() + " — " + p.catLabel;
    $("#povName").textContent = p.name;
    $("#povMeta").textContent = money(p.price) + (p.was ? " (was " + money(p.was) + ")" : "") +
      " · MOQ " + p.moq + " PCS" + (off ? " · −" + off + "%" : "");
    $("#povHang").innerHTML = art
      ? '<span class="hang-string" aria-hidden="true"></span>' + WOOD +
        '<div class="hang-media" style="--ar:' + (art.front.w / art.front.h).toFixed(4) +
        '"><img class="art art-front" alt="' + p.name + '" src="' + ART_DIR + art.front.file + '" /></div>'
      : '<span class="hang-string" aria-hidden="true"></span>' + WOOD +
        '<div class="hang-media hang-media-photo"><span class="hang-plate"></span>' +
        '<img class="hang-img" alt="' + p.name + '" src="' + BASE + p.img + '" /></div>';
    $("#povNote").textContent = p.desc + " Sizes XS–3XL · fabric and colour cards sent on WhatsApp.";
    $("#povShop").setAttribute("href", STORE + "/#categories");
    $("#povAdd").dataset.id = p.id;
    $("#povWa").setAttribute("href", "https://wa.me/" + WA + "?text=" + encodeURIComponent(
      "Hello Allegiant Attire! I'd like a quote on " + p.name + " (" + p.catLabel + ") — " +
      money(p.price) + " per pc, MOQ " + p.moq + "."));

    setView("front");
    pov.classList.add("is-open");
    pov.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-pov");
  }

  function closePov() {
    pov.classList.remove("is-open");
    pov.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-pov");
  }

  function setView(which) {
    $$(".view-btn", pov).forEach(function (b) { b.classList.toggle("is-on", b.dataset.view === which); });
    $("#povViewTag").textContent = which.toUpperCase();
    var media = $(".pov-media", pov);
    var old = $(".pov-backnote", media);
    if (old) old.parentNode.removeChild(old);
    if (which === "back") {
      var note = document.createElement("div");
      note.className = "pov-backnote";
      note.innerHTML = '<p class="lab">BACK VIEW</p>' +
        '<p style="font-size:13px;color:var(--mute);margin-top:8px;max-width:36ch">' +
        "Back-of-garment artwork (prints, numbers, labels) is drawn up by our team and approved on WhatsApp before anything is printed.</p>" +
        '<a class="pill" style="margin-top:12px" target="_blank" rel="noopener" href="https://wa.me/' + WA +
        '?text=' + encodeURIComponent("Hi! Please send the back-view mockup options for this piece.") + '">REQUEST BACK MOCKUP ↗</a>';
      media.appendChild(note);
    }
  }

  /* ======================================================================
     MENU / SECTIONS / TRAY
     ====================================================================== */
  function bindMenu() {
    var menu = $("#menu");
    function open() {
      menu.classList.add("is-open");
      menu.setAttribute("aria-hidden", "false");
      $("#menuBtn").setAttribute("aria-expanded", "true");
    }
    function close() {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      $("#menuBtn").setAttribute("aria-expanded", "false");
    }
    $("#menuBtn").addEventListener("click", open);
    $("#menuClose").addEventListener("click", close);
    $$(".menu-links a").forEach(function (a) { a.addEventListener("click", close); });

    $("#menuCats").innerHTML = CATS.map(function (c) {
      return '<a href="#rails" data-cat="' + c.slug + '"><span>' + c.label + "</span><i>" + c.count + " PCS</i></a>";
    }).join("");
    $("#menuCats").addEventListener("click", function (e) {
      var a = e.target.closest("[data-cat]");
      if (!a) return;
      e.preventDefault();
      close();
      jumpToCategory(a.dataset.cat);
      scrollToRail();
    });
    return close;
  }

  function renderLine() {
    var list = $("#lineList");
    if (!list) return;
    list.innerHTML = CATS.map(function (c) {
      return '<li class="rv"><a href="#rails" data-cat="' + c.slug + '">' +
        '<span class="line-code">' + c.code + "</span>" +
        '<span class="line-name">' + c.label + "</span>" +
        '<span class="line-sub">' + c.count + " PCS · " + c.note + "</span>" +
        '<span class="line-go">OPEN ↗</span></a></li>';
    }).join("");
    list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-cat]");
      if (!a) return;
      e.preventDefault();
      jumpToCategory(a.dataset.cat);
      scrollToRail();
    });
  }

  var SERVICES = [
    ["01", "DTF Printing", "Full-colour, no-weeding transfers. Same-day pressing in our Ajman facility — made for urgent events, launches & onboarding.", ["SAME-DAY", "NO MINIMUM", "FULL COLOUR"]],
    ["02", "Screen Printing", "Silk-screen bulk runs that survive 50+ washes. Best unit economics above 100 pcs with Pantone-matched inks.", ["BULK", "PANTONE", "50+ WASHES"]],
    ["03", "Sublimation", "All-over dye-sub for activewear & jerseys. Zero feel, zero crack — colour lives inside the fabric.", ["ALL-OVER", "SPORTS", "ZERO FEEL"]],
    ["04", "Embroidery", "Flat + 3D puff embroidery for polos, caps & uniforms. Tajima heads, up to 15 colours, 8,000 stitches/min.", ["3D PUFF", "15 COLOURS", "UNIFORMS"]],
    ["05", "Vinyl & Heat Transfer", "Names, numbers & single-colour marks. The fastest route for team kits and staff personalisation.", ["NAMES", "NUMBERS", "FAST"]],
    ["06", "Customized Labelling", "Woven neck labels, hang tags, size chips & packaging that turn a blank garment into your brand.", ["WOVEN", "HANG TAGS", "BRANDING"]]
  ];

  function renderServices() {
    var list = $("#svcList");
    if (!list) return;
    list.innerHTML = SERVICES.map(function (s) {
      return '<li class="rv"><div>' +
        "<b>" + s[0] + "</b><h3>" + s[1] + "</h3>" +
        "<div><p>" + s[2] + "</p><div class=\"svc-tags\">" +
        s[3].map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div></div></div></li>";
    }).join("");
  }

  var INDUSTRIES = [
    ["U-01", "School Uniforms"], ["U-02", "Hotel / Hospitality"], ["U-03", "Hospital / Medical"],
    ["U-04", "Corporate Uniforms"], ["U-05", "Construction"], ["U-06", "Security"],
    ["U-07", "Salon & Spa"], ["U-08", "Industrial"], ["U-09", "Fitness"]
  ];

  function renderIndustries() {
    var list = $("#uniList");
    if (!list) return;
    list.innerHTML = INDUSTRIES.map(function (it) {
      return '<li class="rv"><a href="#quote"><span><b>' + it[0] + "</b><strong>" + it[1] +
        "</strong></span><span>FROM AED 32 →</span></a></li>";
    }).join("");
  }

  function renderTray() {
    var t = $("#trayTrack");
    if (!t) return;
    var html =
      '<a href="tel:+971582045242">CALL +971 58 204 5242</a>' +
      "<em>✦</em><span>SAME-DAY DTF</span>" +
      "<em>✦</em><a href=\"https://wa.me/" + WA + '">WHATSAPP</a>' +
      "<em>✦</em><span>UNIFORMS · CAPS · ACTIVEWEAR</span>" +
      "<em>✦</em><span>2.4M PCS DELIVERED</span>" +
      "<em>✦</em><span>MON–SAT 9–7 · AJMAN UAE</span>" +
      "<em>✦</em><a href=\"https://maps.google.com/?q=New+Industrial+Area+2,+Ajman,+UAE\" target=\"_blank\" rel=\"noopener\">NEW INDUSTRIAL AREA 2</a>" +
      "<em>✦</em>";
    t.innerHTML = '<span class="tray-half">' + html + '</span><span class="tray-half" aria-hidden="true">' + html + "</span>";
  }

  /* ======================================================================
     BAG
     ====================================================================== */
  var BAG_KEY = "aa-bag-v3";
  var bag = [];
  try { bag = JSON.parse(localStorage.getItem(BAG_KEY) || "[]") || []; } catch (e) { bag = []; }
  var findItem = function (id) { return ITEMS.filter(function (p) { return p.id === id; })[0]; };
  var bagTotal = function () {
    return bag.reduce(function (s, r) { var p = findItem(r.id); return s + (p ? p.price * r.qty : 0); }, 0);
  };
  function saveBag() { try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (e) {} }

  function bagThumb(p) {
    var i = HANGING.indexOf(p);
    var art = i >= 0 ? artFor(p, i) : null;
    return art ? ART_DIR + art.front.file : BASE + p.img;
  }

  function renderBag() {
    var count = bag.reduce(function (s, r) { return s + r.qty; }, 0);
    var badge = $("#bagCount");
    badge.textContent = count;
    badge.parentNode.classList.toggle("is-hot", count > 0);
    $("#bagTotal").textContent = money(bagTotal());
    var body = $("#bagBody");
    if (!bag.length) {
      body.innerHTML = '<p class="dr-empty">NOTHING ON THE RAIL YET.<br />HOVER A PIECE AND CLICK TO EXPLORE — QUANTITIES ARE CONFIRMED ON WHATSAPP BEFORE PRODUCTION.</p>';
      return;
    }
    body.innerHTML = bag.map(function (r) {
      var p = findItem(r.id);
      if (!p) return "";
      return '<div class="dr-row">' +
        '<img src="' + bagThumb(p) + '" alt="' + p.name + '" />' +
        "<span><b>" + p.name + "</b><i>" + p.catLabel + " · MOQ " + p.moq + " · " + money(p.price) + "</i></span>" +
        '<span class="qty"><button type="button" data-dec="' + p.id + '" aria-label="Fewer">−</button>' +
        "<span>" + r.qty + "</span>" +
        '<button type="button" data-inc="' + p.id + '" aria-label="More">+</button></span></div>';
    }).join("");
  }

  function addToBag(id, silent) {
    var row = bag.filter(function (r) { return r.id === id; })[0];
    if (row) row.qty += 1; else bag.push({ id: id, qty: 1 });
    saveBag(); renderBag(); refreshBagLink();
    if (!silent) toast("ADDED — " + (findItem(id) || {}).name + " · REVIEW IN BAG");
  }

  function orderText() {
    if (!bag.length) return "Hello Allegiant Attire! I'd like a quote on your blanks.";
    return "Hello Allegiant Attire! RAIL ORDER:\n" + bag.map(function (r) {
      var p = findItem(r.id) || {};
      return "• " + p.name + " (" + p.catLabel + ") — " + r.qty + " pcs @ " + money(p.price) + " · MOQ " + p.moq;
    }).join("\n") + "\n\nEstimate: " + money(bagTotal()) + "\nName: \nPhone: \nDeadline: ";
  }
  function refreshBagLink() {
    $("#bagOrder").setAttribute("href", "https://wa.me/" + WA + "?text=" + encodeURIComponent(orderText()));
  }
  function openBag() {
    renderBag(); refreshBagLink();
    $("#bagDrawer").classList.add("is-open");
    $("#bagDrawer").setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("is-on");
  }
  function closeBag() {
    $("#bagDrawer").classList.remove("is-open");
    $("#bagDrawer").setAttribute("aria-hidden", "true");
    $("#scrim").classList.remove("is-on");
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 2600);
  }

  /* ======================================================================
     GLOBAL
     ====================================================================== */
  function bindGlobal(closeMenu) {
    $("#bagBtn").addEventListener("click", openBag);
    $("#bagClose").addEventListener("click", closeBag);
    $("#bagClear").addEventListener("click", function () {
      bag = []; saveBag(); renderBag(); refreshBagLink(); toast("BAG CLEARED");
    });
    $("#scrim").addEventListener("click", closeBag);

    document.addEventListener("click", function (e) {
      var inc = e.target.closest("[data-inc]");
      if (inc) { addToBag(inc.dataset.inc, true); return; }
      var dec = e.target.closest("[data-dec]");
      if (dec) {
        var row = bag.filter(function (r) { return r.id === dec.dataset.dec; })[0];
        if (row) {
          row.qty -= 1;
          if (row.qty <= 0) bag = bag.filter(function (r) { return r.id !== row.id; });
          saveBag(); renderBag(); refreshBagLink();
        }
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      closeBag(); closePov(); if (closeMenu) closeMenu();
    });

    $("#povClose").addEventListener("click", closePov);
    $("#povScrim").addEventListener("click", closePov);
    $$(".view-btn", pov).forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.view); });
    });
    $("#povAdd").addEventListener("click", function () {
      addToBag($("#povAdd").dataset.id); closePov(); openBag();
    });

    exploreBtn.addEventListener("click", function () {
      var el = rail.hotEl || rail.items[rail.centerIdx];
      if (el) openPov(el.dataset.id);
    });
    openCatBtn.addEventListener("click", function () {
      var el = rail.hotEl || rail.items[rail.centerIdx];
      if (el) jumpToCategory(el.dataset.cat);
    });

    $("#toTop").addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
    });

    $$(".foot-col a[data-jump]").forEach(function (a) {
      a.addEventListener("click", function () { jumpToCategory(a.dataset.jump); });
    });

    var form = $("#quoteForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var d = new FormData(form);
        var name = (d.get("name") || "").toString().trim();
        var phone = (d.get("phone") || "").toString().trim();
        var msg = $("#quoteMsg");
        if (!name || !phone) {
          msg.className = "f-note err";
          msg.textContent = "NAME AND PHONE ARE REQUIRED — OR MESSAGE US ON WHATSAPP.";
          return;
        }
        msg.className = "f-note ok";
        msg.textContent = "SENDING ON WHATSAPP — WE REPLY WITHIN 1 BUSINESS HOUR.";
        window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(
          "Hello Allegiant Attire! QUOTE REQUEST:\n• Name: " + name + "\n• Phone: " + phone +
          "\n• Need: " + (d.get("need") || "") + "\n• Qty / deadline: " + (d.get("qty") || "—") +
          "\n• Notes: " + (d.get("notes") || "—")), "_blank", "noopener");
      });
    }

    var rvs = $$(".rv");
    if ("IntersectionObserver" in window && !REDUCED) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
      rvs.forEach(function (el) { io.observe(el); });
    } else {
      rvs.forEach(function (el) { el.classList.add("in"); });
    }

    function runCounter(el) {
      var target = parseFloat(el.dataset.count);
      var suf = el.dataset.suffix || "";
      var dec = (String(el.dataset.count).split(".")[1] || "").length;
      if (REDUCED) { el.textContent = target.toFixed(dec) + suf; return; }
      var t0 = null;
      (function tick(now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / 1200);
        el.textContent = (target * (1 - Math.pow(1 - p, 3))).toFixed(dec) + suf;
        if (p < 1) requestAnimationFrame(tick);
      })(performance.now());
    }
    var counters = $$("[data-count]");
    if ("IntersectionObserver" in window) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { runCounter(en.target); io2.unobserve(en.target); }
        });
      }, { threshold: 0.5 });
      counters.forEach(function (el) { io2.observe(el); });
    } else {
      counters.forEach(runCounter);
    }

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var keep = rail.hotIdx;
        measureRail();
        if (keep >= 0) rail.x = xForIndex(keep);
      }, 200);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureRail(); });
    }
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  function init() {
    var yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();
    renderRail();
    renderLine();
    renderServices();
    renderIndustries();
    renderTray();
    renderBag();
    refreshBagLink();
    var closeMenu = bindMenu();
    bindRail();
    bindGlobal(closeMenu);
    requestAnimationFrame(frame);
    setTimeout(measureRail, 600);
    // images that arrive late change the piece widths — re-measure once settled
    window.addEventListener("load", function () { setTimeout(measureRail, 200); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
