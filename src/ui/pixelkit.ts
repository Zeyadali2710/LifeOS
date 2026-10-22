export type AgentState =
  | "working"
  | "approval"
  | "failed"
  | "idle"
  | "paused"
  | "offline";

export type Look =
  | {
      kind?: "human";
      hair: string;
      skin: string;
      shirt: string;
      dark: string;
      style: "short" | "curly" | "long" | "cap" | "glasses";
      mouth?: string;
      pants?: string;
    }
  | {
      kind: "robot";
      body: string;
      shirt: string;
      dark: string;
    };

export type Palette = {
  bg: string;
  floorA: string;
  floorB: string;
  slabL: string;
  slabR: string;
  wallL: string;
  wallR: string;
  wallTop: string;
  skirt: string;
  frame: string;
  glass: string;
  glass2: string;
  stars?: string;
  board: string;
  notes: string[];
  deskTop: string;
  deskEdge: string;
  deskL: string;
  deskR: string;
  monTop: string;
  monR: string;
  kb: string;
  kbS: string;
  soil: string;
  pot: string;
  potS: string;
  leaf: string;
  leaf2: string;
  rack: string;
  rackS: string;
  rackTop: string;
  led: string;
  ledOff: string;
  chair: string;
  chairS: string;
  outline: string;
  bubble: string;
  sel: string;
  hover: string;
  smoke: string;
  screens: Record<AgentState | "working2" | "failed2", string>;
  glyph: Record<"approval" | "failed" | "paused" | "working", string>;
};

export type PaletteName = "day" | "night" | "cool";

export type LayoutConfig = {
  count?: number;
  perRow?: number;
  stepI?: number;
  stepJ?: number;
  mi?: number;
  mj?: number;
  padI?: number;
  padJ?: number;
  walls?: boolean;
};

type Station = {
  k: number;
  i: number;
  j: number;
  fx: number;
  fy: number;
};

type Decor = {
  t: "rack" | "plant";
  i: number;
  j: number;
};

export type Layout = {
  W: number;
  D: number;
  wallH: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  stations: Station[];
  decor: Decor[];
};

export type OfficeAgent = {
  id: string;
  look: Look;
  state: AgentState;
};

export type OfficeOptions = {
  cfg?: LayoutConfig;
  palette?: PaletteName;
  bg?: string;
  agents: OfficeAgent[];
  selected?: string | null;
  hover?: string | null;
  reduced: boolean;
};

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
type SpritePalette = Record<string, string | undefined>;
type BoxColors = {
  top: string;
  left?: string;
  right?: string;
  edge?: string;
};

const HUMAN = [
  "...hhhh...",
  "..hhhhhh..",
  ".hhhhhhhh.",
  ".hssssssh.",
  ".sesssses.",
  ".ssssssss.",
  "..ssmmss..",
  "...ssss...",
  "..cccccc..",
  ".cccccccc.",
  "scccddcccs",
  "scccddcccs",
  ".cccccccc.",
  ".pppppppp.",
  ".pp....pp.",
  ".oo....oo.",
];

const ROBOT = [
  "....aa....",
  "..rrrrrr..",
  ".rrrrrrrr.",
  ".rvvrrvvr.",
  ".rvvrrvvr.",
  ".rrrrrrrr.",
  "..rrddrr..",
  "...rrrr...",
  "..cccccc..",
  ".cccccccc.",
  "rcccddcccr",
  "rcccddcccr",
  ".cccccccc.",
  ".pppppppp.",
  ".pp....pp.",
  ".oo....oo.",
];

const LEAF = [
  "..l.L..",
  ".lLlLl.",
  "lLllLlL",
  ".lLlLl.",
  "..lLl..",
  "...l...",
];

const GL: Partial<Record<AgentState, string[]>> = {
  approval: ["..o..", "..o..", "..o..", ".....", "..o.."],
  failed: ["o...o", ".o.o.", "..o..", ".o.o.", "o...o"],
  paused: [".o.o.", ".o.o.", ".o.o.", ".o.o.", ".o.o."],
};

