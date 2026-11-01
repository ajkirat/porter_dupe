import { sizeCm, type VehicleType } from "@/lib/vehicles";

type Dims = Pick<VehicleType, "length_cm" | "width_cm" | "height_cm">;
const ft = (cm: number) => `${Math.round((cm / 30.48) * 10) / 10} ft`;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

// Isometric picture of the cargo space, drawn to scale from the vehicle's real dimensions, with each side labelled.
export default function VehicleDiagram({ v, className = "" }: { v: Dims; className?: string }) {
  const { length_cm: L, width_cm: W, height_cm: H } = v;
  const k = Math.min(175 / ((L + W) * COS), 105 / ((L + W) * SIN + H));
  // x = along the length, y = across the width, z = up. The viewer looks at the corner (L, W, 0).
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * COS * k, (x + y) * SIN * k - z * k];
  const [cx, cy] = [160, 118];
  const mid = P(L / 2, W / 2, H / 2);
  const pt = (x: number, y: number, z: number) => {
    const [px, py] = P(x, y, z);
    return `${(cx + px - mid[0]).toFixed(1)},${(cy + py - mid[1]).toFixed(1)}`;
  };
  const xy = (x: number, y: number, z: number) => pt(x, y, z).split(",").map(Number) as [number, number];

  const poly = (pts: [number, number, number][]) => pts.map((p) => pt(...p)).join(" ");
  const floor = poly([[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]]);
  const back1 = poly([[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]]);
  const back2 = poly([[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]]);
  const front1 = poly([[0, W, 0], [L, W, 0], [L, W, H], [0, W, H]]);
  const front2 = poly([[L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H]]);
  const top = poly([[0, 0, H], [L, 0, H], [L, W, H], [0, W, H]]);

  // Dimension lines run parallel to an edge, pushed outward from the box.
  const off = 16;
  const dim = (a: [number, number, number], b: [number, number, number], dx: number, dy: number, label: string, anchor: "start" | "middle" | "end") => {
    const [x1, y1] = xy(...a);
    const [x2, y2] = xy(...b);
    const [ax, ay, bx, by] = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
    return (
      <g key={label}>
        <line x1={x1} y1={y1} x2={ax} y2={ay} className="stroke-stone-300" strokeWidth={0.6} />
        <line x1={x2} y1={y2} x2={bx} y2={by} className="stroke-stone-300" strokeWidth={0.6} />
        <line x1={ax} y1={ay} x2={bx} y2={by} className="stroke-brand" strokeWidth={1.2} markerStart="url(#vd-tick)" markerEnd="url(#vd-tick)" />
        <text x={(ax + bx) / 2 + dx * 0.3} y={(ay + by) / 2 + dy * 0.3 + 4} textAnchor={anchor} className="fill-stone-800 text-[10px] font-semibold">
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 320 236" className={`w-full ${className}`} role="img" aria-label={`Cargo space ${ft(L)} long, ${ft(W)} wide, ${ft(H)} high (${sizeCm(v)})`}>
      <defs>
        <marker id="vd-tick" markerWidth="4" markerHeight="8" refX="2" refY="4" orient="auto">
          <line x1="2" y1="0" x2="2" y2="8" stroke="#ea580c" strokeWidth="1.2" />
        </marker>
      </defs>
      <polygon points={floor} className="fill-stone-200 stroke-stone-400" strokeWidth={1} />
      <polygon points={back1} className="fill-stone-100 stroke-stone-300" strokeWidth={1} />
      <polygon points={back2} className="fill-stone-100 stroke-stone-300" strokeWidth={1} />
      <polygon points={front1} className="fill-orange-100/60 stroke-stone-500" strokeWidth={1.2} />
      <polygon points={front2} className="fill-orange-200/60 stroke-stone-500" strokeWidth={1.2} />
      <polygon points={top} className="fill-none stroke-stone-500" strokeWidth={1} strokeDasharray="3 2" />
      {dim([0, W, 0], [L, W, 0], -off, off * 0.6, `Length ${ft(L)} · ${L} cm`, "end")}
      {dim([L, W, 0], [L, 0, 0], off, off * 0.6, `Width ${ft(W)} · ${W} cm`, "start")}
      {dim([L, 0, 0], [L, 0, H], off * 1.1, 0, `Height ${ft(H)} · ${H} cm`, "start")}
    </svg>
  );
}
