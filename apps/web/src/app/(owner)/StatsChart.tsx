"use client";

// Ručno napisan SVG bar chart - NEMA chart biblioteke u projektu (provjereno
// prije pisanja koda, `apps/web/package.json` nema recharts/victory/d3/
// visx), a jedan jednostavan bar chart ne opravdava novu ovisnost (isti
// "izbjegavaj nepotrebne pakete" obrazac kao svugdje u ovom repou - vidi
// CSV parser/mobile date input odluke ranije). React podržava SVG izvorno,
// nema potrebe za ičim dodatnim.

export interface ChartPoint {
  label: string;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
}

export default function StatsChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) return null;

  const width = 700;
  const height = 220;
  const padding = { top: 10, bottom: 26, left: 10, right: 10 };
  const chartHeight = height - padding.top - padding.bottom;
  const groupWidth = (width - padding.left - padding.right) / points.length;
  const barWidth = Math.max(6, Math.min(28, groupWidth / 3));

  const totalCosts = points.map((p) => p.serviceCost + p.additionalCosts);
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.profit)), ...totalCosts.map((c) => Math.abs(c)));
  const zeroY = padding.top + chartHeight / 2;
  const scale = chartHeight / 2 / maxAbs;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 700, height: "auto" }}>
        <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#ccc" />
        {points.map((p, i) => {
          const cx = padding.left + i * groupWidth + groupWidth / 2;
          const totalCost = p.serviceCost + p.additionalCosts;
          const profitHeight = Math.abs(p.profit) * scale;
          const costHeight = Math.abs(totalCost) * scale;
          return (
            <g key={i}>
              <rect
                x={cx - barWidth - 2}
                y={p.profit >= 0 ? zeroY - profitHeight : zeroY}
                width={barWidth}
                height={profitHeight}
                fill={p.profit >= 0 ? "#16a34a" : "#dc2626"}
              />
              <rect x={cx + 2} y={zeroY} width={barWidth} height={costHeight} fill="#9ca3af" />
              <text x={cx} y={height - 8} fontSize="10" textAnchor="middle" fill="#666">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "#666" }}>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#16a34a", marginRight: 4 }} />
          Profit (pozitivan)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#dc2626", marginRight: 4 }} />
          Profit (negativan)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#9ca3af", marginRight: 4 }} />
          Ukupni troškovi (servis + dodatni)
        </span>
      </div>
    </div>
  );
}
