import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line
} from 'recharts';

import { getPatientProgress, getPatientSessions, getPatientFeedback, getPatientSessionAiFeedback, getGlobalAiInsights, getPatientRecoveryScore, getPatientPainLogs } from "../lib/api";
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
  const [activeTab, setActiveTab] = useState<"overview" | "sessions">("overview");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  
  const [recoveryData, setRecoveryData] = useState<any>(null);
  const [painLogs, setPainLogs] = useState<any[]>([]);
  const [roadmap, setRoadmap] = useState<any>(null);
  
  const [painScoreInput, setPainScoreInput] = useState<number>(0);
  const [painSubmitting, setPainSubmitting] = useState(false);
  const [painSuccess, setPainSuccess] = useState<string | null>(null);

  const submitPain = async () => {
    if (!accessToken) return;
    setPainSubmitting(true);
    setPainSuccess(null);
    try {
      const res = await getPatientPainLogs(accessToken); // we will replace it with post api
      const { postPatientPainLog } = await import("../lib/api");
      const result = await postPatientPainLog(accessToken, painScoreInput, "general", "");
      
      const newLogs = await getPatientPainLogs(accessToken);
      setPainLogs(newLogs);
      
      if (result.validation_note) {
        setPainSuccess("Logged! AI Note: " + result.validation_note);
      } else {
        setPainSuccess("Pain score logged successfully.");
      }
    } catch (e: any) {
      setError("Failed to log pain: " + e.message);
    } finally {
      setPainSubmitting(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      try {
        const [progressRes, sessionsRes, feedbackRes, recoveryRes, painRes] = await Promise.all([
          getPatientProgress(accessToken),
          getPatientSessions(accessToken),
          getPatientFeedback(accessToken).catch(() => []),
          getPatientRecoveryScore(accessToken).catch(() => null),
          getPatientPainLogs(accessToken).catch(() => []),
        ]);
        setProgress(progressRes);
        setSessions(sessionsRes);
        setFeedback(feedbackRes);
        setRecoveryData(recoveryRes);
        setPainLogs(painRes);
        
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
  
  const recoveryScoreVal = recoveryData ? recoveryData.recovery_score : (avgScore || 0);
  const avgPainLevel = recoveryData?.avg_pain ?? 0;
  const recentPains = recoveryData?.recent_pains ?? [];
  const scoreDelta = recoveryData?.score_delta ?? 0;
  const painDelta = recoveryData?.pain_delta ?? 0;

  const trendScores = recentScores.slice(-4);
  const trendPains = recentPains.slice(-4);

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
          <div className="stat-card-label" style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Recovery score</div>
          <div className="stat-card-value" style={{ color: "var(--accent-emerald)", fontSize: '2.5rem', marginTop: '0.25rem' }}>
            {recoveryScoreVal}<span style={{ fontSize: '1.2rem', color: 'var(--text-dim)' }}>/100</span>
          </div>
          <div className="stat-card-sub" style={{ color: scoreDelta >= 0 ? "var(--accent-emerald)" : "var(--accent-coral)", marginTop: '0.5rem' }}>
            {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts this week
          </div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-label" style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Sessions completed</div>
          <div className="stat-card-value" style={{ color: "var(--text-primary)", fontSize: '2.5rem', marginTop: '0.25rem' }}>
            {sessionCount}
          </div>
          <div className="stat-card-sub" style={{ color: "var(--text-dim)", marginTop: '0.5rem' }}>of {Math.max(sessionCount, 30)} assigned</div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-label" style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Avg pain level</div>
          <div className="stat-card-value" style={{ color: "var(--accent-amber)", fontSize: '2.5rem', marginTop: '0.25rem' }}>
            {avgPainLevel}<span style={{ fontSize: '1.2rem', color: 'var(--text-dim)' }}>/10</span>
          </div>
          <div className="stat-card-sub" style={{ color: painDelta <= 0 ? "var(--accent-emerald)" : "var(--accent-coral)", marginTop: '0.5rem' }}>
            {painDelta > 0 ? "+" : ""}{painDelta} from last week
          </div>
        </div>

        <div className="analytics-stat-card glass-card">
          <div className="stat-card-label" style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Compliance rate</div>
          <div className="stat-card-value" style={{ color: "var(--text-primary)", fontSize: '2.5rem', marginTop: '0.25rem' }}>
            {adherence}<span style={{ fontSize: '1.2rem', color: 'var(--text-dim)' }}>%</span>
          </div>
          <div className="stat-card-sub" style={{ color: "var(--accent-emerald)", marginTop: '0.5rem' }}>Above target (75%)</div>
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

          {/* Dual Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Score Chart */}
            <div className="analytics-chart-card glass-card" style={{ background: "rgba(30,30,35,0.9)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>Recovery trend — 4 weeks</h3>
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 }}>On track</span>
              </div>
              <div className="chart-container" style={{ height: "250px", marginTop: "1.5rem" }}>
                {trendScores.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendScores.map((score, i) => ({ session: `W${i + 1}`, score }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.2} />
                      <XAxis dataKey="session" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <RechartsTooltip 
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ background: "rgba(30, 30, 40, 0.9)", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}
                        itemStyle={{ color: "var(--accent-emerald)" }}
                      />
                      <Area type="monotone" dataKey="score" stroke="var(--accent-emerald)" strokeWidth={3} fillOpacity={0} fill="transparent" />
                      <Line type="monotone" dataKey="score" stroke="var(--accent-emerald)" strokeWidth={3} dot={{ r: 4, fill: "var(--accent-emerald)" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">
                    <span className="empty-text">Complete sessions to see your score chart</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pain Chart */}
            <div className="analytics-chart-card glass-card" style={{ background: "rgba(30,30,35,0.9)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>Pain level trend — 4 weeks</h3>
                <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#FCD34D', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600 }}>Monitoring</span>
              </div>
              <div className="chart-container" style={{ height: "250px", marginTop: "1.5rem" }}>
                {trendPains.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendPains.map((score: number, i: number) => ({ session: `W${i + 1}`, score }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.2} />
                      <XAxis dataKey="session" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 10]} />
                      <RechartsTooltip 
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ background: "rgba(30, 30, 40, 0.9)", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}
                        itemStyle={{ color: "var(--accent-amber)" }}
                      />
                      <Line type="monotone" dataKey="score" stroke="var(--accent-amber)" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: "var(--accent-amber)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">
                    <span className="empty-text">Log pain to see your trend</span>
                  </div>
                )}
              </div>
            </div>
          </div>

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
                        <div className="session-row-stat" style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
                          {session.target_sets && session.target_sets > 1 ? (
                            <>
                              <div style={{ display: "flex", alignItems: "baseline" }}>
                                <span className="session-row-stat-value" style={{ fontWeight: 600 }}>{session.target_sets}</span>
                                <span className="session-row-stat-label" style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginLeft: "2px", marginRight: "4px", textTransform: "uppercase" }}>sets</span>
                                <span className="session-row-stat-value" style={{ fontWeight: 600 }}>× {session.target_reps}</span>
                                <span className="session-row-stat-label" style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginLeft: "2px", textTransform: "uppercase" }}>reps</span>
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--accent-cyan)", marginTop: "2px" }}>
                                Total: {session.summary?.total_reps ?? "-"} reps completed
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", alignItems: "baseline" }}>
                              <span className="session-row-stat-value" style={{ fontWeight: 600 }}>{session.summary?.total_reps ?? "-"}</span>
                              <span className="session-row-stat-label" style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginLeft: "4px", textTransform: "uppercase" }}>reps</span>
                            </div>
                          )}
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

    </div>
  );
}
