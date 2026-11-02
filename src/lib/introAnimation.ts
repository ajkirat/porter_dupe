// The Pikop opening animation: a dashed line forms between two pins while the last P shrinks to the size of "o".
// All letter spacing is measured from the real glyphs, so it looks the same with any bold font.
const NS = "http://www.w3.org/2000/svg";
const FONT = '800 92px Inter, ui-sans-serif, system-ui, Arial, sans-serif';
const BASE = 165, LEFT = 73, DASH = 15, GAPD = 10, EXTRA = 4, PINS = 0.62, DUR = 2800;
const PIN = "M0 -26c-9 0-16 7-16 15 0 11 16 25 16 25s16-14 16-25c0-8-7-15-16-15z";

type Prof = { L: (number | null)[]; R: (number | null)[] };

export function startIntro(svg: SVGSVGElement, onDone: () => void, still = false): () => void {
  let raf = 0;
  let cancelled = false;
  svg.innerHTML = "";
  const mk = (n: string, a: Record<string, string | number>, p?: Element) => {
    const e = document.createElementNS(NS, n);
    for (const k in a) e.setAttribute(k, String(a[k]));
    (p ?? svg).appendChild(e);
    return e;
  };
  const text = (ch: string, x: number, y: number, p?: Element) => {
    const t = mk("text", { x, y, fill: "#ea580c", style: `font:${FONT};letter-spacing:0` }, p);
    t.textContent = ch;
    return t;
  };

  const c = document.createElement("canvas").getContext("2d")!;
  c.font = FONT;
  const m = (ch: string) => {
    const q = c.measureText(ch);
    return { adv: q.width, l: -q.actualBoundingBoxLeft, r: q.actualBoundingBoxRight, asc: q.actualBoundingBoxAscent };
  };
  const I = m("i"), Pm = m("P"), Om = m("o");
  const CAP = Pm.asc, XS = Om.asc / CAP;
  const prof = (ch: string, sc: number): Prof => {
    const cv = document.createElement("canvas");
    cv.width = 240; cv.height = 200;
    const x = cv.getContext("2d")!;
    x.font = FONT; x.fillStyle = "#000"; x.translate(60, 150); x.scale(sc, sc); x.fillText(ch, 0, 0);
    const d = x.getImageData(0, 0, 240, 200).data, L: (number | null)[] = [], R: (number | null)[] = [];
    for (let y = 0; y < 200; y++) {
      let l: number | null = null, r: number | null = null;
      for (let px = 0; px < 240; px++) if (d[(y * 240 + px) * 4 + 3] > 128) { if (l === null) l = px; r = px; }
      L.push(l === null ? null : l - 60); R.push(r === null ? null : r + 1 - 60);
    }
    return { L, R };
  };
  const minGap = (a: Prof, b: Prof, off: number) => {
    let g = 1e9;
    for (let y = 0; y < 200; y++) if (a.R[y] !== null && b.L[y] !== null) g = Math.min(g, off + (b.L[y] as number) - (a.R[y] as number));
    return g;
  };
  const pr = { P: prof("P", 1), i: prof("i", 1), k: prof("k", 1), o: prof("o", 1), Pf: prof("P", XS) };
  const TARGET = minGap(pr.i, pr.k, I.adv) - 5; // the "i" to "k" gap is the rule for every pair
  const offFor = (a: Prof, b: Prof, extra = 0) => {
    let off = 0;
    while (off < 400 && minGap(a, b, off) < TARGET + extra) off++;
    return off;
  };

  let ox = LEFT - Pm.l;
  const firstW = Pm.r - Pm.l;
  for (const [ch, a, b] of [["P", pr.P, pr.i], ["i", pr.i, pr.k], ["k", pr.k, pr.o]] as const) {
    text(ch, ox, BASE);
    ox += offFor(a, b, ch === "k" ? EXTRA : 0);
  }
  text("o", ox, BASE);
  const PX = ox + offFor(pr.o, pr.Pf, 1) + Pm.l; // ink-left of the last P; it stays put while the P shrinks
  const PWI = Pm.r - Pm.l;

  const g = mk("g", {});
  text("P", -Pm.l, 0, g);
  const dashes = Array.from({ length: 14 }, () => mk("path", { fill: "none", stroke: "#ea580c", "stroke-width": 5, "stroke-linecap": "round" }));
  const start = mk("path", { d: PIN, fill: "#ea580c", opacity: 0 });
  const startHole = mk("circle", { r: 6, fill: "#fff", opacity: 0 });
  const pin = mk("path", { d: PIN, fill: "#ea580c", opacity: 0 });
  const hole = mk("circle", { r: 6, fill: "#fff", opacity: 0 });

  const frame = (t: number) => {
    const e = t < 0.1 ? 0 : Math.min(1, (t - 0.1) / 0.8);
    const ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
    const s = 1 - (1 - XS) * ease;
    g.setAttribute("transform", `translate(${PX} ${BASE}) scale(${s})`);
    const sx = LEFT + firstW / 2, ex = PX + (PWI * s) / 2;
    const sy = BASE - CAP - 4 - 26 * PINS, ey = BASE - CAP * s - 4 - 26 * PINS;
    const ax = sx + 14, ay = sy - 2, bx = ex - 14, by = ey - 2, cx = (ax + bx) / 2, cy = Math.min(ay, by) - 60;
    const M = 80, pts: number[][] = [], len = [0];
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      pts.push([(1 - u) * (1 - u) * ax + 2 * u * (1 - u) * cx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * cy + u * u * by]);
      if (i) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const L = len[M];
    const at = (d: number) => {
      let i = 1;
      while (i < M && len[i] < d) i++;
      const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
      return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])];
    };
    const upto = ease * L;
    const n = Math.max(1, Math.round((L + GAPD) / (DASH + GAPD))), dl = (L - (n - 1) * GAPD) / n;
    dashes.forEach((p, k) => {
      const a = k * (dl + GAPD), b = a + dl;
      if (k >= n || e === 0 || a >= upto) { p.setAttribute("d", ""); return; }
      const bb = Math.min(b, upto);
      let d = "";
      for (let j = 0; j <= 6; j++) { const q = at(a + ((bb - a) * j) / 6); d += `${j ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }
      p.setAttribute("d", d);
    });
    const place = (pe: Element, he: Element, tx: number, ty: number, vis: boolean) => {
      pe.setAttribute("transform", `translate(${tx} ${ty - 14 * PINS}) scale(${PINS})`);
      he.setAttribute("transform", `translate(${tx} ${ty - 25 * PINS}) scale(${PINS})`);
      pe.setAttribute("opacity", vis ? "1" : "0"); he.setAttribute("opacity", vis ? "1" : "0");
    };
    place(start, startHole, sx, BASE - CAP - 4, e > 0);
    place(pin, hole, ex, BASE - CAP * s - 4, e >= 1);
  };

  if (still) { frame(1); onDone(); return () => {}; }
  frame(0);
  const t0 = performance.now();
  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - t0) / DUR);
    frame(t);
    if (t < 1) raf = requestAnimationFrame(tick); else onDone();
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(raf); };
}
