import { useEffect, useRef, useState } from "react";

interface ScoreRingProps {
  value: number;
  label: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  compact?: boolean;
}

export function ScoreRing({
  value,
  label,
  color = "var(--accent-cyan)",
  size = 80,
  strokeWidth = 5,
  compact = false,
}: ScoreRingProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Animate the display value when value changes
  useEffect(() => {
    const startVal = prevValueRef.current;
    const endVal = Math.max(0, Math.min(100, value));
    const duration = 600;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplayValue(Math.round(current));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = endVal;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [value]);

  const effectiveSize = compact ? 56 : size;
  const effectiveStroke = compact ? 4 : strokeWidth;
  const radius = (effectiveSize - effectiveStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, displayValue));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`score-ring-card ${compact ? "score-ring-compact" : "glass-card"}`}
      style={{ gap: 0 }}
    >
      <div className="score-ring-wrap">
        <svg
          className="score-ring-svg"
          width={effectiveSize}
          height={effectiveSize}
          viewBox={`0 0 ${effectiveSize} ${effectiveSize}`}
        >
          <circle
            className="score-ring-bg"
            cx={effectiveSize / 2}
            cy={effectiveSize / 2}
            r={radius}
            strokeWidth={effectiveStroke}
          />
          <circle
            className="score-ring-progress"
            cx={effectiveSize / 2}
            cy={effectiveSize / 2}
            r={radius}
            strokeWidth={effectiveStroke}
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
        {/* Center text */}
        <svg
          width={effectiveSize}
          height={effectiveSize}
          viewBox={`0 0 ${effectiveSize} ${effectiveSize}`}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <text
            className="score-ring-text"
            x={effectiveSize / 2}
            y={effectiveSize / 2}
            fontSize={effectiveSize * 0.26}
          >
            {Math.round(clamped)}
          </text>
        </svg>
      </div>
      <span className={`score-ring-label ${compact ? "score-ring-label-compact" : ""}`}>
        {label}
      </span>
    </div>
  );
}
