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

function scoreEmoji(score: number): string {
  if (score >= 85) return "🔥";
  if (score >= 70) return "✨";
  if (score >= 50) return "👍";
  return "💪";
}

interface RepCardProps {
  rep: RepEvent;
  compact?: boolean;
}

export function RepCard({ rep, compact = false }: RepCardProps) {
  const finalScore = rep.scores.final_score;
  const color = scoreColor(finalScore);
  const cls = scoreClass(finalScore);

  return (
    <div className={`rep-card ${compact ? "rep-card-compact" : ""} rep-card-${cls}`}>
      <div className="rep-card-header">
        <span className="rep-card-number">
          <span className="rep-card-emoji">{scoreEmoji(finalScore)}</span>
          Rep {rep.rep_number}
        </span>
        <span
          className={`rep-card-score ${cls}`}
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
        {!compact && (
          <div className="rep-card-metric">
            <span className="rep-card-metric-label">Time</span>
            <span className="rep-card-metric-value">{rep.rep_time.toFixed(1)}s</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { scoreColor, scoreClass };
