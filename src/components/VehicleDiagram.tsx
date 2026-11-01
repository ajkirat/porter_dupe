import { sizeCm, type VehicleType } from "@/lib/vehicles";

type Dims = Pick<VehicleType, "length_cm" | "width_cm" | "height_cm">;
const ft = (cm: number) => `${Math.max(1, Math.round(cm / 30.48))} ft`;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

// Body parts around the cargo space, in cm: cab length, cab height, floor height of the load area, wheel radius.
const BODY: Record<string, { cab: number; cabH: number; floor: number; r: number }> = {
  three_wheeler: { cab: 95, cabH: 150, floor: 40, r: 27 },
  tata_ace: { cab: 120, cabH: 160, floor: 55, r: 32 },
  pickup_8ft: { cab: 135, cabH: 170, floor: 62, r: 36 },
};

// Isometric picture of the vehicle with its load area drawn to scale from the real dimensions, each side labelled.
// x runs along the length (front of the vehicle at x < 0), y across the width, z up. The viewer looks at the corner (L, W, 0).
export default function VehicleDiagram({ v, code = "tata_ace", className = "" }: { v: Dims; code?: string; className?: string }) {
  const { length_cm: L, width_cm: W, height_cm: H } = v;
  const bike = code === "bike";
  const b = BODY[code] ?? BODY.tata_ace;
  const floor = bike ? 62 : b.floor;
  const front = bike ? 110 : b.cab; // how far the vehicle sticks out ahead of the load area
  const totalL = L + front;
  const top = Math.max(floor + H, bike ? 100 : b.cabH);
  // One shared scale for every vehicle, sized so the biggest standard truck fills the picture. A bike is therefore drawn small.
  const span = (l: number, w: number, h: number, k: number, f: number) => {
    const corners = [-f, l - f].flatMap((x) => [0, w + 20].flatMap((y) => [0, h].map((z) => [(x - y) * COS * k, (x + y) * SIN * k - z * k])));
    const cxs = corners.map((c) => c[0]);
    const cys = corners.map((c) => c[1]);
    return { minX: Math.min(...cxs), maxX: Math.max(...cxs), minY: Math.min(...cys), maxY: Math.max(...cys) };
  };
  const fitFor = (l: number, w: number, h: number, f: number) => {
    const u = span(l, w, h, 1, f);
    return Math.min(285 / (u.maxX - u.minX), 205 / (u.maxY - u.minY));
  };
  const k = Math.min(fitFor(380, 160, 175, 135), fitFor(totalL, W, top, front));
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * COS * k, (x + y) * SIN * k - z * k];
  const box0 = span(totalL, W, top, k, front);
  const [ox, oy] = [165 - (box0.minX + box0.maxX) / 2, 112 - (box0.minY + box0.maxY) / 2];
  const pt = (x: number, y: number, z: number): [number, number] => {
    const [px, py] = P(x, y, z);
    return [ox + px, oy + py];
  };
  const str = (pts: [number, number, number][]) => pts.map((p) => pt(...p).join(",")).join(" ");

  // One box: the three faces a viewer can see (side along y = max, end along x = max, top).
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fills: [string, string, string], key: string) => (
    <g key={key} strokeLinejoin="round">
      <polygon points={str([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} className={`${fills[0]} stroke-stone-600`} strokeWidth={1} />
      <polygon points={str([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]])} className={`${fills[1]} stroke-stone-600`} strokeWidth={1} />
      <polygon points={str([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])} className={`${fills[2]} stroke-stone-600`} strokeWidth={1} />
    </g>
  );
  // A wheel standing in the plane y = yy (seen from the side).
  const wheel = (xc: number, yy: number, r: number, key: string) => {
    const ring = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      return pt(xc + r * Math.cos(a), yy, r + r * Math.sin(a)).join(",");
    }).join(" ");
    const hub = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return pt(xc + r * 0.4 * Math.cos(a), yy, r + r * 0.4 * Math.sin(a)).join(",");
    }).join(" ");
    return (
      <g key={key}>
        <polygon points={ring} className="fill-stone-800 stroke-stone-900" strokeWidth={1} />
        <polygon points={hub} className="fill-stone-300" />
      </g>
    );
  };

  const parts: React.ReactNode[] = [];
  if (!bike) {
    // Cab ahead of the load area, with a side window; wheels sit under the cab and under the rear of the load area.
    parts.push(box(-front, 0, 0, W, floor * 0.6, b.cabH, ["fill-sky-100", "fill-sky-200", "fill-sky-50"], "cab"));
    parts.push(
      <polygon key="win" points={str([[-front + 14, W, b.cabH * 0.58], [-14, W, b.cabH * 0.58], [-14, W, b.cabH * 0.9], [-front + 14, W, b.cabH * 0.9]])} className="fill-sky-300 stroke-stone-500" strokeWidth={0.8} />,
    );
    parts.push(box(0, L, 0, W, floor - 6, floor, ["fill-stone-400", "fill-stone-500", "fill-stone-300"], "bed"));
  } else {
    // Bike: carrier box on the rear rack, seat, handlebar and two wheels in the mid plane.
    const yM = W / 2;
    parts.push(box(-front + 20, 0, yM - 8, yM + 8, 0, 0.1, ["fill-none", "fill-none", "fill-none"], "gap"));
  }

  // Load area walls (open top), drawn translucent so the inside shows.
  const wallFills: [string, string, string] = ["fill-orange-100/70", "fill-orange-200/70", "fill-orange-50/30"];
  const wallsKey = "walls";
  const bedBox = box(0, L, 0, W, floor, floor + H, wallFills, wallsKey);

  const line = (a: [number, number, number], c: [number, number, number], w = 3) => {
    const [x1, y1] = pt(...a);
    const [x2, y2] = pt(...c);
    return <line key={`${a}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-stone-700" strokeWidth={w} strokeLinecap="round" />;
  };

  // Dimension lines run parallel to an edge, pushed outward from the load area.
  const off = 16;
  const dim = (a: [number, number, number], c: [number, number, number], dx: number, dy: number, label: string, anchor: "start" | "end") => {
    const [x1, y1] = pt(...a);
    const [x2, y2] = pt(...c);
    const [ax, ay, bx, by] = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
    return (
      <g key={label}>
        <line x1={x1} y1={y1} x2={ax} y2={ay} className="stroke-stone-300" strokeWidth={0.6} />
        <line x1={x2} y1={y2} x2={bx} y2={by} className="stroke-stone-300" strokeWidth={0.6} />
        <line x1={ax} y1={ay} x2={bx} y2={by} className="stroke-brand" strokeWidth={1.3} markerStart="url(#vd-tick)" markerEnd="url(#vd-tick)" />
        <text x={(ax + bx) / 2 + (anchor === "end" ? -4 : 4)} y={(ay + by) / 2 + 12} textAnchor={anchor} className="fill-stone-800 text-[10px] font-semibold">
          {label}
        </text>
      </g>
    );
  };

  const yM = W / 2;
  const rr = bike ? 30 : b.r;
  const wheels: React.ReactNode[] = [];
  const rearX = bike ? L / 2 : L * 0.72;
  const frontX = bike ? L / 2 - 110 : -front * 0.5;
  if (code === "three_wheeler") {
    wheels.push(wheel(-front * 0.5, yM, rr, "wf")); // single front wheel
    wheels.push(wheel(rearX, W, rr, "wr"));
  } else if (bike) {
    wheels.push(wheel(frontX, yM, rr, "wf"), wheel(rearX, yM, rr, "wr"));
  } else {
    wheels.push(wheel(frontX, W, rr, "wf"), wheel(rearX, W, rr, "wr"));
  }
  const bikeFrame = bike
    ? [
        line([rearX, yM, rr], [rearX - 45, yM, 82], 4), // rear fork to seat
        line([rearX - 45, yM, 82], [frontX + 15, yM, 70], 4), // top tube
        line([frontX + 15, yM, 70], [frontX, yM, rr], 3), // front fork
        line([frontX + 15, yM, 70], [frontX + 5, yM, 105], 3), // steering column
        line([frontX + 5, 0, 105], [frontX + 5, W, 105], 3), // handlebar
        line([rearX - 62, yM, 86], [rearX - 30, yM, 86], 6), // seat
      ]
    : [];

  return (
    <svg viewBox="0 0 420 250" className={`w-full ${className}`} role="img" aria-label={`Load area ${ft(L)} long, ${ft(W)} wide, ${ft(H)} high (${sizeCm(v)})`}>
      <defs>
        <marker id="vd-tick" markerWidth="4" markerHeight="8" refX="2" refY="4" orient="auto">
          <line x1="2" y1="0" x2="2" y2="8" stroke="#ea580c" strokeWidth="1.3" />
        </marker>
      </defs>
      {parts}
      {bikeFrame}
      {bedBox}
      {wheels}
      {dim([0, W, floor], [L, W, floor], -off, off * 0.75, `Length ${ft(L)} · ${L} cm`, "end")}
      {dim([L, W, floor], [L, 0, floor], off, off * 0.75, `Width ${ft(W)} · ${W} cm`, "start")}
      {dim([L, 0, floor], [L, 0, floor + H], off * 1.1, 0, `Height ${ft(H)} · ${H} cm`, "start")}
    </svg>
  );
}
