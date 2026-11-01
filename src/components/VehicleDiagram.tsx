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
// A photo of a real motorcycle (transparent PNG, 3/4 view). cm = how long the bike looks in the picture, rackX = where the rear carrier sits.
const BIKE_PHOTO = { src: "/vehicles/bike.webp", cm: 175, aspect: 536 / 682, rackX: 0.11 };
// Product photos (transparent, 3/4 view). pxPerCm is measured on the cab height so every photo vehicle shares the diagram scale;
// bed = where the load area sits in the photo (px). The overlay and the Length/Height lines are placed on it by hand, so they are
// illustrative: the top view below is the to-scale one.
const PHOTOS: Record<string, { src: string; w: number; h: number; ground: number; pxPerCm: number; bed: { x0: number; x1: number; top: number; floor: number } }> = {
  tata_ace: { src: "/vehicles/tata-ace.webp", w: 500, h: 318, ground: 283, pxPerCm: 221 / 185, bed: { x0: 42, x1: 215, top: 55, floor: 212 } },
};
const REF = { len: 244 + 140 + 6, h: 240, w: 160 }; // the biggest standard vehicle sets the shared scale

// Side view and top view of the vehicle, both drawn to one shared scale from the real load-area size, with each side labelled.
export default function VehicleDiagram({ v, code = "tata_ace", className = "" }: { v: Dims; code?: string; className?: string }) {
  const { length_cm: L, width_cm: W, height_cm: H } = v;
  const bike = code === "bike";
  const b = BODY[code] ?? BODY.tata_ace;
  const floor = bike ? BIKE.rack : b.floor;
  const ahead = bike ? BIKE_PHOTO.cm * (1 - BIKE_PHOTO.rackX) - L / 2 : b.cab; // how far the vehicle reaches in front of the load area
  const totalL = L + ahead;
  const photo = PHOTOS[code];
  const topZ = Math.max(floor + H, bike ? 118 : b.cabH, photo ? photo.ground / photo.pxPerCm : 0);

  const area = (len: number, h: number, w: number) => ({ w: 330 / len, h: 250 / (h + w + 70) });
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

  // Where the Length and Height lines go: on the data load area, or on the photo's bed.
  let lenLine = { x1: sx(0), x2: sx(L), y: sz(floor + H) - 14 };
  let hgtLine = { x: sx(0) - 14, y1: sz(floor), y2: sz(floor + H) };

  let body: React.ReactNode;
  if (photo) {
    const sc = k / photo.pxPerCm; // screen px per photo px
    const left = sx(0) - photo.bed.x0 * sc;
    const top = G - photo.ground * sc;
    const pp = (x: number, y: number) => `${(left + x * sc).toFixed(1)},${(top + y * sc).toFixed(1)}`;
    const { x0, x1, top: bt, floor: bf } = photo.bed;
    lenLine = { x1: left + x0 * sc, x2: left + x1 * sc, y: top - 2 };
    hgtLine = { x: left + x0 * sc - 14, y1: top + bt * sc, y2: top + bf * sc };
    body = (
      <g>
        <image href={photo.src} x={left} y={top} width={photo.w * sc} height={photo.h * sc} />
        <polygon points={[pp(x0, bt), pp(x1, bt - 3), pp(x1, bf - 2), pp(x0, bf + 3)].join(" ")} fill="rgba(251,146,60,0.28)" stroke={ACCENT} strokeWidth={1.2} />
      </g>
    );
  } else if (bike) {
    const w = BIKE_PHOTO.cm * k;
    const left = sx(L / 2) - BIKE_PHOTO.rackX * w;
    body = (
      <g>
        <image href={BIKE_PHOTO.src} x={left} y={G - w * BIKE_PHOTO.aspect + w * 0.03} width={w} height={w * BIKE_PHOTO.aspect} />
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
    <svg viewBox={`0 0 460 ${Math.ceil(H_VIEW)}`} className={`w-full ${className}`} role="img" aria-label={`Load area ${ft(L)} long, ${ft(W)} wide, ${ft(H)} high (${sizeCm(v)})`}>
      {/* ground */}
      <line x1={20} y1={G} x2={400} y2={G} stroke="#a8a29e" strokeWidth={1} />
      {body}
      {hDim(lenLine.x1, lenLine.x2, lenLine.y, `Length ${ft(L)} · ${L} cm`, "len")}
      {vDim(hgtLine.x, hgtLine.y1, hgtLine.y2, `Height ${ft(H)} · ${H} cm`, "left", "hgt")}

      {/* top view of the load area, same scale */}
      <text x={lx0} y={topY - 8} fontSize={10} fill="#78716c">
        Top view
      </text>
      <rect x={lx0} y={topY} width={L * k} height={W * k} fill={LOAD} stroke={INK} strokeWidth={1.3} />
      {vDim(lx1 + 14, topY, topY + W * k, `Width ${ft(W)} · ${W} cm`, "right", "wid")}
    </svg>
  );
}
