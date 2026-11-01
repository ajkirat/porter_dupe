import { sizeCm, type VehicleType } from "@/lib/vehicles";

type Dims = Pick<VehicleType, "length_cm" | "width_cm" | "height_cm">;
const ft = (cm: number) => `${Math.max(1, Math.round(cm / 30.48))} ft`;

const INK = "#44403c";
const WHEEL = "#292524";
const ACCENT = "#ea580c";
const CAB = "#e0f2fe";
const GLASS = "#7dd3fc";
const LOAD = "rgba(254,215,170,0.7)";

// Truck-like bodies: cab length, cab roof height, floor height of the load area, wheel radius (all cm).
const BODY: Record<string, { cab: number; cabH: number; floor: number; r: number }> = {
  three_wheeler: { cab: 100, cabH: 150, floor: 42, r: 26 },
  tata_ace: { cab: 125, cabH: 160, floor: 56, r: 31 },
  pickup_8ft: { cab: 140, cabH: 170, floor: 64, r: 35 },
};
// A motorcycle with a delivery box on the rear carrier: wheel radius, wheelbase, carrier height.
const BIKE = { r: 30, wheelbase: 135, rack: 78 };
const REF = { len: 244 + 140 + 6, h: 175, w: 160 }; // the biggest standard vehicle sets the shared scale

