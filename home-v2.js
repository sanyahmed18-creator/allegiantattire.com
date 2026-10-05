/* ==========================================================================
   ALLEGIANT ATTIRE — home-v2.js  (rail edition)

   THE RAIL
   --------
   Every garment in the line hangs from the chrome rail on a wooden hanger.
   The rail carries them past the viewer with a slow, continuous glide:

     · DRIFT   — constant motion at sample-room speed, wrapping seamlessly
     · DRAG    — pointer drag scrubs the rail, momentum decays on release
     · DEPTH   — pieces shrink, tip away and rise as they leave the centre,
                 so the rail reads as receding into the room
     · LIFT    — hover/focus brings a piece forward (scale + turn) and dims
                 the rest; the caption below follows it
     · EXPLORE — click opens the piece over a blurred rail
   ========================================================================== */
(function () {
  "use strict";

  var CATS = window.AA_CATEGORIES || [];
  var ITEMS = window.AA_CATALOG || [];
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

  var WOOD =
    '<svg class="hang-wood" viewBox="0 0 78 32" aria-hidden="true">' +
      '<path d="M39 14 c0 -5.5 7.5 -7.5 8.5 -2.5" fill="none" stroke="#8a5a2b" stroke-width="2.1" stroke-linecap="round"/>' +
      '<path d="M39 14 L10 28 H68 Z" fill="#c08a4a" stroke="#8a5a2b" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M13 28 h52" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="39" cy="13" r="1.7" fill="#8a5a2b"/>' +
    "</svg>";

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

  function hangHTML(p, i) {
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
    return (
      '<article class="hang rv" data-id="' + p.id + '" data-cat="' + p.cat + '" data-i="' + i + '">' +
        '<span class="hang-string" aria-hidden="true"></span>' +
        WOOD +
        '<div class="hang-media">' +
          '<span class="hang-plate" aria-hidden="true"></span>' +
          '<img class="hang-img" loading="lazy" src="' + BASE + p.img + '" alt="' + p.name + '" draggable="false" />' +
        "</div>" +
        '<button class="hang-btn" type="button" aria-label="Explore ' + p.name + '"></button>' +
        '<span class="hang-label">' + money(p.price) + (off ? " · −" + off + "%" : "") + " · " +
          p.name.toUpperCase() + "</span>" +
      "</article>"
    );
  }

  var rail = {
    x: 0, vel: 0, dragging: false, hovering: false, reduced: REDUCED,
    speed: 18, scrollSpeed: 1, hoverIdx: -1, centerIdx: -1,
    step: 0, itemW: 0, wrapW: 0, pad: 0, pointerId: null, lastX: 0, samples: [],
    items: [], last: 0, tween: null,
  };

  function renderRail() {
    track.innerHTML = HANGING.map(hangHTML).join("");
    rail.items = $$(".hang", track);
    measureRail(true);
    $$(".hang-img", track).forEach(function (img) {
      img.addEventListener("load", function () { if (!img.dataset.done) { img.dataset.done = "1"; measureRail(false); } });
    });
    requestAnimationFrame(function () { measureRail(false); });
  }

  function measureRail(first) {
    var first_item = rail.items[0];
    if (!first_item) return;
    var cs = getComputedStyle(first_item);
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    rail.itemW = (first_item.getBoundingClientRect().width || 132) - padL - padR;
    rail.pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    rail.step = first_item.getBoundingClientRect().width || (rail.itemW + padL + padR);
    rail.wrapW = rail.step * rail.items.length;
    if (first) { rail.x = -rail.step * 0.5; }
    paint();
  }

  /* perspective: how far a piece sits from the centre of the viewport */
  function paint(forIdx) {
    var vw = viewport.clientWidth;
    var mid = vw / 2;
    for (var k = 0; k < rail.items.length; k++) {
      var el = rail.items[k];
      var cx = rail.x + rail.pad + k * rail.step + rail.step / 2;
      if (cx < -260 || cx > vw + 260) {                 // offstage: freeze a cheap pose
        if (el._off !== 1) {
          var p0 = (cx - mid) / mid;
          el._off = 1;
          el.style.transform = "translate3d(0,0,0) scale(" + (1 - Math.min(1, Math.abs(p0)) * 0.3).toFixed(3) + ")";
          el.style.opacity = "0.55";
        }
        continue;
      }
      el._off = 0;
      var p = (cx - mid) / mid;                          // -1 … 1
      var d = Math.min(1, Math.abs(p));
      var s = 1 - d * d * 0.26;
      var hot = el.classList.contains("is-hot");
      var lift = hot ? 1.5 : 1;
      var y = hot ? -14 : 0;
      var ry = -p * 6 + (hot ? -5 : 0);
      el.style.transform =
        "translate3d(0," + y + "px,0) rotateY(" + ry.toFixed(2) + "deg) scale(" + (s * lift).toFixed(3) + ")";
      el.style.zIndex = String(Math.round(s * lift * 1000));
      el.style.opacity = "1";
      if (el.classList.contains("is-hot")) el.style.zIndex = "9999";
    }
  }

  function nearestIndex() {
    var vw = viewport.clientWidth;
    var i = Math.round((vw / 2 - rail.x - rail.pad - rail.step / 2) / rail.step);
    var n = rail.items.length;
    return ((i % n) + n) % n;
  }

  function wrap() {
    if (!rail.wrapW) return;
    while (rail.x <= -rail.wrapW) rail.x += rail.wrapW;
    while (rail.x > 0) rail.x -= rail.wrapW;
  }

  function caption(idx) {
    var el = rail.items[idx];
    if (!el) return;
    if (el.dataset.id === nameEl.dataset.id) return;
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

  function frame(now) {
    var dt = Math.min(0.05, (now - rail.last) / 1000) || 0.016;
    rail.last = now;

    if (!rail.dragging) {
      if (Math.abs(rail.vel) > 4) {
        rail.x += rail.vel * dt;
        rail.vel *= Math.pow(0.0018, dt);
      } else {
        rail.vel = 0;
        if (!rail.reduced && rail.hoverIdx < 0 && !document.body.classList.contains("is-pov")) {
          rail.x -= rail.speed * dt;
        }
      }
      if (rail.tween) {
        var d = rail.tween.to - rail.x;
        rail.x += d * Math.min(1, dt * 6);
        if (Math.abs(d) < 1) { rail.x = rail.tween.to; rail.tween = null; }
        wrap();
      }
      wrap();
    }

    track.style.transform = "translate3d(" + rail.x.toFixed(2) + "px,0,0)";
    paint();

    var idx = nearestIndex();
    if (idx !== rail.centerIdx) { rail.centerIdx = idx; }
    caption(rail.hoverIdx >= 0 ? rail.hoverIdx : idx);

    if (!cue.classList.contains("is-hidden") && (rail.moved || now - (rail.startedAt || now) > 7000)) {
      cue.classList.add("is-hidden");
    }
    rail.startedAt = rail.startedAt || now;
    requestAnimationFrame(frame);
  }

  function bindRail() {
    viewport.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      rail.dragging = true; rail.moved = false; rail.pointerId = e.pointerId;
      rail.lastX = e.clientX; rail.startX = e.clientX;
      rail.vel = 0; rail.samples = []; rail.tween = null;
      // remember what was pressed: a tap must open the piece, a drag must not.
      // (pointer capture is only taken once the drag is real, otherwise it
      //  retargets the click event and the button never hears it)
      rail.downBtn = e.target.closest ? e.target.closest(".hang-btn") : null;
      viewport.classList.add("is-dragging");
    });
    viewport.addEventListener("pointermove", function (e) {
      if (!rail.dragging || e.pointerId !== rail.pointerId) return;
      var dx = e.clientX - rail.lastX;
      rail.lastX = e.clientX;
      if (!rail.moved && Math.abs(e.clientX - rail.startX) > 5) {
        rail.moved = true;
        if (viewport.setPointerCapture) { try { viewport.setPointerCapture(e.pointerId); } catch (err) {} }
      }
      if (!rail.moved) return;
      rail.x += dx;
      rail.samples.push({ t: performance.now(), x: e.clientX });
      if (rail.samples.length > 6) rail.samples.shift();
      wrap();
      track.style.transform = "translate3d(" + rail.x.toFixed(2) + "px,0,0)";
      paint();
    });
    function end(e) {
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
      // a clean tap on a piece explores it (works on touch too)
      if (!rail.moved && rail.downBtn) {
        var id = rail.downBtn.closest(".hang").dataset.id;
        rail.downBtn = null;
        openPov(id);
      }
      rail.downBtn = null;
    }
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);
    viewport.addEventListener("lostpointercapture", end);

    // a drag must not open the piece it started on
    viewport.addEventListener("click", function (e) {
      if (rail.moved) { e.preventDefault(); e.stopPropagation(); }
      rail.moved = false;
    }, true);

    viewport.addEventListener("wheel", function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
      rail.tween = null;
      rail.x -= d * 1.1;
      wrap();
    }, { passive: false });

    // hover / focus lift
    viewport.addEventListener("pointerover", function (e) {
      var el = e.target.closest(".hang");
      if (!el || el === rail.hotEl) return;
      setHot(el);
    });
    viewport.addEventListener("pointerleave", function () { setHot(null); });
    viewport.addEventListener("focusin", function (e) {
      var el = e.target.closest(".hang");
      if (el) setHot(el);
    });
    viewport.addEventListener("focusout", function () { setHot(null); });
    viewport.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { rail.tween = { to: rail.x - rail.step }; e.preventDefault(); }
      if (e.key === "ArrowLeft") { rail.tween = { to: rail.x + rail.step }; e.preventDefault(); }
    });

    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".hang-btn");
      if (btn && !rail.downBtn && !e.detail) {   // keyboard / AT activation only
        openPov(btn.closest(".hang").dataset.id);
      }
    });
  }

  function setHot(el) {
    if (rail.hotEl) rail.hotEl.classList.remove("is-hot");
    rail.hotEl = el;
    rail.hoverIdx = el ? Number(el.dataset.i) : -1;
    viewport.classList.toggle("is-dimmed", !!el);
    if (el) el.classList.add("is-hot");
    paint();
    if (el) caption(rail.hoverIdx);
  }

  function jumpToCategory(slug) {
    var idx = -1;
    for (var i = 0; i < rail.items.length; i++) {
      if (rail.items[i].dataset.cat === slug) { idx = i; break; }
    }
    if (idx < 0) return;
    var vw = viewport.clientWidth;
    var to = -(idx * rail.step) + (vw / 2 - rail.pad - rail.step / 2);
    rail.tween = { to: to };
    wrap(); // normalise into the same lap as the current x
    rail.tween.to = rail.x + (((to - rail.x) % rail.wrapW) + rail.wrapW) % rail.wrapW;
    cue.classList.add("is-hidden");
  }

  function scrollToRail() {
    var y = viewport.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
  }

  /* ======================================================================
     EXPLORE OVERLAY
     ====================================================================== */
  var pov = $("#pov");

  function openPov(id) {
    var p = ITEMS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;

    $("#povSku").textContent = "SKU " + p.id.toUpperCase() + " — " + p.catLabel;
    $("#povName").textContent = p.name;
    $("#povMeta").textContent = money(p.price) + (p.was ? " (was " + money(p.was) + ")" : "") +
      " · MOQ " + p.moq + " PCS" + (off ? " · −" + off + "%" : "");
    $("#povHang").innerHTML =
      '<span class="hang-string" aria-hidden="true"></span>' + WOOD +
      '<div class="hang-media"><span class="hang-plate" aria-hidden="true"></span>' +
      '<img class="hang-img" src="' + BASE + p.img + '" alt="' + p.name + '" /></div>';
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
        '<p style="font-size:13px;color:var(--mute);margin-top:8px;max-width:34ch">' +
        "Back-of-garment artwork (prints, labels, numbers) is drawn up by our team and approved on WhatsApp before anything is printed.</p>" +
        '<a class="pill" style="margin-top:12px" target="_blank" rel="noopener" href="https://wa.me/' + WA +
        '?text=' + encodeURIComponent("Hi! Please send the back-view mockup options for this piece.") + '">REQUEST BACK MOCKUP ↗</a>';
      media.appendChild(note);
    }
  }

  /* ======================================================================
     MENU
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

  /* ======================================================================
     SECTIONS
     ====================================================================== */
  function renderLine() {
    var list = $("#lineList");
    if (!list) return;
    list.innerHTML = CATS.map(function (c) {
      return (
        '<li class="rv"><a href="#rails" data-cat="' + c.slug + '">' +
          '<span class="line-code">' + c.code + "</span>" +
          '<span class="line-name">' + c.label + "</span>" +
          '<span class="line-sub">' + c.count + " PCS · " + c.note + "</span>" +
          '<span class="line-go">OPEN ↗</span>' +
        "</a></li>"
      );
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
      return (
        '<li class="rv"><div>' +
          "<b>" + s[0] + "</b>" +
          "<h3>" + s[1] + "</h3>" +
          '<div><p>' + s[2] + "</p>" +
          '<div class="svc-tags">' + s[3].map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div></div>" +
        "</div></li>"
      );
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
    t.innerHTML = "<span>" + html + "</span><span aria-hidden=\"true\">" + html + "</span>";
    t.querySelectorAll("span").forEach(function (s) { s.style.display = "inline-flex"; s.style.alignItems = "center"; });
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
      return (
        '<div class="dr-row">' +
          '<img src="' + BASE + p.img + '" alt="' + p.name + '" />' +
          "<span><b>" + p.name + "</b><i>" + p.catLabel + " · MOQ " + p.moq + " · " + money(p.price) + "</i></span>" +
          '<span class="qty"><button type="button" data-dec="' + p.id + '" aria-label="Fewer">−</button>' +
          "<span>" + r.qty + "</span>" +
          '<button type="button" data-inc="' + p.id + '" aria-label="More">+</button></span>' +
        "</div>"
      );
    }).join("");
  }

  function addToBag(id, silent) {
    var row = bag.filter(function (r) { return r.id === id; })[0];
    if (row) row.qty += 1; else bag.push({ id: id, qty: 1 });
    saveBag(); renderBag(); refreshBagLink();
    if (!silent) {
      var p = findItem(id) || {};
      toast("ADDED — " + p.name + " · REVIEW IN BAG");
    }
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

    // quote form → WhatsApp hand-off (same flow as the live store)
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

    // reveal on scroll
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

    // counters
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
      rt = setTimeout(function () { measureRail(false); }, 200);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureRail(false); });
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
    setTimeout(function () { measureRail(false); }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