export const PAL: Record<PaletteName, Palette> = {
  day: {
    bg: "#efe9dd",
    floorA: "#dacfba",
    floorB: "#d3c7b0",
    slabL: "#b9aa8f",
    slabR: "#a8987d",
    wallL: "#e6ddcc",
    wallR: "#efe7da",
    wallTop: "#cbbfa8",
    skirt: "#c2b49b",
    frame: "#8b7a63",
    glass: "#b9d4da",
    glass2: "#d5e5e2",
    board: "#c9a77c",
    notes: ["#f2d16b", "#e9937a", "#9cc7a4"],
    deskTop: "#c09265",
    deskEdge: "#d4a879",
    deskL: "#94683f",
    deskR: "#7c5634",
    monTop: "#4a4640",
    monR: "#3a3631",
    kb: "#efe9dc",
    kbS: "#b9b0a0",
    soil: "#6b4a33",
    pot: "#b5643f",
    potS: "#954f30",
    leaf: "#6a9a5c",
    leaf2: "#4a7544",
    rack: "#5b5f68",
    rackS: "#474a52",
    rackTop: "#6c7079",
    led: "#7fe0a8",
    ledOff: "#3a3d44",
    chair: "#6d7d74",
    chairS: "#56635c",
    outline: "#2a2420",
    bubble: "#fffdf6",
    sel: "#c2462b",
    hover: "#8b7a63",
    smoke: "#9c968c",
    screens: {
      working: "#8fd3c2",
      working2: "#b5e6da",
      approval: "#f0c46a",
      failed: "#e46a55",
      failed2: "#b9483a",
      idle: "#6f7f86",
      paused: "#3d3c3a",
      offline: "#3d3c3a",
    },
    glyph: {
      approval: "#9a5a00",
      failed: "#b3321f",
      paused: "#4d473f",
      working: "#2a2420",
    },
  },
  night: {
    bg: "#121628",
    floorA: "#2b3152",
    floorB: "#272c4b",
    slabL: "#1c2039",
    slabR: "#171a30",
    wallL: "#2f3760",
    wallR: "#38416e",
    wallTop: "#4c5689",
    skirt: "#262b4a",
    frame: "#56609a",
    glass: "#0b1030",
    glass2: "#17204d",
    stars: "#e6e9ff",
    board: "#434d80",
    notes: ["#ffd36e", "#ff8fa3", "#7ee0c3"],
    deskTop: "#6c5c90",
    deskEdge: "#8574ad",
    deskL: "#4d4170",
    deskR: "#3d335c",
    monTop: "#1b1d2e",
    monR: "#14162a",
    kb: "#9890c4",
    kbS: "#5c5488",
    soil: "#2a1f2e",
    pot: "#9a5b8a",
    potS: "#7a4370",
    leaf: "#4fbf8f",
    leaf2: "#2f9a72",
    rack: "#232744",
    rackS: "#1a1d36",
    rackTop: "#2d3256",
    led: "#6effb9",
    ledOff: "#2b3050",
    chair: "#3d4677",
    chairS: "#2f375f",
    outline: "#0b0d1a",
    bubble: "#f3f4ff",
    sel: "#ffcf5c",
    hover: "#a8b0e0",
    smoke: "#6b7099",
    screens: {
      working: "#6ee7ff",
      working2: "#b2f4ff",
      approval: "#ffcf5c",
      failed: "#ff5d6c",
      failed2: "#c23a4e",
      idle: "#3e4a7a",
      paused: "#1c1f33",
      offline: "#1c1f33",
    },
    glyph: {
      approval: "#9a6a00",
      failed: "#c22a3c",
      paused: "#3a3f66",
      working: "#0b0d1a",
    },
  },
  cool: {
    bg: "#ffffff",
    floorA: "#e3e7ec",
    floorB: "#dce1e7",
    slabL: "#b7bec8",
    slabR: "#a7afba",
    wallL: "#e9ecf0",
    wallR: "#f3f5f7",
    wallTop: "#c7cdd5",
    skirt: "#bfc6cf",
    frame: "#9aa3ae",
    glass: "#cfe3f1",
    glass2: "#e1eef6",
    board: "#d3d9e0",
    notes: ["#ffcf3d", "#ff7a59", "#58c48c"],
    deskTop: "#f8f9fb",
    deskEdge: "#ffffff",
    deskL: "#d3d8df",
    deskR: "#c1c7d0",
    monTop: "#2c3038",
    monR: "#22262d",
    kb: "#ffffff",
    kbS: "#c9ced6",
    soil: "#5a4535",
    pot: "#e46b4b",
    potS: "#c45535",
    leaf: "#3fa66b",
    leaf2: "#2d8a55",
    rack: "#3a3f48",
    rackS: "#2c3038",
    rackTop: "#4a505b",
    led: "#53e08f",
    ledOff: "#2a2e35",
    chair: "#38404c",
    chairS: "#2a313b",
    outline: "#1d2026",
    bubble: "#ffffff",
    sel: "#1d5cff",
    hover: "#7d8794",
    smoke: "#9aa1ab",
    screens: {
      working: "#3fb6ff",
      working2: "#8fd6ff",
      approval: "#ffb020",
      failed: "#ff4d3d",
      failed2: "#c9352a",
      idle: "#7d8794",
      paused: "#4a4f58",
      offline: "#4a4f58",
    },
    glyph: {
      approval: "#a05e00",
      failed: "#c22a1c",
      paused: "#3e434c",
      working: "#1d2026",
    },
  },
};

