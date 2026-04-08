import { useEffect, useState } from "react";

import { getPatientProgress, getPatientSessions } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SessionDoc } from "../lib/types";

function trendIcon(trend: string): string {
  switch (trend) {
    case "improving": return "📈";
    case "declining": return "📉";
    case "stable": return "➡️";
    default: return "❓";
  }
}

function trendClass(trend: string): string {
  switch (trend) {
    case "improving": return "trend-improving";
    case "declining": return "trend-declining";
    case "stable": return "trend-stable";
    default: return "trend-insufficient";
  }
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "var(--accent-emerald)";
  if (score >= 70) return "var(--accent-cyan)";
  if (score >= 50) return "var(--accent-amber)";
  return "var(--accent-coral)";
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function PatientProgressPage() {
  const { accessToken } = useAuth();
  const [progress, setProgress] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      try {
        const [progressRes, sessionsRes] = await Promise.all([
          getPatientProgress(accessToken),
          getPatientSessions(accessToken),
        ]);
        setProgress(progressRes);
        setSessions(sessionsRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load progress");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: "50vh" }}>
        <span className="empty-icon">⏳</span>
        <span className="empty-text">Loading your progress...</span>
      </div>
    );
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  const recentScores: number[] = progress?.recent_scores ?? [];

  return (
    <div className="progress-layout">
      <div className="page-header">
        <h1 className="page-title">My Progress</h1>
        <p className="page-subtitle">Track your rehabilitation journey over time</p>
      </div>

      {/* Stat Cards */}
      <div className="progress-stats-row">
        <div className="progress-stat-card glass-card">
          <div className="progress-stat-icon">🏆</div>
          <div className={`progress-stat-value ${trendClass(progress?.trend)}`}>
            {progress?.avg_final_score ?? "--"}
          </div>
          <div className="progress-stat-label">Avg Score</div>
        </div>

        <div className="progress-stat-card glass-card">
          <div className="progress-stat-icon">{trendIcon(progress?.trend)}</div>
          <div className={`progress-stat-value ${trendClass(progress?.trend)}`}>
            {progress?.trend
              ? progress.trend.charAt(0).toUpperCase() + progress.trend.slice(1)
              : "--"}
          </div>
          <div className="progress-stat-label">Trend</div>
        </div>

        <div className="progress-stat-card glass-card">
          <div className="progress-stat-icon">✅</div>
          <div className="progress-stat-value" style={{ color: "var(--accent-emerald)" }}>
            {progress?.adherence_percent ?? 0}%
          </div>
          <div className="progress-stat-label">Adherence</div>
        </div>

        <div className="progress-stat-card glass-card">
          <div className="progress-stat-icon">📅</div>
          <div className="progress-stat-value" style={{ color: "var(--accent-cyan)" }}>
            {progress?.session_count ?? 0}
          </div>
          <div className="progress-stat-label">Sessions</div>
        </div>
      </div>

      {/* Recent Scores Bar Chart */}
      {recentScores.length > 0 && (
        <div className="glass-card">
          <h3 style={{ marginBottom: "0.75rem" }}>Recent Scores</h3>
          <div className="score-bars">
            {recentScores.map((score, i) => (
              <div
                key={i}
                className="score-bar"
                data-score={score}
                style={{
                  height: `${Math.max(score, 5)}%`,
                  background: scoreBarColor(score),
                  opacity: 0.7 + (i / recentScores.length) * 0.3,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Progression Snapshot */}
      {progress?.latest_progression && (
        <div className="glass-card">
          <h3 style={{ marginBottom: "0.75rem" }}>Progression Decision</h3>
          <div className="report-stat-grid">
            <div className="report-stat">
              <div className="report-stat-label">Action</div>
              <div className="report-stat-value" style={{ color: "var(--accent-cyan)", textTransform: "capitalize" }}>
                {progress.latest_progression.decision?.action ?? "None"}
              </div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">Reason</div>
              <div className="report-stat-value" style={{ fontSize: "0.88rem" }}>
                {progress.latest_progression.decision?.reason ?? "-"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session History */}
      <div className="glass-card">
        <h3 style={{ marginBottom: "0.75rem" }}>Session History</h3>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <span className="empty-text">No sessions yet. Complete an exercise to see history.</span>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map((session) => (
              <div key={session.id} className="session-row">
                <div>
                  <div className="session-exercise">{session.exercise_name}</div>
                  <div className="session-date">{formatDate(session.started_at)}</div>
                </div>
                <div className="session-score" style={{
                  color: session.summary
                    ? scoreBarColor(session.summary.avg_final_score)
                    : "var(--text-dim)",
                }}>
                  {session.summary?.avg_final_score ?? "--"}
                </div>
                <div className="session-reps">
                  {session.summary?.total_reps ?? "-"} reps
                </div>
                <div className={`status-badge ${session.status === "completed" ? "live" : "idle"}`}>
                  {session.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
