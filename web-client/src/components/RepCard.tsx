import type { RepEvent } from "../lib/types";

function scoreColor(score: number): string {
  if (score >= 85) return "var(--score-excellent)";
  if (score >= 70) return "var(--score-good)";
  if (score >= 50) return "var(--score-fair)";
  return "var(--score-poor)";
}

function scoreClass(score: number): string {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

interface RepCardProps {
  rep: RepEvent;
}

export function RepCard({ rep }: RepCardProps) {
  const finalScore = rep.scores.final_score;
  const color = scoreColor(finalScore);

  return (
    <div className="rep-card">
      <div className="rep-card-header">
        <span className="rep-card-number">Rep {rep.rep_number}</span>
        <span
          className={`rep-card-score ${scoreClass(finalScore)}`}
          style={{ color }}
        >
          {finalScore}
        </span>
      </div>
      <div className="rep-card-metrics">
        <div className="rep-card-metric">
          <span className="rep-card-metric-label">ROM</span>
          <span className="rep-card-metric-value">{rep.scores.rom_score}</span>
        </div>
        <div className="rep-card-metric">
          <span className="rep-card-metric-label">Stability</span>
          <span className="rep-card-metric-value">{rep.scores.stability_score}</span>
        </div>
        <div className="rep-card-metric">
          <span className="rep-card-metric-label">Tempo</span>
          <span className="rep-card-metric-value">{rep.scores.tempo_score}</span>
        </div>
        <div className="rep-card-metric">
          <span className="rep-card-metric-label">Time</span>
          <span className="rep-card-metric-value">{rep.rep_time.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

export { scoreColor, scoreClass };