export const LOOKS: Record<string, Look> = {
  orchestrator: {
    hair: "#2a1d16",
    skin: "#e9b98f",
    shirt: "#5b5fc7",
    dark: "#3e41a0",
    style: "short",
  },
  projects: {
    hair: "#a0522d",
    skin: "#f1c7a0",
    shirt: "#d98a2b",
    dark: "#a8641a",
    style: "curly",
  },
  organization: {
    hair: "#1c1a1a",
    skin: "#c68a5e",
    shirt: "#3d9a6b",
    dark: "#2a7350",
    style: "long",
  },
  outreach: {
    hair: "#e0b84f",
    skin: "#f3cfae",
    shirt: "#3b82c4",
    dark: "#2b5f91",
    style: "cap",
  },
  social: {
    hair: "#3a2a4a",
    skin: "#8d5a3b",
    shirt: "#d6538f",
    dark: "#a63a6c",
    style: "long",
  },
  finance: {
    hair: "#6b6b6b",
    skin: "#e3b48b",
    shirt: "#2f6f73",
    dark: "#1f5053",
    style: "glasses",
  },
  knowledge: {
    hair: "#1e2a3a",
    skin: "#d7a27a",
    shirt: "#8a5cc7",
    dark: "#6740a0",
    style: "glasses",
  },
  goals: {
    hair: "#b5442c",
    skin: "#f0c8a8",
    shirt: "#c9a227",
    dark: "#9a7a14",
    style: "curly",
  },
  automations: {
    kind: "robot",
    body: "#9aa6b8",
    shirt: "#6e7a8c",
    dark: "#4f596a",
  },
};

function P(
  L: Pick<Layout, "ox" | "oy">,
  i: number,
  j: number,
  z?: number,
): Point {
  return {
    x: Math.round(L.ox + (i - j) * 16),
    y: Math.round(L.oy + (i + j) * 8 - (z || 0)),
  };
}

