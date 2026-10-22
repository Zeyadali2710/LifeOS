/* PixelKit — placeholder pixel renderer for LifeOS explorations.
   Everything drawn here is a stand-in for generated sprite/tile assets; bounds and anchors are the contract. */
(function () {
  const HUMAN = ["...hhhh...", "..hhhhhh..", ".hhhhhhhh.", ".hssssssh.", ".sesssses.", ".ssssssss.", "..ssmmss..", "...ssss...", "..cccccc..", ".cccccccc.", "scccddcccs", "scccddcccs", ".cccccccc.", ".pppppppp.", ".pp....pp.", ".oo....oo."];
  const ROBOT = ["....aa....", "..rrrrrr..", ".rrrrrrrr.", ".rvvrrvvr.", ".rvvrrvvr.", ".rrrrrrrr.", "..rrddrr..", "...rrrr...", "..cccccc..", ".cccccccc.", "rcccddcccr", "rcccddcccr", ".cccccccc.", ".pppppppp.", ".pp....pp.", ".oo....oo."];
  const LEAF = ["..l.L..", ".lLlLl.", "lLllLlL", ".lLlLl.", "..lLl..", "...l..."];
  const GL = {
    approval: ["..o..", "..o..", "..o..", ".....", "..o.."],
    failed: ["o...o", ".o.o.", "..o..", ".o.o.", "o...o"],
    paused: [".o.o.", ".o.o.", ".o.o.", ".o.o.", ".o.o."]
  };
  const PAL = {
    day: { bg: "#efe9dd", floorA: "#dacfba", floorB: "#d3c7b0", slabL: "#b9aa8f", slabR: "#a8987d", wallL: "#e6ddcc", wallR: "#efe7da", wallTop: "#cbbfa8", skirt: "#c2b49b", frame: "#8b7a63", glass: "#b9d4da", glass2: "#d5e5e2", board: "#c9a77c", notes: ["#f2d16b", "#e9937a", "#9cc7a4"], deskTop: "#c09265", deskEdge: "#d4a879", deskL: "#94683f", deskR: "#7c5634", monTop: "#4a4640", monR: "#3a3631", kb: "#efe9dc", kbS: "#b9b0a0", soil: "#6b4a33", pot: "#b5643f", potS: "#954f30", leaf: "#6a9a5c", leaf2: "#4a7544", rack: "#5b5f68", rackS: "#474a52", rackTop: "#6c7079", led: "#7fe0a8", ledOff: "#3a3d44", chair: "#6d7d74", chairS: "#56635c", outline: "#2a2420", bubble: "#fffdf6", sel: "#c2462b", hover: "#8b7a63", smoke: "#9c968c",
      screens: { working: "#8fd3c2", working2: "#b5e6da", approval: "#f0c46a", failed: "#e46a55", failed2: "#b9483a", idle: "#6f7f86", paused: "#3d3c3a", offline: "#3d3c3a" },
      glyph: { approval: "#9a5a00", failed: "#b3321f", paused: "#4d473f", working: "#2a2420" } },
    night: { bg: "#121628", floorA: "#2b3152", floorB: "#272c4b", slabL: "#1c2039", slabR: "#171a30", wallL: "#2f3760", wallR: "#38416e", wallTop: "#4c5689", skirt: "#262b4a", frame: "#56609a", glass: "#0b1030", glass2: "#17204d", stars: "#e6e9ff", board: "#434d80", notes: ["#ffd36e", "#ff8fa3", "#7ee0c3"], deskTop: "#6c5c90", deskEdge: "#8574ad", deskL: "#4d4170", deskR: "#3d335c", monTop: "#1b1d2e", monR: "#14162a", kb: "#9890c4", kbS: "#5c5488", soil: "#2a1f2e", pot: "#9a5b8a", potS: "#7a4370", leaf: "#4fbf8f", leaf2: "#2f9a72", rack: "#232744", rackS: "#1a1d36", rackTop: "#2d3256", led: "#6effb9", ledOff: "#2b3050", chair: "#3d4677", chairS: "#2f375f", outline: "#0b0d1a", bubble: "#f3f4ff", sel: "#ffcf5c", hover: "#a8b0e0", smoke: "#6b7099",
      screens: { working: "#6ee7ff", working2: "#b2f4ff", approval: "#ffcf5c", failed: "#ff5d6c", failed2: "#c23a4e", idle: "#3e4a7a", paused: "#1c1f33", offline: "#1c1f33" },
      glyph: { approval: "#9a6a00", failed: "#c22a3c", paused: "#3a3f66", working: "#0b0d1a" } },
    cool: { bg: "#ffffff", floorA: "#e3e7ec", floorB: "#dce1e7", slabL: "#b7bec8", slabR: "#a7afba", wallL: "#e9ecf0", wallR: "#f3f5f7", wallTop: "#c7cdd5", skirt: "#bfc6cf", frame: "#9aa3ae", glass: "#cfe3f1", glass2: "#e1eef6", board: "#d3d9e0", notes: ["#ffcf3d", "#ff7a59", "#58c48c"], deskTop: "#f8f9fb", deskEdge: "#ffffff", deskL: "#d3d8df", deskR: "#c1c7d0", monTop: "#2c3038", monR: "#22262d", kb: "#ffffff", kbS: "#c9ced6", soil: "#5a4535", pot: "#e46b4b", potS: "#c45535", leaf: "#3fa66b", leaf2: "#2d8a55", rack: "#3a3f48", rackS: "#2c3038", rackTop: "#4a505b", led: "#53e08f", ledOff: "#2a2e35", chair: "#38404c", chairS: "#2a313b", outline: "#1d2026", bubble: "#ffffff", sel: "#1d5cff", hover: "#7d8794", smoke: "#9aa1ab",
      screens: { working: "#3fb6ff", working2: "#8fd6ff", approval: "#ffb020", failed: "#ff4d3d", failed2: "#c9352a", idle: "#7d8794", paused: "#4a4f58", offline: "#4a4f58" },
      glyph: { approval: "#a05e00", failed: "#c22a1c", paused: "#3e434c", working: "#1d2026" } }
  };

  function P(L, i, j, z) { return { x: Math.round(L.ox + (i - j) * 16), y: Math.round(L.oy + (i + j) * 8 - (z || 0)) }; }
  function col(ctx, x, y0, y1, c) { if (y1 <= y0) return; ctx.fillStyle = c; ctx.fillRect(x, y0, 1, y1 - y0); }
  function box(ctx, L, i, j, wi, wj, h, z, c) {
    const T = P(L, i, j, z), R = P(L, i + wi, j, z), B = P(L, i + wi, j + wj, z), F = P(L, i, j + wj, z);
    if (h > 0) {
      for (let x = F.x; x < B.x; x++) { const gy = F.y + (x - F.x) / 2; col(ctx, x, Math.round(gy - h), Math.round(gy), c.left); }
      for (let x = B.x; x < R.x; x++) { const gy = B.y - (x - B.x) / 2; col(ctx, x, Math.round(gy - h), Math.round(gy), c.right); }
    }
    for (let x = F.x; x < R.x; x++) {
      const ty = x < T.x ? F.y - (x - F.x) / 2 : T.y + (x - T.x) / 2;
      const by = x < B.x ? F.y + (x - F.x) / 2 : B.y - (x - B.x) / 2;
      col(ctx, x, Math.round(ty - h), Math.round(by - h), c.top);
      if (c.edge) col(ctx, x, Math.round(ty - h), Math.round(ty - h) + 1, c.edge);
    }
  }
  function ring(ctx, L, i, j, wi, wj, color, f, dashed, th) {
    const T = P(L, i, j), R = P(L, i + wi, j), B = P(L, i + wi, j + wj), F = P(L, i, j + wj);
    ctx.fillStyle = color;
    for (let x = F.x; x <= R.x; x++) {
      if (dashed && ((x + f * 2) >> 2) % 3 === 0) continue;
      const ty = x < T.x ? F.y - (x - F.x) / 2 : T.y + (x - T.x) / 2;
      const by = x < B.x ? F.y + (x - F.x) / 2 : B.y - (x - B.x) / 2;
      ctx.fillRect(x, Math.round(ty), 1, th); ctx.fillRect(x, Math.round(by) - th + 1, 1, th);
    }
  }
  function wallSeg(ctx, L, A, Bp, h0, h1, color, stars) {
    const a = P(L, A[0], A[1]), b = P(L, Bp[0], Bp[1]);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    for (let x = x0; x < x1; x++) {
      const t = (x - a.x) / (b.x - a.x || 1), y = a.y + t * (b.y - a.y);
      col(ctx, x, Math.round(y - h1), Math.round(y - h0), color);
      if (stars && (x * 13) % 17 === 0) { ctx.fillStyle = stars; ctx.fillRect(x, Math.round(y - h0 - 3 - ((x * 7) % (h1 - h0 - 5))), 1, 1); }
    }
  }
  function drawSprite(ctx, g, x0, y0, pal) {
    const H = g.length, W = g[0].length;
    const on = (x, y) => y >= 0 && y < H && x >= 0 && x < W && g[y][x] !== ".";
    ctx.fillStyle = pal.o;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { if (!on(x + dx, y + dy)) ctx.fillRect(x0 + x + dx, y0 + y + dy, 1, 1); });
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = g[y][x]; if (c !== "." && pal[c]) { ctx.fillStyle = pal[c]; ctx.fillRect(x0 + x, y0 + y, 1, 1); } }
  }
  function spriteGrid(look, state, f) {
    const robot = look.kind === "robot";
    const g = (robot ? ROBOT : HUMAN).map(r => r.split(""));
    const set = (x, y, c) => { if (g[y] && x >= 0 && x < 10) g[y][x] = c; };
    const hand = robot ? "r" : "s";
    if (!robot) {
      if (look.style === "long") for (let y = 3; y < 8; y++) { set(0, y, "h"); set(9, y, "h"); }
      if (look.style === "cap") { for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) if (g[y][x] === "h") g[y][x] = "k"; set(9, 2, "k"); }
      if (look.style === "curly") { set(2, 0, "h"); set(7, 0, "h"); set(0, 2, "h"); set(9, 2, "h"); set(0, 3, "h"); set(9, 3, "h"); }
      if (look.style === "glasses") { set(1, 4, "g"); set(3, 4, "g"); set(6, 4, "g"); set(8, 4, "g"); }
    }
    if (state === "working") { if (f % 2) set(0, 10, "."); else set(9, 10, "."); }
    else if (state === "approval") { set(9, 10, "."); set(9, 11, "."); set(9, 9, "c"); set(9, 8, hand); set(9, 7, hand); if (f % 2) set(9, 6, hand); }
    else if (state === "failed") { if (!robot) { set(2, 4, "s"); set(7, 4, "s"); set(2, 5, "e"); set(7, 5, "e"); } }
    else if (state === "paused" || state === "offline") { if (!robot) { set(2, 4, "s"); set(7, 4, "s"); set(2, 5, "e"); set(3, 5, "e"); set(6, 5, "e"); set(7, 5, "e"); } }
    else if (state === "idle") { set(9, 10, "w"); set(9, 11, "w"); }
    return g;
  }
  function spritePal(look, P_, state, f) {
    const sc = P_.screens;
    return { o: P_.outline, e: P_.outline, g: P_.outline, h: look.hair, s: look.skin, m: look.mouth || "#a5604f", c: look.shirt, d: look.dark, k: look.dark, p: look.pants || "#2e3040", w: "#f6f2ea", a: "#e46a55", r: look.body || "#9aa6b8",
      v: state === "working" ? (f % 2 ? sc.working2 : sc.working) : state === "failed" ? sc.failed : state === "approval" ? sc.approval : sc.idle };
  }
  function layout(cfg) {
    cfg = cfg || {};
    const n = cfg.count || 9, per = cfg.perRow || 3, si = cfg.stepI || 3, sj = cfg.stepJ || 3;
    const mi = cfg.mi != null ? cfg.mi : 1.5, mj = cfg.mj != null ? cfg.mj : 2;
    const rows = Math.ceil(n / per);
    const W = Math.ceil(mi + (per - 1) * si + 2 + (cfg.padI != null ? cfg.padI : 1.5));
    const D = Math.ceil(mj + (rows - 1) * sj + 1 + (cfg.padJ != null ? cfg.padJ : 1.5));
    const wallH = cfg.walls === false ? 0 : 44, pad = 6;
    const L = { W, D, wallH, ox: D * 16 + pad, oy: pad + wallH + 16 };
    L.w = (W + D) * 16 + pad * 2; L.h = L.oy + (W + D) * 8 + 8 + pad;
    L.stations = [];
    for (let k = 0; k < n; k++) {
      const i = mi + (k % per) * si, j = mj + Math.floor(k / per) * sj, ft = P(L, i + 0.6, j - 0.4);
      L.stations.push({ k, i, j, fx: ft.x, fy: ft.y });
    }
    L.decor = [{ t: "rack", i: W - 1.3, j: 0.3 }, { t: "plant", i: 0.3, j: D - 1.1 }, { t: "plant", i: W - 0.9, j: D - 0.9 }];
    return L;
  }
  function plant(ctx, L, d, P_) {
    box(ctx, L, d.i, d.j, 0.5, 0.5, 5, 0, { top: P_.soil, left: P_.pot, right: P_.potS });
    const c = P(L, d.i + 0.25, d.j + 0.25);
    drawSprite(ctx, LEAF.map(r => r.split("")), c.x - 3, c.y - 12, { o: P_.outline, l: P_.leaf, L: P_.leaf2 });
  }
  function rack(ctx, L, d, P_, f) {
    box(ctx, L, d.i, d.j, 0.9, 0.6, 30, 0, { top: P_.rackTop, left: P_.rack, right: P_.rackS });
    const F = P(L, d.i, d.j + 0.6);
    for (let r = 0; r < 6; r++) for (let q = 0; q < 2; q++) {
      const dx = 2 + q * 4, y = Math.round(F.y + dx / 2 - 5 - r * 4);
      ctx.fillStyle = (f + r + q) % 3 === 0 ? P_.ledOff : P_.led; ctx.fillRect(F.x + dx, y, 1, 1);
    }
  }
  function station(ctx, L, s, a, o, P_, f) {
    const { i, j } = s;
    if (o.selected === a.id) ring(ctx, L, i - 0.5, j - 1.2, 3, 2.6, P_.sel, f, !o.reduced, 2);
    else if (o.hover === a.id) ring(ctx, L, i - 0.5, j - 1.2, 3, 2.6, P_.hover, 0, false, 1);
    if (a.state !== "offline") {
      box(ctx, L, i + 0.35, j - 0.85, 0.5, 0.5, 15, 0, { top: P_.chairS, left: P_.chair, right: P_.chairS });
      drawSprite(ctx, spriteGrid(a.look, a.state, f), s.fx - 5, s.fy - 16, spritePal(a.look, P_, a.state, f));
    } else {
      box(ctx, L, i + 0.35, j - 0.85, 0.5, 0.5, 15, 0, { top: P_.chairS, left: P_.chair, right: P_.chairS });
    }
    box(ctx, L, i, j, 2, 1, 9, 0, { top: P_.deskTop, left: P_.deskL, right: P_.deskR, edge: P_.deskEdge });
    const sc = P_.screens;
    const scr = a.state === "working" ? (f % 2 ? sc.working2 : sc.working) : a.state === "failed" ? (f % 2 ? sc.failed2 : sc.failed) : sc[a.state] || sc.idle;
    box(ctx, L, i + 0.15, j + 0.3, 0.6, 0.2, 8, 9, { top: P_.monTop, left: scr, right: P_.monR });
    box(ctx, L, i + 1, j + 0.35, 0.55, 0.25, 1, 9, { top: P_.kb, left: P_.kbS, right: P_.kbS });
    if (a.state === "failed") {
      const m = P(L, i + 0.45, j + 0.4, 18);
      ctx.fillStyle = P_.smoke;
      for (let k = 0; k < 3; k++) { const up = (f + k * 2) % 6; ctx.fillRect(m.x + ((k + up) % 2) - 1, m.y - up - k, 2, 1); }
    }
  }
  function bubble(ctx, s, a, P_, f, reduced) {
    let gl = GL[a.state];
    if (a.state === "working") { const n = reduced ? 3 : (f % 3) + 1; const row = [0, 1, 2, 3, 4].map(x => (x % 2 === 0 && x / 2 < n) ? "o" : ".").join(""); gl = [".....", ".....", row, ".....", "....."]; }
    if (!gl) return;
    const bob = (!reduced && a.state === "approval" && f % 2) ? 1 : 0;
    const x = s.fx - 4, y = s.fy - 16 - 12 - bob;
    ctx.fillStyle = P_.outline; ctx.fillRect(x, y + 1, 9, 7); ctx.fillRect(x + 1, y, 7, 9); ctx.fillRect(x + 4, y + 9, 1, 1);
    ctx.fillStyle = P_.bubble; ctx.fillRect(x + 1, y + 1, 7, 7); ctx.fillRect(x + 4, y + 8, 1, 1);
    ctx.fillStyle = P_.glyph[a.state] || P_.outline;
    gl.forEach((r, yy) => r.split("").forEach((c, xx) => { if (c === "o") ctx.fillRect(x + 2 + xx, y + 2 + yy, 1, 1); }));
  }
  function drawOffice(ctx, L, o, f) {
    const P_ = PAL[o.palette] || PAL.day;
    ctx.fillStyle = o.bg || P_.bg; ctx.fillRect(0, 0, L.w, L.h);
    box(ctx, L, 0, 0, L.W, L.D, 6, -6, { top: P_.floorA, left: P_.slabL, right: P_.slabR });
    for (let i = 0; i < L.W; i++) for (let j = 0; j < L.D; j++) box(ctx, L, i, j, 1, 1, 0, 0, { top: (i + j) % 2 ? P_.floorA : P_.floorB });
    if (L.wallH) {
      const H = L.wallH;
      wallSeg(ctx, L, [0, L.D], [0, 0], 0, H, P_.wallL); wallSeg(ctx, L, [0, L.D], [0, 0], H, H + 3, P_.wallTop); wallSeg(ctx, L, [0, L.D], [0, 0], 0, 3, P_.skirt);
      wallSeg(ctx, L, [0, 0], [L.W, 0], 0, H, P_.wallR); wallSeg(ctx, L, [0, 0], [L.W, 0], H, H + 3, P_.wallTop); wallSeg(ctx, L, [0, 0], [L.W, 0], 0, 3, P_.skirt);
      for (let a = 1.5; a + 2 < L.W - 1.6; a += 4) {
        wallSeg(ctx, L, [a, 0], [a + 2.2, 0], 13, 37, P_.frame);
        wallSeg(ctx, L, [a + 0.15, 0], [a + 2.05, 0], 15, 35, P_.glass, P_.stars);
        wallSeg(ctx, L, [a + 0.15, 0], [a + 2.05, 0], 15, 21, P_.glass2);
        wallSeg(ctx, L, [a + 1.05, 0], [a + 1.15, 0], 15, 35, P_.frame);
      }
      wallSeg(ctx, L, [0, 2.5], [0, 6], 15, 33, P_.board);
      P_.notes.forEach((n, k) => wallSeg(ctx, L, [0, 2.9 + k * 1.05], [0, 3.6 + k * 1.05], 20 + (k % 2) * 3, 28 + (k % 2) * 3, n));
    }
    const items = [];
    o.agents.forEach((a, k) => { const s = L.stations[k]; if (s) items.push({ d: s.i + s.j + 0.5, fn: () => station(ctx, L, s, a, o, P_, f) }); });
    L.decor.forEach(d => items.push({ d: d.i + d.j, fn: () => d.t === "plant" ? plant(ctx, L, d, P_) : rack(ctx, L, d, P_, f) }));
    items.sort((a, b) => a.d - b.d).forEach(it => it.fn());
    o.agents.forEach((a, k) => { const s = L.stations[k]; if (s) bubble(ctx, s, a, P_, f, o.reduced); });
  }
  const reducedMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const PK = window.PixelKit = {
    PAL, layout, spriteGrid, reducedSystem: () => reducedMQ.matches, reduced: reducedMQ.matches,
    office(el, get) {
      if (!el) return;
      if (el.__pk) { el.__pk.get = get; return; }
      const st = { get, frame: 0, sig: "", seen: false, last: 0 }; el.__pk = st;
      const ctx = el.getContext("2d");
      const loop = ts => {
        if (el.isConnected) st.seen = true; else if (st.seen) return;
        const o = st.get();
        if (o) {
          const L = layout(o.cfg);
          if (el.width !== L.w || el.height !== L.h) { el.width = L.w; el.height = L.h; st.sig = ""; }
          if (!o.reduced && ts - st.last > 260) { st.frame++; st.last = ts; }
          const sig = (o.reduced ? 0 : st.frame) + "|" + o.sig;
          if (sig !== st.sig) { st.sig = sig; ctx.imageSmoothingEnabled = false; drawOffice(ctx, L, o, o.reduced ? 0 : st.frame); }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  };
  let af = 0;
  function paintAvatars() {
    if (!window.LOS) return;
    af++;
    document.querySelectorAll("canvas[data-pk-avatar]").forEach(cv => {
      const a = LOS.agents.find(x => x.id === cv.dataset.pkAvatar); if (!a) return;
      const state = cv.dataset.pkState || a.state, pal = PAL[cv.dataset.pkPal || "day"];
      const anim = !PK.reduced && (state === "working" || state === "approval");
      const key = state + (anim ? af % 2 : "s") + cv.dataset.pkPal + cv.dataset.pkBg;
      if (cv.__k === key) return; cv.__k = key;
      cv.width = 14; cv.height = 14;
      const ctx = cv.getContext("2d"); ctx.clearRect(0, 0, 14, 14);
      if (cv.dataset.pkBg) { ctx.fillStyle = cv.dataset.pkBg; ctx.fillRect(0, 0, 14, 14); }
      const g = spriteGrid(a.look, state, anim ? af : 0).slice(0, 12);
      drawSprite(ctx, g, 2, 1, spritePal(a.look, pal, state, anim ? af : 0));
    });
  }
  setInterval(paintAvatars, 320);
  PK.paintAvatars = paintAvatars;
})();
