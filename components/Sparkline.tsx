type Props = {
  points: number[];
  width?: number;
  height?: number;
  up?: boolean;
};

// tiny inline SVG price trend — renders whatever real points exist
export default function Sparkline({ points, width = 96, height = 28, up }: Props) {
  if (points.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[9px] text-muted/40"
      >
        no data
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || max || 1;
  const pad = 2;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? width / 2
        : pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const rising = up ?? points[points.length - 1] >= points[0];
  const color = rising ? "#86efac" : "#f87171";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