function col(
  ctx: CanvasRenderingContext2D,
  x: number,
  y0: number,
  y1: number,
  c: string | undefined,
): void {
  if (y1 <= y0) return;
  if (c !== undefined) ctx.fillStyle = c;
  ctx.fillRect(x, y0, 1, y1 - y0);
}

function box(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  i: number,
  j: number,
  wi: number,
  wj: number,
  h: number,
  z: number,
  c: BoxColors,
): void {
  const T = P(L, i, j, z);
  const R = P(L, i + wi, j, z);
  const B = P(L, i + wi, j + wj, z);
  const F = P(L, i, j + wj, z);

  if (h > 0) {
    for (let x = F.x; x < B.x; x++) {
      const gy = F.y + (x - F.x) / 2;
      col(ctx, x, Math.round(gy - h), Math.round(gy), c.left);
    }
    for (let x = B.x; x < R.x; x++) {
      const gy = B.y - (x - B.x) / 2;
      col(ctx, x, Math.round(gy - h), Math.round(gy), c.right);
    }
  }
  for (let x = F.x; x < R.x; x++) {
    const ty = x < T.x ? F.y - (x - F.x) / 2 : T.y + (x - T.x) / 2;
    const by = x < B.x ? F.y + (x - F.x) / 2 : B.y - (x - B.x) / 2;
    col(ctx, x, Math.round(ty - h), Math.round(by - h), c.top);
    if (c.edge) {
      col(ctx, x, Math.round(ty - h), Math.round(ty - h) + 1, c.edge);
    }
  }
}

function ring(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  i: number,
  j: number,
  wi: number,
  wj: number,
  color: string,
  f: number,
  dashed: boolean,
  th: number,
): void {
  const T = P(L, i, j);
  const R = P(L, i + wi, j);
  const B = P(L, i + wi, j + wj);
  const F = P(L, i, j + wj);
  ctx.fillStyle = color;
  for (let x = F.x; x <= R.x; x++) {
    if (dashed && ((x + f * 2) >> 2) % 3 === 0) continue;
    const ty = x < T.x ? F.y - (x - F.x) / 2 : T.y + (x - T.x) / 2;
    const by = x < B.x ? F.y + (x - F.x) / 2 : B.y - (x - B.x) / 2;
    ctx.fillRect(x, Math.round(ty), 1, th);
    ctx.fillRect(x, Math.round(by) - th + 1, 1, th);
  }
}

function wallSeg(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  A: readonly [number, number],
  Bp: readonly [number, number],
  h0: number,
  h1: number,
  color: string,
  stars?: string,
): void {
  const a = P(L, A[0], A[1]);
  const b = P(L, Bp[0], Bp[1]);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  for (let x = x0; x < x1; x++) {
    const t = (x - a.x) / (b.x - a.x || 1);
    const y = a.y + t * (b.y - a.y);
    col(ctx, x, Math.round(y - h1), Math.round(y - h0), color);
    if (stars && (x * 13) % 17 === 0) {
      ctx.fillStyle = stars;
      ctx.fillRect(
        x,
        Math.round(y - h0 - 3 - ((x * 7) % (h1 - h0 - 5))),
        1,
        1,
      );
    }
  }
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  g: string[][],
  x0: number,
  y0: number,
  pal: SpritePalette,
): void {
  const H = g.length;
  const W = g[0]?.length ?? 0;
  const on = (x: number, y: number): boolean =>
    y >= 0 && y < H && x >= 0 && x < W && g[y]?.[x] !== ".";

  if (pal.o !== undefined) ctx.fillStyle = pal.o;
  const neighbors: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (on(x, y)) {
        neighbors.forEach(([dx, dy]) => {
          if (!on(x + dx, y + dy)) {
            ctx.fillRect(x0 + x + dx, y0 + y + dy, 1, 1);
          }
        });
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y]?.[x];
      const color = c !== undefined && c !== "." ? pal[c] : undefined;
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  }
}