// Side view and top view of the vehicle, both drawn to one shared scale from the real load-area size, with each side labelled.
export default function VehicleDiagram({ v, code = "tata_ace", className = "" }: { v: Dims; code?: string; className?: string }) {
  const { length_cm: L, width_cm: W, height_cm: H } = v;
  const bike = code === "bike";
  const b = BODY[code] ?? BODY.tata_ace;
  const floor = bike ? BIKE.rack : b.floor;
  const ahead = bike ? BIKE.wheelbase - L / 2 + BIKE.r + 12 : b.cab; // how far the vehicle reaches in front of the load area
  const totalL = L + ahead;
  const topZ = Math.max(floor + H, bike ? 118 : b.cabH);

  const area = (len: number, h: number, w: number) => ({ w: 330 / len, h: 230 / (h + w + 70) });
  const kRef = Math.min(area(REF.len, REF.h, REF.w).w, area(REF.len, REF.h, REF.w).h);
  const kFit = Math.min(area(totalL, topZ, W).w, area(totalL, topZ, W).h);
  const k = Math.min(kRef, kFit);

  const X0 = 138; // left edge of the load area
  const sideTop = 34;
  const G = sideTop + topZ * k; // ground line
  const topY = G + 46; // top view starts below the ground line
  const sx = (x: number) => X0 + x * k;
  const sz = (z: number) => G - z * k;
  const pts = (list: [number, number][]) => list.map(([x, z]) => `${sx(x).toFixed(1)},${sz(z).toFixed(1)}`).join(" ");
  const H_VIEW = topY + W * k + 24;

  const wheel = (xc: number, r: number, key: string) => (
    <g key={key}>
      <circle cx={sx(xc)} cy={sz(r)} r={r * k} fill={WHEEL} />
      <circle cx={sx(xc)} cy={sz(r)} r={r * k * 0.5} fill="#d6d3d1" />
      <circle cx={sx(xc)} cy={sz(r)} r={r * k * 0.15} fill={WHEEL} />
    </g>
  );
  const seg = (x1: number, z1: number, x2: number, z2: number, w: number, key: string, color = INK) => (
    <line key={key} x1={sx(x1)} y1={sz(z1)} x2={sx(x2)} y2={sz(z2)} stroke={color} strokeWidth={w} strokeLinecap="round" />
  );

  // Dimension line with end ticks and a label.
  const hDim = (x1: number, x2: number, y: number, label: string, key: string) => (
    <g key={key}>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={ACCENT} strokeWidth={1.4} />
      <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} stroke={ACCENT} strokeWidth={1.4} />
      <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} stroke={ACCENT} strokeWidth={1.4} />
      <text x={(x1 + x2) / 2} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill="#292524">
        {label}
      </text>
    </g>
  );
  const vDim = (x: number, y1: number, y2: number, label: string, side: "left" | "right", key: string) => (
    <g key={key}>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={ACCENT} strokeWidth={1.4} />
      <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} stroke={ACCENT} strokeWidth={1.4} />
      <line x1={x - 5} y1={y2} x2={x + 5} y2={y2} stroke={ACCENT} strokeWidth={1.4} />
      <text x={side === "left" ? x - 8 : x + 8} y={(y1 + y2) / 2 + 4} textAnchor={side === "left" ? "end" : "start"} fontSize={11} fontWeight={600} fill="#292524">
        {label}
      </text>
    </g>
  );

  const loadArea = (
    <g>
      <polygon points={pts([[0, floor], [L, floor], [L, floor + H], [0, floor + H]])} fill={LOAD} stroke={INK} strokeWidth={1.3} />
      <line x1={sx(0)} y1={sz(floor + H)} x2={sx(L)} y2={sz(floor + H)} stroke={INK} strokeWidth={1.3} strokeDasharray="4 3" />
    </g>
  );

  let body: React.ReactNode;
  if (bike) {
    const rear = L / 2 + 6;
    const front = rear + BIKE.wheelbase;
    body = (
      <g>
        {seg(rear, 30, rear + 48, 40, 5, "swing")}
        <polygon points={pts([[rear + 38, 24], [rear + 85, 24], [rear + 85, 64], [rear + 38, 64]])} fill="#78716c" stroke={INK} strokeWidth={1} />
        <polygon points={pts([[rear + 25, 24], [rear + 80, 28], [rear + 80, 33], [rear + 25, 29]])} fill="#a8a29e" stroke={INK} strokeWidth={1} />
        {seg(front, 30, front - 14, 96, 5, "fork")}
        {seg(front - 14, 96, front - 28, 106, 4, "bar1")}
        <polygon points={pts([[rear + 18, 74], [rear + 66, 74], [rear + 72, 68], [rear + 16, 68]])} fill={WHEEL} />
        <polygon points={pts([[rear + 66, 66], [rear + 68, 80], [rear + 100, 82], [rear + 112, 72], [rear + 108, 62], [rear + 70, 62]])} fill="#dc2626" stroke={INK} strokeWidth={1} />
        <circle cx={sx(front - 10)} cy={sz(84)} r={7 * k + 1} fill="#fde047" stroke={INK} strokeWidth={1} />
        {seg(0, floor - 2, rear + 22, floor - 2, 4, "rack")}
        {wheel(rear, BIKE.r, "wr")}
        {wheel(front, BIKE.r, "wf")}
        {loadArea}
      </g>
    );
  } else {
    const cx0 = L + 5;
    const cx1 = L + b.cab;
    const roof = b.cabH;
    const beltZ = floor * 0.72;
    const rearWheel = L * 0.25;
    const frontWheel = L + b.cab * 0.5;
    body = (
      <g>
        <polygon points={pts([[0, floor - 8], [L + 5, floor - 8], [L + 5, floor], [0, floor]])} fill="#a8a29e" stroke={INK} strokeWidth={1} />
        <polygon
          points={pts([[cx0, beltZ], [cx0, roof], [cx0 + b.cab * 0.55, roof], [cx0 + b.cab * 0.82, roof * 0.64], [cx1, roof * 0.6], [cx1, beltZ]])}
          fill={CAB}
          stroke={INK}
          strokeWidth={1.3}
        />
        <polygon
          points={pts([[cx0 + 12, roof - 12], [cx0 + b.cab * 0.52, roof - 12], [cx0 + b.cab * 0.76, roof * 0.7], [cx0 + 12, roof * 0.7]])}
          fill={GLASS}
          stroke={INK}
          strokeWidth={0.8}
        />
        {wheel(rearWheel, b.r, "wr")}
        {wheel(frontWheel, b.r, "wf")}
        {loadArea}
      </g>
    );
  }

  const [lx0, lx1] = [sx(0), sx(L)];
  return (
    <svg viewBox={`0 0 420 ${Math.ceil(H_VIEW)}`} className={`w-full ${className}`} role="img" aria-label={`Load area ${ft(L)} long, ${ft(W)} wide, ${ft(H)} high (${sizeCm(v)})`}>
      {/* ground */}
      <line x1={20} y1={G} x2={400} y2={G} stroke="#a8a29e" strokeWidth={1} />
      {body}
      {hDim(lx0, lx1, sz(floor + H) - 14, `Length ${ft(L)} · ${L} cm`, "len")}
      {vDim(lx0 - 14, sz(floor), sz(floor + H), `Height ${ft(H)} · ${H} cm`, "left", "hgt")}

      {/* top view of the load area, same scale */}
      <text x={lx0} y={topY - 8} fontSize={10} fill="#78716c">
        Top view
      </text>
      <rect x={lx0} y={topY} width={L * k} height={W * k} fill={LOAD} stroke={INK} strokeWidth={1.3} />
      {vDim(lx1 + 14, topY, topY + W * k, `Width ${ft(W)} · ${W} cm`, "right", "wid")}
    </svg>
  );
}
