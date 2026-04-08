interface ScoreRingProps {
  value: number;
  label: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export function ScoreRing({
  value,
  label,
  color = "var(--accent-cyan)",
  size = 80,
  strokeWidth = 5,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="score-ring-card glass-card" style={{ gap: 0 }}>
      <svg
        className="score-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="score-ring-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={
            {
              "--ring-circumference": circumference,
              "--ring-offset": offset,
            } as React.CSSProperties
          }
        />
      </svg>
      {/* Center text — rendered outside the rotated SVG */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <text
          className="score-ring-text"
          x={size / 2}
          y={size / 2}
          fontSize={size * 0.22}
        >
          {Math.round(clamped)}
        </text>
      </svg>
      <span className="score-ring-label">{label}</span>
    </div>
  );
}