function spriteGrid(look: Look, state: AgentState, f: number): string[][] {
  const robot = look.kind === "robot";
  const g = (robot ? ROBOT : HUMAN).map((r) => r.split(""));
  const set = (x: number, y: number, c: string): void => {
    const row = g[y];
    if (row && x >= 0 && x < 10) row[x] = c;
  };
  const hand = robot ? "r" : "s";

  if (look.kind !== "robot") {
    if (look.style === "long") {
      for (let y = 3; y < 8; y++) {
        set(0, y, "h");
        set(9, y, "h");
      }
    }
    if (look.style === "cap") {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 10; x++) {
          if (g[y]?.[x] === "h") set(x, y, "k");
        }
      }
      set(9, 2, "k");
    }
    if (look.style === "curly") {
      set(2, 0, "h");
      set(7, 0, "h");
      set(0, 2, "h");
      set(9, 2, "h");
      set(0, 3, "h");
      set(9, 3, "h");
    }
    if (look.style === "glasses") {
      set(1, 4, "g");
      set(3, 4, "g");
      set(6, 4, "g");
      set(8, 4, "g");
    }
  }

  if (state === "working") {
    if (f % 2) set(0, 10, ".");
    else set(9, 10, ".");
  } else if (state === "approval") {
    set(9, 10, ".");
    set(9, 11, ".");
    set(9, 9, "c");
    set(9, 8, hand);
    set(9, 7, hand);
    if (f % 2) set(9, 6, hand);
  } else if (state === "failed") {
    if (!robot) {
      set(2, 4, "s");
      set(7, 4, "s");
      set(2, 5, "e");
      set(7, 5, "e");
    }
  } else if (state === "paused" || state === "offline") {
    if (!robot) {
      set(2, 4, "s");
      set(7, 4, "s");
      set(2, 5, "e");
      set(3, 5, "e");
      set(6, 5, "e");
      set(7, 5, "e");
    }
  } else if (state === "idle") {
    set(9, 10, "w");
    set(9, 11, "w");
  }
  return g;
}

function spritePal(
  look: Look,
  palette: Palette,
  state: AgentState,
  f: number,
): SpritePalette {
  const sc = palette.screens;
  return {
    o: palette.outline,
    e: palette.outline,
    g: palette.outline,
    h: look.kind === "robot" ? undefined : look.hair,
    s: look.kind === "robot" ? undefined : look.skin,
    m: (look.kind === "robot" ? undefined : look.mouth) || "#a5604f",
    c: look.shirt,
    d: look.dark,
    k: look.dark,
    p: (look.kind === "robot" ? undefined : look.pants) || "#2e3040",
    w: "#f6f2ea",
    a: "#e46a55",
    r: (look.kind === "robot" ? look.body : undefined) || "#9aa6b8",
    v:
      state === "working"
        ? f % 2
          ? sc.working2
          : sc.working
        : state === "failed"
          ? sc.failed
          : state === "approval"
            ? sc.approval
            : sc.idle,
  };
}

export function layout(cfg: LayoutConfig = {}): Layout {
  const n = cfg.count || 9;
  const per = cfg.perRow || 3;
  const si = cfg.stepI || 3;
  const sj = cfg.stepJ || 3;
  const mi = cfg.mi != null ? cfg.mi : 1.5;
  const mj = cfg.mj != null ? cfg.mj : 2;
  const rows = Math.ceil(n / per);
  const W = Math.ceil(
    mi + (per - 1) * si + 2 + (cfg.padI != null ? cfg.padI : 1.5),
  );
  const D = Math.ceil(
    mj + (rows - 1) * sj + 1 + (cfg.padJ != null ? cfg.padJ : 1.5),
  );
  const wallH = cfg.walls === false ? 0 : 44;
  const pad = 6;
  const oy = pad + wallH + 16;
  const L: Layout = {
    W,
    D,
    wallH,
    ox: D * 16 + pad,
    oy,
    w: (W + D) * 16 + pad * 2,
    h: oy + (W + D) * 8 + 8 + pad,
    stations: [],
    decor: [],
  };

  for (let k = 0; k < n; k++) {
    const i = mi + (k % per) * si;
    const j = mj + Math.floor(k / per) * sj;
    const ft = P(L, i + 0.6, j - 0.4);
    L.stations.push({ k, i, j, fx: ft.x, fy: ft.y });
  }
  L.decor = [
    { t: "rack", i: W - 1.3, j: 0.3 },
    { t: "plant", i: 0.3, j: D - 1.1 },
    { t: "plant", i: W - 0.9, j: D - 0.9 },
  ];
  return L;
}

