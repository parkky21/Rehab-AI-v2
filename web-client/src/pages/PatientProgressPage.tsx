import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

import { getPatientProgress, getPatientSessions, getPatientFeedback, getPatientSessionAiFeedback, getGlobalAiInsights } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SessionDoc } from "../lib/types";

function trendIcon(trend: string): string {
  switch (trend) {
    case "improving": return "↗";
    case "declining": return "↘";
    case "stable": return "→";
    default: return "?";
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

function trendLabel(trend: string): string {
  switch (trend) {
    case "improving": return "Improving";
    case "declining": return "Declining";
    case "stable": return "Stable";
    default: return "N/A";
  }
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "var(--accent-emerald)";
  if (score >= 70) return "var(--accent-cyan)";
  if (score >= 50) return "var(--accent-amber)";
  return "var(--accent-coral)";
}

function scoreLevel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs Improvement";
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

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function feedbackCategoryIcon(category: string): string {
  switch (category) {
    case "encouragement": return "💪";
    case "correction": return "🎯";
    case "goal": return "🏁";
    default: return "💬";
  }
}

function feedbackCategoryLabel(category: string): string {
  switch (category) {
    case "encouragement": return "Encouragement";
    case "correction": return "Correction";
    case "goal": return "Goal";
    default: return "General";
  }
}

function ExpandedSessionView({ session }: { session: SessionDoc }) {
  const { accessToken } = useAuth();
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !session.id) return;
    setLoading(true);
    getPatientSessionAiFeedback(accessToken, session.id)
      .then(res => setAiFeedback(res.feedback))
      .catch(err => setAiFeedback("Could not load AI feedback: " + err.message))
      .finally(() => setLoading(false));
  }, [accessToken, session.id]);

  const repsData = session.summary?.reps || [];

  return (
    <div className="expanded-session-content" style={{ padding: "1.25rem", borderTop: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.2)" }}>
      <h4 style={{ margin: "0 0 1rem 0", color: "var(--accent-cyan)", fontSize: "0.95rem" }}>Performance Breakdown (Per Rep)</h4>
      {repsData.length > 0 ? (
        <div style={{ height: "200px", width: "100%", marginBottom: "1.5rem" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={repsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="rep" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
              <RechartsTooltip 
                cursor={{ fill: "transparent" }}
                contentStyle={{ background: "rgba(30, 30, 40, 0.9)", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}
                itemStyle={{ color: "var(--text-primary)" }}
              />
              <Bar dataKey="final_score" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} name="Score" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>No per-rep data available for this session.</p>
      )}

      {session.doctor_feedback && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ margin: "0 0 0.75rem 0", color: "var(--accent-purple)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Doctor's Note
          </h4>
          <div className="glass-card" style={{ padding: "1rem", background: "rgba(167, 139, 250, 0.05)", border: "1px solid rgba(167, 139, 250, 0.15)" }}>
            <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {session.doctor_feedback}
            </div>
          </div>
        </div>
      )}

      <h4 style={{ margin: "0 0 0.75rem 0", color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 12"/><path d="M12 12 19.1 4.9"/></svg>
        AI Personalized Feedback
      </h4>
      <div className="glass-card glass-card-glow" style={{ padding: "1rem", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)" }}>
        {loading ? (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>
            <div className="loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px", borderTopColor: "var(--accent-emerald)" }} />
            Generating AI insights from your reps...
          </div>
        ) : (
          <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {aiFeedback}
          </div>
        )}
      </div>
    </div>
  );
}

export function PatientProgressPage() {
  const { accessToken } = useAuth();
  const [progress, setProgress] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [globalInsights, setGlobalInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "feedback">("overview");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      try {
        const [progressRes, sessionsRes, feedbackRes] = await Promise.all([
          getPatientProgress(accessToken),
          getPatientSessions(accessToken),
          getPatientFeedback(accessToken).catch(() => []),
        ]);
        setProgress(progressRes);
        setSessions(sessionsRes);
        setFeedback(feedbackRes);
        
        // Fetch AI insights asynchronously without blocking the UI
        getGlobalAiInsights(accessToken)
          .then(res => setGlobalInsights(res))
          .catch(() => setGlobalInsights(null));
          
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
        <div className="loading-spinner" />
        <span className="empty-text">Loading your analytics...</span>
      </div>
    );
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  const recentScores: number[] = progress?.recent_scores ?? [];
  const maxScore = Math.max(...recentScores, 1);
  const avgScore = progress?.avg_final_score ?? 0;
  const sessionCount = progress?.session_count ?? 0;
  const adherence = progress?.adherence_percent ?? 0;

  return (
    <div className="analytics-layout" id="analytics-page">
      {/* Header */}
      <div className="analytics-header">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <p className="page-subtitle">Your rehabilitation journey at a glance</p>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="analytics-stats-row">
        <div className="analytics-stat-card glass-card">
          <div className="stat-card-top">
            <div className="stat-icon-wrap stat-icon-score">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </div>
            <span className="stat-trend-badge">{trendIcon(progress?.trend)}</span>
          </div>
          <div className="stat-card-value" style={{ color: "var(--accent-cyan)" }}>{avgScore || "--"}</div>
          <div className="stat-card-label">Average Score</div>
          <div className="stat-card-sub">{scoreLevel(avgScore)}</div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-top">
            <div className={`stat-icon-wrap stat-icon-trend`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
          </div>
          <div className={`stat-card-value ${trendClass(progress?.trend)}`}>{trendLabel(progress?.trend)}</div>
          <div className="stat-card-label">Performance Trend</div>
          <div className="stat-card-sub">Last 5 sessions</div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-top">
            <div className="stat-icon-wrap stat-icon-adherence">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
          <div className="stat-card-value" style={{ color: "var(--accent-emerald)" }}>{adherence}%</div>
          <div className="stat-card-label">Adherence Rate</div>
          <div className="stat-card-sub">{adherence >= 80 ? "On track!" : "Keep it up"}</div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-top">
            <div className="stat-icon-wrap stat-icon-sessions">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div>
          <div className="stat-card-value" style={{ color: "var(--accent-purple)" }}>{sessionCount}</div>
          <div className="stat-card-label">Total Sessions</div>
          <div className="stat-card-sub">{feedback.length > 0 ? `${feedback.length} doctor notes` : "Complete more sessions"}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="analytics-tabs">
        <button
          className={`analytics-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
          Overview
        </button>
        <button
          className={`analytics-tab ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => setActiveTab("sessions")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Sessions ({sessions.length})
        </button>
        <button
          className={`analytics-tab ${activeTab === "feedback" ? "active" : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Doctor Notes {feedback.length > 0 && <span className="tab-badge">{feedback.length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="analytics-content">
          
          {/* Global AI Insights */}
          <div className="analytics-chart-card glass-card glass-card-glow" style={{ marginBottom: "1.5rem", border: "1px solid var(--accent-emerald-glow)", background: "rgba(16, 185, 129, 0.05)" }}>
            <div className="chart-header" style={{ marginBottom: "0.5rem" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-emerald)", fontSize: "1.1rem" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 12"/><path d="M12 12 19.1 4.9"/></svg>
                AI Insights
              </h3>
            </div>
            {globalInsights ? (
              <div style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {globalInsights}
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>
                <div className="loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px", borderTopColor: "var(--accent-emerald)" }} />
                Generating comprehensive insights from your progress...
              </div>
            )}
          </div>

          {/* Score Chart */}
          {recentScores.length > 0 ? (
            <div className="analytics-chart-card glass-card">
              <div className="chart-header">
                <h3>Score Progression</h3>
                <span className="chart-subtitle">{recentScores.length} recent sessions</span>
              </div>
              <div className="chart-container" style={{ height: "250px", marginTop: "1rem" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={recentScores.map((score, i) => ({ session: `S${i + 1}`, score }))}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="session" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <RechartsTooltip 
                      cursor={{ fill: "transparent" }}
                      contentStyle={{ background: "rgba(30, 30, 40, 0.9)", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}
                      itemStyle={{ color: "var(--text-primary)" }}
                    />
                    <Area type="monotone" dataKey="score" stroke="var(--accent-cyan)" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="analytics-chart-card glass-card">
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.4"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                <span className="empty-text">Complete sessions to see your score chart</span>
              </div>
            </div>
          )}

          {/* Progression Decision */}
          {progress?.latest_progression && (
            <div className="analytics-progression glass-card">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                AI Progression Insight
              </h3>
              <div className="progression-grid">
                <div className="progression-item">
                  <span className="progression-label">Decision</span>
                  <span className="progression-value progression-action">
                    {progress.latest_progression.decision?.action ?? "None"}
                  </span>
                </div>
                <div className="progression-item">
                  <span className="progression-label">Reasoning</span>
                  <span className="progression-value">
                    {progress.latest_progression.decision?.reason ?? "-"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Doctor Feedback Preview */}
          {feedback.length > 0 && (
            <div className="analytics-feedback-preview glass-card">
              <div className="feedback-preview-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Latest from Your Doctor
                </h3>
                <button className="btn-ghost" onClick={() => setActiveTab("feedback")} style={{ fontSize: "0.82rem" }}>
                  View all →
                </button>
              </div>
              <div className="feedback-preview-card">
                <div className="feedback-category-badge">
                  <span>{feedbackCategoryIcon(feedback[0].category)}</span>
                  {feedbackCategoryLabel(feedback[0].category)}
                </div>
                <p className="feedback-message">{feedback[0].message}</p>
                <div className="feedback-meta">
                  <span className="feedback-doctor">Dr. {feedback[0].doctor_name}</span>
                  <span className="feedback-date">{formatDateShort(feedback[0].created_at)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="analytics-content">
          <div className="glass-card">
            <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Session History
            </h3>
            {sessions.length === 0 ? (
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
                <span className="empty-text">No sessions yet. Complete an exercise to see history.</span>
              </div>
            ) : (
              <div className="sessions-list">
                {sessions.map((session) => (
                  <div key={session.id} className={`session-row-premium-wrap ${expandedSessionId === session.id ? "expanded" : ""}`} style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    marginBottom: "0.75rem",
                    transition: "all 0.3s ease",
                  }}>
                    <div 
                      className="session-row-premium" 
                      onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                      style={{ 
                        cursor: "pointer", 
                        padding: "1rem", 
                        display: "flex", 
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div className="session-row-left" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div className="session-score-circle" style={{
                            width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            border: `2px solid ${session.summary ? scoreBarColor(session.summary.avg_final_score) : "var(--border-subtle)"}`,
                          }}>
                          <span style={{
                            color: session.summary ? scoreBarColor(session.summary.avg_final_score) : "var(--text-dim)",
                            fontFamily: '"Outfit", sans-serif',
                            fontWeight: 700,
                            fontSize: "0.95rem",
                          }}>
                            {session.summary?.avg_final_score ?? "--"}
                          </span>
                        </div>
                        <div className="session-row-info">
                          <div className="session-exercise" style={{ fontWeight: 600, color: "var(--text-primary)" }}>{session.exercise_name}</div>
                          <div className="session-date" style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>{formatDate(session.started_at)}</div>
                        </div>
                      </div>
                      <div className="session-row-right" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div className="session-row-stat" style={{ textAlign: "right" }}>
                          <span className="session-row-stat-value" style={{ fontWeight: 600 }}>{session.summary?.total_reps ?? "-"}</span>
                          <span className="session-row-stat-label" style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginLeft: "4px", textTransform: "uppercase" }}>reps</span>
                        </div>
                        <div className={`status-badge ${session.status === "completed" ? "live" : "idle"}`}>
                          {session.status}
                        </div>
                        <svg 
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{
                            transform: expandedSessionId === session.id ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.3s ease",
                            color: "var(--text-dim)"
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                    </div>
                    {expandedSessionId === session.id && (
                      <ExpandedSessionView session={session} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "feedback" && (
        <div className="analytics-content">
          <div className="glass-card">
            <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Doctor Feedback & Notes
            </h3>
            {feedback.length === 0 ? (
              <div className="empty-state" style={{ padding: "3rem 1rem" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" opacity="0.35"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span className="empty-text" style={{ marginTop: "0.5rem" }}>No feedback from your doctor yet</span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>Your doctor can leave notes and guidance after reviewing your sessions</span>
              </div>
            ) : (
              <div className="feedback-list">
                {feedback.map((fb, i) => (
                  <div key={fb.id || i} className="feedback-card">
                    <div className="feedback-card-header">
                      <div className="feedback-category-badge">
                        <span>{feedbackCategoryIcon(fb.category)}</span>
                        {feedbackCategoryLabel(fb.category)}
                      </div>
                      <span className="feedback-date">{formatDate(fb.created_at)}</span>
                    </div>
                    <p className="feedback-card-message">{fb.message}</p>
                    <div className="feedback-card-footer">
                      <span className="feedback-doctor-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {fb.doctor_name || "Your Doctor"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
