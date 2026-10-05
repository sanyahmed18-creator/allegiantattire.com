/* ==========================================================================
   ALLEGIANT ATTIRE — home-v2.js
   Renders the catalogue into the new home page and drives the rail motion.

   THE RAIL
   --------
   A transform-driven carousel with three motions layered together:

     1. DRIFT   — the rail glides continuously at sample-room speed, wrapping
                  seamlessly (content is duplicated, so there is no start/end).
     2. DRAG    — pointer/touch drag scrubs the rail with velocity tracking;
                  on release the momentum decays and the drift eases back in.
     3. SNAP    — after the momentum dies the rail eases onto the nearest
                  hanger (card), so a piece always lands dead-centre.

   Hover (or keyboard focus) pauses the drift so a piece can be read.
   Arrow buttons step exactly one piece; wheel maps to horizontal motion.
   ========================================================================== */
(function () {
  "use strict";

  var CATS = window.AA_CATEGORIES || [];
  var ITEMS = window.AA_CATALOG || [];
  var BASE = window.AA_IMG_BASE || "";
  var WA = "971582045242";
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) { return "AED " + Number(n).toLocaleString("en-US"); };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  /* ======================================================================
     RAIL ENGINE
     ====================================================================== */
  function Rail(opts) {
    this.scroll = opts.scroll;                 // viewport element
    this.track = opts.track;                   // flex track (transformed)
    this.speed = REDUCED ? 0 : (opts.speed == null ? 26 : opts.speed); // px/s drift
    this.baseSpeed = this.speed;
    this.glide = 0;                            // current drift speed (eased)
    this.x = 0;                                // current translate (px, <=0)
    this.vel = 0;                              // momentum (px/s)
    this.dragging = false;
    this.hovering = false;
    this.mode = opts.mode || "wrap";           // wrap | paged
    this.gap = 0;
    this.cardW = 0;
    this.step = 0;                             // card width + gap
    this.wrapW = 0;                            // width of one full copy
    this.count = 0;                            // unique item count
    this.index = 0;
    this.hooks = opts.hooks || null;
    this.onTick = opts.onTick || null;
    this.pointerId = null;
    this.lastX = 0;
    this.dragDist = 0;
    this.suppressClick = false;
    this.samples = [];
    this.snapTo = null;
    this.last = performance.now();
    this.startedAt = this.last;
    this.uniqueCount = opts.uniqueCount || 0;
    this._frame = this.frame.bind(this);
    this._lastIndex = -1;

    this._bind();
    this.measure();
    requestAnimationFrame(this._frame);
  }

  Rail.prototype.measure = function () {
    var items = $$(".p-card", this.track);
    if (!items.length) return;
    this.count = this.uniqueCount || items.length;
    var cs = getComputedStyle(this.track);
    this.gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
    this.cardW = items[0].getBoundingClientRect().width;
    if (!this.cardW) this.cardW = items[0].offsetWidth;
    this.step = this.cardW + this.gap;
    this.wrapW = this.step * this.count;
    this.fill();
    this._placeHooks();
    this._place();
    this._emit(true);
  };

  // Keep enough duplicated copies on the rail that the wrap is never visible.
  Rail.prototype.fill = function () {
    var per = this.count;
    if (!per) return;
    var items = $$(".p-card", this.track);
    var hooks = this.hooks ? $$(".rb-hook", this.hooks) : [];
    var have = Math.max(1, Math.round(items.length / per));
    var wrapW = Math.max(1, this.step * per);
    var need = Math.ceil((this.scroll.clientWidth * 1.6) / wrapW) + 1;
    need = Math.max(2, Math.min(6, need));
    var i, k;
    if (need > have) {
      for (var c = have; c < need; c++) {
        for (i = 0; i < per; i++) {
          var node = items[i].cloneNode(true);
          node.setAttribute("aria-hidden", "true");
          this.track.appendChild(node);
          if (this.hooks && hooks[i]) this.hooks.appendChild(hooks[i].cloneNode(true));
        }
      }
    } else if (need < have) {
      for (k = need * per; k < items.length; k++) items[k].parentNode.removeChild(items[k]);
      for (k = need * per; k < hooks.length; k++) hooks[k].parentNode.removeChild(hooks[k]);
    }
    this.copies = need;
  };

  Rail.prototype._placeHooks = function () {
    if (!this.hooks || !this.step) return;
    var per = this.count || 1;
    var hs = $$(".rb-hook", this.hooks);
    var first = $(".p-card", this.track);
    if (!first) return;
    var left = first.offsetLeft + this.cardW / 2;
    var step = this.step;
    for (var i = 0; i < hs.length; i++) {
      hs[i].style.left = Math.round(left + (i % per) * step) + "px";
    }
  };

  // Hooks (the little hangers on the rail bar) follow the same transform.
  Rail.prototype._place = function () {
    if (this.hooks) {
      this.hooks.style.transform = "translate3d(" + this.x + "px,0,0)";
    }
    this.track.style.transform = "translate3d(" + this.x + "px,0,0)";
  };

  Rail.prototype._emit = function (force) {
    var n = this.count || 1;
    var idx = ((Math.round(-this.x / this.step) % n) + n) % n;
    this.index = idx;
    if (!force && idx === this._lastIndex) return;
    this._lastIndex = idx;
    if (!this.onTick) return;
    var pct = n > 1 ? (idx / (n - 1)) * 100 : 100;
    this.onTick(idx, Math.max(3, pct));
  };

  Rail.prototype._wrap = function () {
    if (!this.wrapW) return;
    if (this.x <= -this.wrapW) this.x += this.wrapW;
    if (this.x > 0) this.x -= this.wrapW;
  };

  Rail.prototype.frame = function (now) {
    var dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (!this.dragging) {
      var want = this.hovering ? 0 : this.baseSpeed;
      this.glide += (want - this.glide) * Math.min(1, dt * 3.2);

      if (Math.abs(this.vel) > 4) {
        // momentum from a flick
        this.x += this.vel * dt;
        this.vel *= Math.pow(0.0016, dt); // exponential decay
      } else if (this.vel !== 0) {
        this.vel = 0;
        if (this.mode === "paged") this.snapTo = this._nearest();
      }

      // drift only once the momentum has settled and nothing is hovered
      if (Math.abs(this.vel) < 4) {
        if (this.snapTo !== null) {
          var d = this.snapTo - this.x;
          this.x += d * Math.min(1, dt * 7);
          if (Math.abs(d) < 0.6) { this.x = this.snapTo; this.snapTo = null; }
        } else {
          this.x -= this.glide * dt;
        }
      }
      this._wrap();
      this._place();
    }

    // hide the drag cue after the first interaction or 6s
    if (this.cue && !this.cue.classList.contains("is-hidden") && (this.dragDist > 0 || now - this.startedAt > 6000)) {
      this.cue.classList.add("is-hidden");
    }
    this._emit();
    requestAnimationFrame(this._frame);
  };

  Rail.prototype._nearest = function () {
    if (this.mode !== "paged") return this.x;
    return Math.round(this.x / this.step) * this.step;
  };

  Rail.prototype.stepBy = function (dir) {
    this.snapTo = null;
    this.vel = 0;
    this.x -= dir * this.step;
    this._wrap();
    this._place();
    this._emit();
  };

  Rail.prototype._bind = function () {
    var self = this;
    var el = this.scroll;

    // pointer drag ---------------------------------------------------------
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      self.dragging = true;
      self.pointerId = e.pointerId;
      self.lastX = e.clientX;
      self.vel = 0;
      self.dragDist = 0;
      self.snapTo = null;
      self.samples = [];
      el.classList.add("is-dragging");
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    });

    el.addEventListener("pointermove", function (e) {
      if (!self.dragging || e.pointerId !== self.pointerId) return;
      var dx = e.clientX - self.lastX;
      self.lastX = e.clientX;
      self.dragDist += Math.abs(dx);
      self.x += dx;
      self.samples.push({ t: performance.now(), x: e.clientX });
      if (self.samples.length > 6) self.samples.shift();
      self._wrap();
      self._place();
      self._emit();
    });

    function endDrag(e) {
      if (!self.dragging) return;
      self.dragging = false;
      el.classList.remove("is-dragging");
      // velocity from the last ~100ms of movement
      var s = self.samples;
      if (s.length >= 2) {
        var a = s[0], b = s[s.length - 1];
        var dtms = b.t - a.t;
        if (dtms > 0 && dtms < 240) {
          self.vel = ((b.x - a.x) / dtms) * 1000;
          if (Math.abs(self.vel) < 60) self.vel = 0;
        }
      }
      self.samples = [];
      if (!self.vel && self.mode === "paged") self.snapTo = self._nearest();
      // a real drag must not trigger the card button that started it
      if (self.dragDist > 6) {
        self.suppressClick = true;
        setTimeout(function () { self.suppressClick = false; }, 60);
      }
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("lostpointercapture", endDrag);

    // clicking after a drag should not open a product
    el.addEventListener("click", function (e) {
      if (!self.suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      self.suppressClick = false;
    }, true);

    // hover / focus pause --------------------------------------------------
    var shell = el.closest("[data-rail-shell]") || el;
    shell.addEventListener("pointerenter", function () { self.hovering = true; });
    shell.addEventListener("pointerleave", function () { self.hovering = false; });
    el.addEventListener("focusin", function () { self.hovering = true; });
    el.addEventListener("focusout", function () { self.hovering = false; });

    // wheel → horizontal ---------------------------------------------------
    el.addEventListener("wheel", function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        self.snapTo = null;
        self.x -= d;
        self._wrap();
        self._place();
      }
    }, { passive: false });

    // keyboard -------------------------------------------------------------
    el.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { self.stepBy(-1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { self.stepBy(1); e.preventDefault(); }
    });
  };

  /* ======================================================================
     CARD + HOOK MARKUP
     ====================================================================== */
  function stars(r) {
    var full = Math.round(r);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function cardHTML(p, idx, catCode) {
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
    var badge = p.badge ? '<span class="badge">' + p.badge + "</span>" : "";
    var offb = off > 0 ? '<span class="badge badge-hot">−' + off + "%</span>" : "";
    var price = p.was
      ? '<s>' + money(p.was) + "</s> " + money(p.price)
      : money(p.price);
    return (
      '<article class="p-card" data-id="' + p.id + '">' +
        '<div class="p-inner">' +
          '<div class="p-media">' +
            '<img loading="lazy" src="' + BASE + p.img + '" alt="' + p.name + '" />' +
            '<span class="p-badges">' + badge + offb + "</span>" +
            '<span class="p-code">' + (catCode || "") + "/" + pad2(idx + 1) + "</span>" +
            '<div class="p-hover">' +
              '<button type="button" class="p-qv" data-qv="' + p.id + '">QUICK VIEW</button>' +
              '<button type="button" class="p-add" data-add="' + p.id + '">+ ADD</button>' +
            "</div>" +
          "</div>" +
          '<div class="p-body">' +
            '<p class="p-meta">' + p.catLabel + " · MOQ " + p.moq + "</p>" +
            '<h3 class="p-name">' + p.name + "</h3>" +
            '<p class="p-rate"><b>' + p.rating.toFixed(1) + "</b> (" + p.reviews + ") · " + stars(p.rating) + "</p>" +
            '<p class="p-desc">' + p.desc + "</p>" +
            '<p class="p-price">' + price + "</p>" +
            '<a class="p-open" href="/#categories">OPEN ' + p.catLabel + " →</a>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function hookHTML(x) {
    return '<span class="rb-hook" style="left:' + Math.round(x) + 'px"></span>';
  }

  /* ======================================================================
     TABBED RAIL (section 02)
     ====================================================================== */
  var railScroll = $("#railScroll");
  var railTrack = $("#railTrack");
  var railHooks = $("#railHooks");
  var railTabList = $("#railTabs");
  var railBarLabel = $("#railBarLabel");
  var railProgress = $("#railProgress");
  var railCountEl = $("#railCount");
  var railTotalEl = $("#railTotal");
  var railOpenBtn = $("#railOpen");
  var railCue = $("#railCue");
  var activeCat = CATS.length ? CATS[0].slug : "t-shirts";
  var rail = new Rail({
    scroll: railScroll, track: railTrack, hooks: railHooks, mode: "wrap", speed: 26,
    onTick: function (idx, pct) {
      railCountEl.textContent = pad2(idx + 1);
      railProgress.style.width = pct + "%";
      var per = rail.uniqueCount || 1;
      $$(".rb-hook", railHooks).forEach(function (h, i) {
        h.classList.toggle("is-active", (i % per) === idx);
      });
    }
  });
  rail.cue = railCue;

  function railItemsFor(slug) { return ITEMS.filter(function (p) { return p.cat === slug; }); }

  function renderRail(slug) {
    var cat = CATS.filter(function (c) { return c.slug === slug; })[0] || CATS[0];
    var items = railItemsFor(slug);
    if (!cat || !items.length) return;
    activeCat = slug;

    var per = items.length;
    var copies = 2;              // duplicated once → the wrap is seamless
    var html = "";
    for (var c = 0; c < copies; c++) {
      for (var i = 0; i < per; i++) html += cardHTML(items[i], i, cat.code);
    }
    railTrack.innerHTML = html;

    railBarLabel.textContent = "RAIL — " + cat.label.toUpperCase() + " · " + per + " PCS";
    railTotalEl.textContent = pad2(per);
    railCountEl.textContent = "01";
    railOpenBtn.textContent = "OPEN " + cat.label.toUpperCase() + " →";
    railOpenBtn.setAttribute("href", "/#categories");
    railCue.classList.remove("is-hidden");

    // hangers: one per card, both copies — they glide with the same transform
    var hooksHTML = "";
    for (var c2 = 0; c2 < copies * per; c2++) hooksHTML += hookHTML(0);
    railHooks.innerHTML = hooksHTML;

    rail.uniqueCount = per;
    rail.x = 0;
    rail.vel = 0;
    rail.snapTo = null;
    rail._lastIndex = -1;

    // measure + hang the hangers once the browser has laid the new cards out
    requestAnimationFrame(function () { rail.measure(); });
  }

  function buildTabs() {
    railTabList.innerHTML = CATS.map(function (c, i) {
      return '<button type="button" class="tab' + (i === 0 ? " is-on" : "") + '" role="tab" data-slug="' +
        c.slug + '" aria-selected="' + (i === 0) + '">' + c.label.toUpperCase() +
        "<i>" + c.count + "</i></button>";
    }).join("");
    railTabList.addEventListener("click", function (e) {
      var b = e.target.closest(".tab");
      if (!b) return;
      selectTab(b.dataset.slug, true);
    });
  }

  function selectTab(slug, scroll) {
    $$(".tab", railTabList).forEach(function (t) {
      var on = t.dataset.slug === slug;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", String(on));
      if (on && scroll && t.scrollIntoView) {
        t.scrollIntoView({ block: "nearest", inline: "center", behavior: REDUCED ? "auto" : "smooth" });
      }
    });
    renderRail(slug);
  }

  /* ======================================================================
     DRIFT RAIL (section 03) — endless glide, no snapping
     ====================================================================== */
  var driftScroll = $("#driftScroll");
  var driftTrack = $("#driftTrack");
  var driftRail = null;

  function renderDrift() {
    var picks = [];
    CATS.forEach(function (c) {
      var list = railItemsFor(c.slug);
      if (!list.length) return;
      var best = list.filter(function (p) { return p.badge; })[0] || list[0];
      picks.push(best);
    });
    if (!picks.length) return;
    // repeat the set so one copy is comfortably wider than the viewport
    var copies = 3;
    var html = "";
    for (var c = 0; c < copies; c++) {
      picks.forEach(function (p, i) { html += cardHTML(p, i, "AA"); });
    }
    driftTrack.innerHTML = html;
    driftRail = new Rail({
      scroll: driftScroll, track: driftTrack, mode: "wrap", speed: 34,
      uniqueCount: picks.length
    });
    requestAnimationFrame(function () { driftRail.measure(); });
  }

  /* ======================================================================
     SECTION RENDERERS
     ====================================================================== */
  function renderCategories() {
    var grid = $("#catGrid");
    if (!grid) return;
    grid.innerHTML = CATS.map(function (c) {
      var wide = c.slug === "school-uniforms";
      return (
        '<a class="cat-card reveal' + (wide ? " is-wide" : "") + '" href="#rails" data-jump="' + c.slug + '">' +
          "<img loading=\"lazy\" src=\"" + BASE + c.img + "\" alt=\"" + c.label + "\" />" +
          '<span class="cat-tags"><span class="tag">' + c.code + "</span><span class=\"tag\">" +
            c.count + " ITEMS</span></span>" +
          '<span class="cat-foot">' +
            "<span><span class=\"cat-name\">" + c.label + "</span>" +
            "<span class=\"cat-sub\">" + c.note + "</span></span>" +
            '<span class="cat-go">OPEN →</span>' +
          "</span>" +
        "</a>"
      );
    }).join("") +
      '<a class="cat-card is-wide reveal" href="#services">' +
        '<img loading="lazy" src="' + BASE + '/images/s-factory.jpg" alt="Cut and sew production" />' +
        '<span class="cat-tags"><span class="tag">LOOK 03</span><span class="tag">CUT &amp; SEW</span></span>' +
        '<span class="cat-foot">' +
          '<span><span class="cat-name">From tech pack to bulk</span>' +
          '<span class="cat-sub">SAMPLING IN 5–7 DAYS · BULK IN 2–3 WEEKS</span></span>' +
          '<span class="cat-go">SERVICES →</span>' +
        "</span>" +
      "</a>";

    grid.addEventListener("click", function (e) {
      var card = e.target.closest("[data-jump]");
      if (!card) return;
      e.preventDefault();
      selectTab(card.dataset.jump, true);
      var target = $("#rails");
      if (target) target.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
    });
  }

  var SERVICES = [
    { n: "01", t: "DTF Printing", d: "Full-color, no-weeding transfers. Same-day pressing in our Ajman facility — perfect for urgent events, launches & onboarding.", tags: ["SAME-DAY", "NO MINIMUM", "FULL COLOR"] },
    { n: "02", t: "Screen Printing", d: "Silk-screen bulk runs that survive 50+ washes. Best unit economics above 100 pcs with Pantone-matched inks.", tags: ["BULK", "PANTONE", "50+ WASHES"] },
    { n: "03", t: "Sublimation", d: "All-over dye-sub for activewear & jerseys. Zero feel, zero crack — colour lives inside the fabric.", tags: ["ALL-OVER", "SPORTS", "ZERO FEEL"] },
    { n: "04", t: "Embroidery", d: "Flat + 3D puff embroidery for polos, caps & uniforms. Tajima heads, up to 15 colours, 8,000 stitches/min.", tags: ["3D PUFF", "15 COLORS", "UNIFORMS"] },
    { n: "05", t: "Vinyl & Heat Transfer", d: "Names, numbers & single-colour marks. The fastest route for team kits and staff personalization.", tags: ["NAMES", "NUMBERS", "FAST"] },
    { n: "06", t: "Customized Labelling", d: "Woven neck labels, hang tags, size chips & packaging that make a blank garment your brand.", tags: ["WOVEN", "HANG TAGS", "BRANDING"] }
  ];

  function renderServices() {
    var grid = $("#svcGrid");
    if (!grid) return;
    grid.innerHTML = SERVICES.map(function (s, i) {
      return (
        '<article class="svc reveal reveal-d' + ((i % 3) + 1) + '">' +
          '<p class="svc-n">' + s.n + "</p>" +
          "<h3>" + s.t + "</h3>" +
          "<p>" + s.d + "</p>" +
          '<div class="svc-tags">' + s.tags.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>" +
        "</article>"
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
      return (
        '<li class="reveal"><a href="#quote"><span><b>' + it[0] + "</b><strong>" + it[1] +
        "</strong></span><span>FROM AED 32 →</span></a></li>"
      );
    }).join("");
  }

  function renderTicker() {
    var track = $("#tickerTrack");
    if (!track) return;
    var words = ["CUSTOM T-SHIRTS", "POLO SHIRTS", "HOODIES", "UNIFORMS", "CAPS", "DTF PRINTING",
                 "EMBROIDERY", "SUBLIMATION", "SAME-DAY DUBAI"];
    var set = words.map(function (w) { return "<span>" + w + "</span>"; }).join("");
    track.innerHTML = set + set; // two identical halves → seamless -50% loop
  }

  /* ======================================================================
     BAG / QUICK VIEW / FORM
     ====================================================================== */
  var BAG_KEY = "aa-bag-v2";
  var bag = [];
  try { bag = JSON.parse(localStorage.getItem(BAG_KEY) || "[]") || []; } catch (e) { bag = []; }

  function findItem(id) { return ITEMS.filter(function (p) { return p.id === id; })[0]; }
  function bagTotal() {
    return bag.reduce(function (s, r) { var p = findItem(r.id); return s + (p ? p.price * r.qty : 0); }, 0);
  }
  function saveBag() { try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (e) {} }

  function renderBag() {
    var body = $("#bagBody");
    var count = bag.reduce(function (s, r) { return s + r.qty; }, 0);
    var badge = $("#bagCount");
    badge.textContent = count;
    badge.classList.toggle("is-hot", count > 0);
    $("#bagTotal").textContent = money(bagTotal());

    if (!bag.length) {
      body.innerHTML = '<p class="dr-empty">NOTHING ON THE RAIL YET.<br />ADD BLANKS FROM ANY CATEGORY — QUANTITIES ARE CONFIRMED ON WHATSAPP BEFORE PRODUCTION.</p>';
      return;
    }
    body.innerHTML = bag.map(function (r) {
      var p = findItem(r.id);
      if (!p) return "";
      return (
        '<div class="dr-row">' +
          '<img src="' + BASE + p.img + '" alt="' + p.name + '" />' +
          "<span><b>" + p.name + "</b><i>" + p.catLabel + " · MOQ " + p.moq + " · " + money(p.price) + "</i></span>" +
          '<span class="qty"><button type="button" data-dec="' + p.id + '" aria-label="Decrease">−</button>' +
          "<span>" + r.qty + "</span>" +
          '<button type="button" data-inc="' + p.id + '" aria-label="Increase">+</button></span>' +
        "</div>"
      );
    }).join("");
  }

  function addToBag(id, silent) {
    var row = bag.filter(function (r) { return r.id === id; })[0];
    if (row) row.qty += 1; else bag.push({ id: id, qty: 1 });
    saveBag();
    renderBag();
    if (!silent) toast("ADDED — " + (findItem(id) || {}).name + " · REVIEW IN BAG");
  }

  function orderText() {
    if (!bag.length) return "Hello Allegiant Attire! I'd like a quote on your blanks.";
    var lines = bag.map(function (r) {
      var p = findItem(r.id) || {};
      return "• " + p.name + " (" + p.catLabel + ") — " + r.qty + " pcs @ " + money(p.price) + " (MOQ " + p.moq + ")";
    });
    return "Hello Allegiant Attire! RAIL ORDER request:\n" + lines.join("\n") +
      "\n\nEstimated: " + money(bagTotal()) + "\nName: \nPhone: \nDeadline: ";
  }

  function refreshBagLink() {
    $("#bagOrder").setAttribute("href",
      "https://wa.me/" + WA + "?text=" + encodeURIComponent(orderText()));
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
    if (!$("#qv").classList.contains("is-open")) $("#scrim").classList.remove("is-on");
  }

  function quickView(id) {
    var p = findItem(id);
    if (!p) return;
    var off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
    $("#qvCard").innerHTML =
      '<div class="qv-media"><img src="' + BASE + p.img + '" alt="' + p.name + '" /></div>' +
      '<div class="qv-body">' +
        '<button type="button" class="qv-close" id="qvClose" aria-label="Close">✕</button>' +
        '<p class="p-meta">' + p.catLabel + " · SKU " + p.id.toUpperCase() + "</p>" +
        '<h3 class="qv-h">' + p.name + "</h3>" +
        '<p class="p-rate"><b>' + p.rating.toFixed(1) + "</b> (" + p.reviews + " reviews)</p>" +
        '<div class="qv-row"><span class="tag">MOQ ' + p.moq + " PCS</span><span class=\"tag\">" +
          (p.badge || "IN-HOUSE") + "</span>" + (off ? '<span class="tag">−' + off + "% OFF</span>" : "") + "</div>" +
        '<p class="qv-price">' + money(p.price) + (p.was ? "<s>" + money(p.was) + "</s>" : "") + "</p>" +
        '<p class="lede">' + p.desc + "</p>" +
        '<ul class="qv-list">' +
          "<li><span>Print options</span><b>DTF · Screen · Sublimation · Embroidery</b></li>" +
          "<li><span>Labelling</span><b>Woven neck label + size chip</b></li>" +
          "<li><span>Lead time</span><b>Same-day DTF · 2–3 wks bulk</b></li>" +
          "<li><span>Delivery</span><b>Same-day Dubai · 1–2 days UAE</b></li>" +
        "</ul>" +
        '<div class="qv-actions">' +
          '<button type="button" class="btn btn-line" id="qvAdd">+ ADD TO BAG</button>' +
          '<a class="wa-btn" target="_blank" rel="noopener" href="https://wa.me/' + WA + "?text=" +
            encodeURIComponent("Hello Allegiant Attire! I'm interested in " + p.name + " (" + p.catLabel +
              ") — " + money(p.price) + " per pc, MOQ " + p.moq + ". Please send a quote.") + '">WHATSAPP QUOTE</a>' +
        "</div>" +
      "</div>";
    $("#qv").classList.add("is-open");
    $("#qv").setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("is-on");
    $("#qvAdd").addEventListener("click", function () { addToBag(p.id); openBag(); });
    $("#qvClose").addEventListener("click", closeQuickView);
  }

  function closeQuickView() {
    $("#qv").classList.remove("is-open");
    $("#qv").setAttribute("aria-hidden", "true");
    if (!$("#bagDrawer").classList.contains("is-open")) $("#scrim").classList.remove("is-on");
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
     GLOBAL UX
     ====================================================================== */
  function bindGlobal() {
    // delegated card actions
    document.addEventListener("click", function (e) {
      var qv = e.target.closest("[data-qv]");
      if (qv) { quickView(qv.dataset.qv); return; }
      var add = e.target.closest("[data-add]");
      if (add) { addToBag(add.dataset.add); return; }
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
        return;
      }
    });

    $("#bagBtn").addEventListener("click", openBag);
    $("#bagClose").addEventListener("click", closeBag);
    $("#bagClear").addEventListener("click", function () {
      bag = []; saveBag(); renderBag(); refreshBagLink(); toast("BAG CLEARED");
    });
    $("#scrim").addEventListener("click", function () { closeBag(); closeQuickView(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeBag(); closeQuickView(); closeNav(); }
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openBag(); }
    });

    // arrows on the tabbed rail
    var prev = $("[data-rail-prev]"), next = $("[data-rail-next]");
    if (prev) prev.addEventListener("click", function () { if (rail) rail.stepBy(1); });
    if (next) next.addEventListener("click", function () { if (rail) rail.stepBy(-1); });

    // theme
    var savedTheme = null;
    try { savedTheme = localStorage.getItem("aa-theme"); } catch (e) {}
    if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
    $("#themeBtn").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", cur);
      try { localStorage.setItem("aa-theme", cur); } catch (e) {}
    });

    // mobile nav
    $("#burger").addEventListener("click", function () {
      var nav = $("#nav");
      var open = nav.classList.toggle("is-open");
      $("#burger").setAttribute("aria-expanded", String(open));
    });
    function closeNav() {
      $("#nav").classList.remove("is-open");
      $("#burger").setAttribute("aria-expanded", "false");
    }
    $$("#nav a").forEach(function (a) { a.addEventListener("click", closeNav); });

    // header state + scroll progress
    var hdr = $("#hdr"), bar = $("#hdrProgress");
    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      hdr.classList.toggle("is-scrolled", y > 40);
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // footer category jumps
    $$(".ftr-col a[data-jump]").forEach(function (a) {
      a.addEventListener("click", function () { selectTab(a.dataset.jump, false); });
    });

    // quote form → WhatsApp hand-off (same flow as the live store)
    var form = $("#quoteForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = new FormData(form);
        var name = (data.get("name") || "").toString().trim();
        var phone = (data.get("phone") || "").toString().trim();
        var msg = $("#quoteMsg");
        if (!name || !phone) {
          msg.className = "f-note err";
          msg.textContent = "NAME AND PHONE ARE REQUIRED — OR MESSAGE US ON WHATSAPP.";
          return;
        }
        var text = "Hello Allegiant Attire! QUOTE REQUEST:\n" +
          "• Name: " + name + "\n• Phone: " + phone +
          "\n• Need: " + (data.get("need") || "") +
          "\n• Qty / deadline: " + (data.get("qty") || "—") +
          "\n• Notes: " + (data.get("notes") || "—");
        msg.className = "f-note ok";
        msg.textContent = "SENDING ON WHATSAPP — WE REPLY WITHIN 1 BUSINESS HOUR.";
        window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(text), "_blank", "noopener");
      });
    }

    // reveal on scroll
    var reveals = $$(".reveal");
    if ("IntersectionObserver" in window && !REDUCED) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-in"); });
    }

    // animated counters
    var counters = $$("[data-count]");
    function runCounter(el) {
      var target = parseFloat(el.dataset.count);
      var pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
      var dec = (String(el.dataset.count).split(".")[1] || "").length;
      var t0 = null, dur = 1100;
      function tick(now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + (target * eased).toFixed(dec) + suf;
        if (p < 1) requestAnimationFrame(tick);
      }
      if (REDUCED) { el.textContent = pre + target.toFixed(dec) + suf; return; }
      requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { runCounter(en.target); io2.unobserve(en.target); }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { io2.observe(el); });
    } else {
      counters.forEach(runCounter);
    }

    // re-measure the rail after webfonts land / on resize
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (rail) rail.measure(); });
    }
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (rail) { rail.x = -rail.index * rail.step; rail.measure(); }
        if (driftRail) driftRail.measure();
      }, 180);
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  function init() {
    var yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();
    renderTicker();
    renderCategories();
    renderServices();
    renderIndustries();
    buildTabs();
    renderRail(activeCat);
    renderDrift();
    renderBag();
    refreshBagLink();
    bindGlobal();
    // late measure for lazy-loaded imagery / fonts
    setTimeout(function () { if (rail) rail.measure(); if (driftRail) driftRail.measure(); }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