export function stationAt(L: Layout, k: number): Point {
  const s = L.stations.find((station) => station.k === k);
  if (!s) throw new RangeError(`Unknown station: ${k}`);
  return { x: s.fx, y: s.fy };
}

export function stationBounds(L: Layout, k: number): Rect {
  const foot = stationAt(L, k);
  const x = Math.max(0, Math.min(L.w, foot.x - 40));
  const y = Math.max(0, Math.min(L.h, foot.y - 34));
  const right = Math.max(0, Math.min(L.w, foot.x + 40));
  const bottom = Math.max(0, Math.min(L.h, foot.y + 22));
  return { x, y, w: right - x, h: bottom - y };
}

function plant(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  d: Decor,
  palette: Palette,
): void {
  box(ctx, L, d.i, d.j, 0.5, 0.5, 5, 0, {
    top: palette.soil,
    left: palette.pot,
    right: palette.potS,
  });
  const c = P(L, d.i + 0.25, d.j + 0.25);
  drawSprite(
    ctx,
    LEAF.map((r) => r.split("")),
    c.x - 3,
    c.y - 12,
    { o: palette.outline, l: palette.leaf, L: palette.leaf2 },
  );
}

function rack(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  d: Decor,
  palette: Palette,
  f: number,
): void {
  box(ctx, L, d.i, d.j, 0.9, 0.6, 30, 0, {
    top: palette.rackTop,
    left: palette.rack,
    right: palette.rackS,
  });
  const F = P(L, d.i, d.j + 0.6);
  for (let r = 0; r < 6; r++) {
    for (let q = 0; q < 2; q++) {
      const dx = 2 + q * 4;
      const y = Math.round(F.y + dx / 2 - 5 - r * 4);
      ctx.fillStyle = (f + r + q) % 3 === 0 ? palette.ledOff : palette.led;
      ctx.fillRect(F.x + dx, y, 1, 1);
    }
  }
}

function station(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  s: Station,
  a: OfficeAgent,
  o: OfficeOptions,
  palette: Palette,
  f: number,
): void {
  const { i, j } = s;
  if (o.selected === a.id) {
    ring(ctx, L, i - 0.5, j - 1.2, 3, 2.6, palette.sel, f, !o.reduced, 2);
  } else if (o.hover === a.id) {
    ring(ctx, L, i - 0.5, j - 1.2, 3, 2.6, palette.hover, 0, false, 1);
  }

  box(ctx, L, i + 0.35, j - 0.85, 0.5, 0.5, 15, 0, {
    top: palette.chairS,
    left: palette.chair,
    right: palette.chairS,
  });
  if (a.state !== "offline") {
    drawSprite(
      ctx,
      spriteGrid(a.look, a.state, f),
      s.fx - 5,
      s.fy - 16,
      spritePal(a.look, palette, a.state, f),
    );
  }
  box(ctx, L, i, j, 2, 1, 9, 0, {
    top: palette.deskTop,
    left: palette.deskL,
    right: palette.deskR,
    edge: palette.deskEdge,
  });

  const sc = palette.screens;
  const scr =
    a.state === "working"
      ? f % 2
        ? sc.working2
        : sc.working
      : a.state === "failed"
        ? f % 2
          ? sc.failed2
          : sc.failed
        : sc[a.state] || sc.idle;

  box(ctx, L, i + 0.15, j + 0.3, 0.6, 0.2, 8, 9, {
    top: palette.monTop,
    left: scr,
    right: palette.monR,
  });
  box(ctx, L, i + 1, j + 0.35, 0.55, 0.25, 1, 9, {
    top: palette.kb,
    left: palette.kbS,
    right: palette.kbS,
  });

  if (a.state === "failed") {
    const m = P(L, i + 0.45, j + 0.4, 18);
    ctx.fillStyle = palette.smoke;
    for (let k = 0; k < 3; k++) {
      const up = (f + k * 2) % 6;
      ctx.fillRect(m.x + ((k + up) % 2) - 1, m.y - up - k, 2, 1);
    }
  }
}

function bubble(
  ctx: CanvasRenderingContext2D,
  s: Station,
  a: OfficeAgent,
  palette: Palette,
  f: number,
  reduced: boolean,
): void {
  let gl = GL[a.state];
  if (a.state === "working") {
    const n = reduced ? 3 : (f % 3) + 1;
    const row = [0, 1, 2, 3, 4]
      .map((x) => (x % 2 === 0 && x / 2 < n ? "o" : "."))
      .join("");
    gl = [".....", ".....", row, ".....", "....."];
  }
  if (!gl) return;

  const bob = !reduced && a.state === "approval" && f % 2 ? 1 : 0;
  const x = s.fx - 4;
  const y = s.fy - 16 - 12 - bob;

  ctx.fillStyle = palette.outline;
  ctx.fillRect(x, y + 1, 9, 7);
  ctx.fillRect(x + 1, y, 7, 9);
  ctx.fillRect(x + 4, y + 9, 1, 1);
  ctx.fillStyle = palette.bubble;
  ctx.fillRect(x + 1, y + 1, 7, 7);
  ctx.fillRect(x + 4, y + 8, 1, 1);

  ctx.fillStyle =
    a.state === "working" ||
    a.state === "approval" ||
    a.state === "failed" ||
    a.state === "paused"
      ? palette.glyph[a.state] || palette.outline
      : palette.outline;

  gl.forEach((r, yy) =>
    r.split("").forEach((c, xx) => {
      if (c === "o") ctx.fillRect(x + 2 + xx, y + 2 + yy, 1, 1);
    }),
  );
}

export function drawOffice(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  opts: OfficeOptions,
  frame: number,
): void {
  const palette = PAL[opts.palette ?? "day"] || PAL.day;
  ctx.fillStyle = opts.bg || palette.bg;
  ctx.fillRect(0, 0, L.w, L.h);

  box(ctx, L, 0, 0, L.W, L.D, 6, -6, {
    top: palette.floorA,
    left: palette.slabL,
    right: palette.slabR,
  });
  for (let i = 0; i < L.W; i++) {
    for (let j = 0; j < L.D; j++) {
      box(ctx, L, i, j, 1, 1, 0, 0, {
        top: (i + j) % 2 ? palette.floorA : palette.floorB,
      });
    }
  }

  if (L.wallH) {
    const H = L.wallH;
    wallSeg(ctx, L, [0, L.D], [0, 0], 0, H, palette.wallL);
    wallSeg(ctx, L, [0, L.D], [0, 0], H, H + 3, palette.wallTop);
    wallSeg(ctx, L, [0, L.D], [0, 0], 0, 3, palette.skirt);
    wallSeg(ctx, L, [0, 0], [L.W, 0], 0, H, palette.wallR);
    wallSeg(ctx, L, [0, 0], [L.W, 0], H, H + 3, palette.wallTop);
    wallSeg(ctx, L, [0, 0], [L.W, 0], 0, 3, palette.skirt);

    for (let a = 1.5; a + 2 < L.W - 1.6; a += 4) {
      wallSeg(ctx, L, [a, 0], [a + 2.2, 0], 13, 37, palette.frame);
      wallSeg(
        ctx,
        L,
        [a + 0.15, 0],
        [a + 2.05, 0],
        15,
        35,
        palette.glass,
        palette.stars,
      );
      wallSeg(
        ctx,
        L,
        [a + 0.15, 0],
        [a + 2.05, 0],
        15,
        21,
        palette.glass2,
      );
      wallSeg(
        ctx,
        L,
        [a + 1.05, 0],
        [a + 1.15, 0],
        15,
        35,
        palette.frame,
      );
    }

    wallSeg(ctx, L, [0, 2.5], [0, 6], 15, 33, palette.board);
    palette.notes.forEach((n, k) =>
      wallSeg(
        ctx,
        L,
        [0, 2.9 + k * 1.05],
        [0, 3.6 + k * 1.05],
        20 + (k % 2) * 3,
        28 + (k % 2) * 3,
        n,
      ),
    );
  }

  const items: { d: number; fn: () => void }[] = [];
  opts.agents.forEach((a, k) => {
    const s = L.stations[k];
    if (s) {
      items.push({
        d: s.i + s.j + 0.5,
        fn: () => station(ctx, L, s, a, opts, palette, frame),
      });
    }
  });
  L.decor.forEach((d) =>
    items.push({
      d: d.i + d.j,
      fn: () =>
        d.t === "plant"
          ? plant(ctx, L, d, palette)
          : rack(ctx, L, d, palette, frame),
    }),
  );
  items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());

  opts.agents.forEach((a, k) => {
    const s = L.stations[k];
    if (s) bubble(ctx, s, a, palette, frame, opts.reduced);
  });
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  look: Look,
  state: AgentState,
  frame: number,
  bg?: string,
): void {
  ctx.canvas.width = 14;
  ctx.canvas.height = 14;
  ctx.clearRect(0, 0, 14, 14);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 14, 14);
  }
  drawSprite(
    ctx,
    spriteGrid(look, state, frame).slice(0, 12),
    2,
    1,
    spritePal(look, PAL.day, state, frame),
  );
}

type OfficeGetter = () => (OfficeOptions & { sig: string }) | null;
type OfficeMount = {
  get: OfficeGetter;
  stop: () => void;
};

const mounts = new WeakMap<HTMLCanvasElement, OfficeMount>();

export function mountOffice(
  canvas: HTMLCanvasElement,
  get: OfficeGetter,
): () => void {
  const existing = mounts.get(canvas);
  if (existing) {
    existing.get = get;
    return existing.stop;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let frame = 0;
  let sig = "";
  let seen = false;
  let last = 0;
  let raf = 0;
  let stopped = false;

  const mount: OfficeMount = {
    get,
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.cancelAnimationFrame(raf);
      if (mounts.get(canvas) === mount) mounts.delete(canvas);
    },
  };

  const loop = (ts: number): void => {
    if (stopped) return;
    if (canvas.isConnected) {
      seen = true;
    } else if (seen) {
      mount.stop();
      return;
    }

    const opts = mount.get();
    if (stopped) return;

    if (opts) {
      const L = layout(opts.cfg);
      if (canvas.width !== L.w || canvas.height !== L.h) {
        canvas.width = L.w;
        canvas.height = L.h;
        sig = "";
      }
      if (!opts.reduced && ts - last > 260) {
        frame++;
        last = ts;
      }
      const nextSig = `${opts.reduced ? 0 : frame}|${opts.sig}`;
      if (nextSig !== sig) {
        sig = nextSig;
        ctx.imageSmoothingEnabled = false;
        drawOffice(ctx, L, opts, opts.reduced ? 0 : frame);
      }
    }
    raf = window.requestAnimationFrame(loop);
  };

  mounts.set(canvas, mount);
  raf = window.requestAnimationFrame(loop);
  return mount.stop;
}
