import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createAssignment,
  deleteAssignment,
  getDoctorPatientAssignmentStats,
  getDoctorPatientAssignments,
  getDoctorPatients,
  getDoctorReport,
  getDoctorSessionAiFeedback,
  getExercises,
  linkPatient,
  searchDoctorPatients,
  getDoctorPatientSessions,
  postSessionFeedback,
  updateAssignment,
  getDoctorPatientRecommendations
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type {
  Assignment,
  ExerciseInfo,
  PatientAssignmentStats,
  PatientSearchResult,
  UserProfile,
  SessionDoc
} from "../lib/types";

function scoreColor(score: number): string {
  if (score >= 85) return "var(--accent-emerald)";
  if (score >= 70) return "var(--accent-cyan)";
  if (score >= 50) return "var(--accent-amber)";
  return "var(--accent-coral)";
}

function trendIcon(trend: string): string {
  switch (trend) {
    case "improving": return "📈";
    case "declining": return "📉";
    case "stable": return "➡️";
    default: return "❓";
  }
}

export function DoctorDashboardPage() {
  const { accessToken } = useAuth();
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [exercises, setExercises] = useState<ExerciseInfo[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [targetReps, setTargetReps] = useState(10);
  const [targetSets, setTargetSets] = useState(3);
  const [restInterval, setRestInterval] = useState(60);
  const [protocol, setProtocol] = useState("");
  const [exerciseName, setExerciseName] = useState("Squats");
  const [patientLookup, setPatientLookup] = useState("");
  const [selectedSearchPatient, setSelectedSearchPatient] = useState<PatientSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [statsFilter, setStatsFilter] = useState("");
  const [assignmentStats, setAssignmentStats] = useState<PatientAssignmentStats[]>([]);
  const [report, setReport] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [patientSessions, setPatientSessions] = useState<SessionDoc[]>([]);
  const [feedbackInput, setFeedbackInput] = useState<{ [key: string]: string }>({});
  const [patientAssignments, setPatientAssignments] = useState<Assignment[]>([]);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ target_sets: number; target_reps: number; rest_interval_seconds: number }>({ target_sets: 3, target_reps: 10, rest_interval_seconds: 60 });
  const [reportModal, setReportModal] = useState<{ assignment: Assignment; sessions: SessionDoc[]; aiFeedback: { [sid: string]: string } } | null>(null);
  const [reportFeedbackInput, setReportFeedbackInput] = useState<{ [sid: string]: string }>({});
  const [loadingAi, setLoadingAi] = useState<{ [sid: string]: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      try {
        const [patientsRes, exercisesRes] = await Promise.all([
          getDoctorPatients(accessToken),
          getExercises(accessToken),
        ]);
        setPatients(patientsRes);
        const stats = await getDoctorPatientAssignmentStats(accessToken);
        setAssignmentStats(stats);
        setExercises(exercisesRes);
        if (patientsRes.length > 0 && !selectedPatientId) {
          setSelectedPatientId(patientsRes[0].id);
        }
        if (exercisesRes.length > 0) {
          setExerciseName(exercisesRes[0].name);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    };
    void load();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const timeout = setTimeout(() => {
      void getDoctorPatientAssignmentStats(accessToken, statsFilter)
        .then((stats) => setAssignmentStats(stats))
        .catch(() => setAssignmentStats([]));
    }, 180);
    return () => clearTimeout(timeout);
  }, [accessToken, statsFilter]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  // Fetch assignments when selected patient changes
  useEffect(() => {
    if (!accessToken || !selectedPatientId) {
      setPatientAssignments([]);
      return;
    }
    void getDoctorPatientAssignments(accessToken, selectedPatientId)
      .then(setPatientAssignments)
      .catch(() => setPatientAssignments([]));
  }, [accessToken, selectedPatientId]);

  useEffect(() => {
    if (!accessToken) return;
    const query = patientLookup.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSelectedSearchPatient(null);
      return;
    }
    const timeout = setTimeout(() => {
      void searchDoctorPatients(accessToken, query)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 200);
    return () => clearTimeout(timeout);
  }, [accessToken, patientLookup]);

  async function onLinkPatient(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !patientLookup.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await linkPatient(accessToken, {
        patientId: selectedSearchPatient?.id,
        patientLookup: patientLookup.trim(),
      });
      const patientsRes = await getDoctorPatients(accessToken);
      setPatients(patientsRes);
      const stats = await getDoctorPatientAssignmentStats(accessToken, statsFilter);
      setAssignmentStats(stats);
      setPatientLookup("");
      setSearchResults([]);
      setSelectedSearchPatient(null);
      if (patientsRes.length > 0) {
        setSelectedPatientId(patientsRes[0].id);
      }
      setSuccess("Patient linked successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link patient");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateAssignment(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedPatientId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createAssignment(accessToken, {
        patient_id: selectedPatientId,
        exercise_name: exerciseName,
        target_reps: Number(targetReps),
        target_sets: Number(targetSets),
        rest_interval_seconds: Number(restInterval),
        protocol: protocol.trim() || undefined,
      });
      const stats = await getDoctorPatientAssignmentStats(accessToken, statsFilter);
      setAssignmentStats(stats);
      setSuccess("Assignment created!");
      // Refresh patient assignments
      if (selectedPatientId) {
        getDoctorPatientAssignments(accessToken, selectedPatientId)
          .then(setPatientAssignments)
          .catch(() => {});
      }
      setProtocol("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create assignment");
    } finally {
      setBusy(false);
    }
  }

  async function onLoadReport() {
    if (!accessToken || !selectedPatientId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getDoctorReport(accessToken, selectedPatientId);
      const sessionsRes = await getDoctorPatientSessions(accessToken, selectedPatientId);
      const recsRes = await getDoctorPatientRecommendations(accessToken, selectedPatientId).catch(() => []);
      setReport(res);
      setPatientSessions(sessionsRes);
      setRecommendations(recsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load report");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitFeedback(sessionId: string) {
    if (!accessToken) return;
    const msg = feedbackInput[sessionId];
    if (!msg || !msg.trim()) return;
    
    setBusy(true);
    try {
      await postSessionFeedback(accessToken, sessionId, msg.trim());
      setSuccess("Feedback posted!");
      setTimeout(() => setSuccess(null), 3000);
      setFeedbackInput((prev) => ({ ...prev, [sessionId]: "" }));
      // refresh sessions to show updated feedback
      const sessionsRes = await getDoctorPatientSessions(accessToken, selectedPatientId);
      setPatientSessions(sessionsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post feedback");
    } finally {
      setBusy(false);
    }
  }

  const recentScores: number[] = report?.recent_scores ?? [];

  return (
    <div className="doctor-layout" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 2rem' }}>
      {error && <p className="error-text">{error}</p>}
      {success && (
        <p style={{
          color: "var(--accent-emerald)", fontSize: "0.85rem", padding: "0.5rem 0.75rem",
          background: "var(--accent-emerald-glow)", borderRadius: "var(--radius-sm)",
          border: "1px solid rgba(16,185,129,0.2)", marginBottom: "1rem"
        }}>
          {success}
        </p>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Active patients</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{patients.length}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{assignmentStats.filter(s => s.triage_status === "Critical" || s.triage_status === "At risk").length} critical attention</div>
        </div>
        <div className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Exercises assigned</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{assignmentStats.reduce((acc, curr) => acc + curr.total_count, 0)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>this month</div>
        </div>
        <div className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Avg recovery score</div>
          {(() => {
            const scores = assignmentStats.filter(s => (s.risk_score ?? 0) > 0).map(s => s.risk_score!);
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
            const color = avg >= 85 ? 'var(--accent-emerald)' : avg >= 70 ? 'var(--accent-cyan)' : avg >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';
            return (
              <>
                <div style={{ fontSize: '2.5rem', fontWeight: 600, color, lineHeight: 1 }}>{avg}<span style={{ fontSize: '1.2rem', color: 'var(--text-dim)' }}>/100</span></div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{scores.length} patient{scores.length !== 1 ? 's' : ''} tracked</div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(380px, 1.3fr)', gap: '1.5rem' }}>
        {/* Left Col: Patient List */}
        <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Patient list</h2>
            <a href="#" style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem', textDecoration: 'none' }}>View all</a>
          </div>
          
          <div className="patient-list">
            {assignmentStats.map((row) => {
              const score = row.risk_score || 0;
              let sColor = "var(--text-dim)";
              let statusText = row.triage_status || "New";
              let statusBg = "rgba(255,255,255,0.1)";
              let statusTextColor = "white";

              if (score >= 85) { sColor = "var(--accent-emerald)"; statusText = "Excellent"; statusBg = "white"; statusTextColor = "var(--accent-emerald)"; }
              else if (score >= 70) { sColor = "var(--accent-emerald)"; statusText = "On track"; statusBg = "white"; statusTextColor = "var(--accent-emerald)"; }
              else if (score >= 50) { sColor = "var(--accent-amber)"; statusText = "Watch"; statusBg = "#fef3c7"; statusTextColor = "#92400e"; }
              else if (score > 0) { sColor = "var(--accent-coral)"; statusText = "At risk"; statusBg = "#ffe4e6"; statusTextColor = "#e11d48"; }
              else { statusText = "New"; statusBg = "rgba(255,255,255,0.05)"; statusTextColor = "var(--text-dim)"; }

              const initials = row.patient.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
              const isSelected = selectedPatientId === row.patient.id;

              return (
                <div key={row.patient.id}>
                  <div 
                    onClick={() => setSelectedPatientId(isSelected ? '' : row.patient.id)}
                    style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '1rem 0', borderBottom: isSelected ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer', opacity: isSelected ? 1 : 0.7,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isSelected ? 'var(--accent-emerald)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: isSelected ? 'white' : 'var(--bg-card)', fontSize: '0.85rem', transition: 'all 0.15s ease' }}>
                        {initials}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{row.patient.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '55px' }}>
                        <div style={{ color: sColor, fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>{score}</div>
                        <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                           <div style={{ width: `${score}%`, height: '100%', background: sColor }} />
                        </div>
                      </div>
                      <div style={{ background: statusBg, color: statusTextColor, padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, minWidth: '70px', textAlign: 'center' }}>
                        {statusText}
                      </div>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', transition: 'transform 0.2s', transform: isSelected ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                  </div>
                  {/* Expandable assignments */}
                  {isSelected && (
                    <div style={{ 
                      padding: '0.5rem 0 1rem 0', 
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      animation: 'fadeSlideUp 0.2s ease-out',
                    }}>
                      {patientAssignments.length === 0 ? (
                        <div style={{ padding: '0.5rem 0 0.25rem 3.25rem', fontSize: '0.82rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No exercises assigned yet</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '3.25rem' }}>
                          {patientAssignments.map((a) => {
                            const sc = a.status === 'completed' ? 'var(--accent-emerald)' : a.status === 'in_progress' ? 'var(--accent-cyan)' : 'var(--accent-amber)';
                            const sl = a.status === 'completed' ? 'Done' : a.status === 'in_progress' ? 'Active' : 'Pending';
                            const isEditing = editingAssignmentId === a.id;

                            if (isEditing) {
                              return (
                                <div key={a.id} style={{
                                  padding: '0.65rem 0.75rem',
                                  background: 'rgba(255,255,255,0.04)',
                                  borderRadius: '8px',
                                  borderLeft: '2px solid var(--accent-cyan)',
                                }}>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{a.exercise_name}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                      Sets
                                      <input type="number" min={1} max={10} value={editForm.target_sets} onChange={e => setEditForm(f => ({ ...f, target_sets: Number(e.target.value) }))} style={{ textAlign: 'center', padding: '0.3rem', fontSize: '0.82rem' }} />
                                    </label>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                      Reps
                                      <input type="number" min={1} max={30} value={editForm.target_reps} onChange={e => setEditForm(f => ({ ...f, target_reps: Number(e.target.value) }))} style={{ textAlign: 'center', padding: '0.3rem', fontSize: '0.82rem' }} />
                                    </label>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                      Rest(s)
                                      <input type="number" min={10} max={300} step={5} value={editForm.rest_interval_seconds} onChange={e => setEditForm(f => ({ ...f, rest_interval_seconds: Number(e.target.value) }))} style={{ textAlign: 'center', padding: '0.3rem', fontSize: '0.82rem' }} />
                                    </label>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => setEditingAssignmentId(null)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px' }}>Cancel</button>
                                    <button type="button" disabled={busy} onClick={async () => {
                                      if (!accessToken) return;
                                      setBusy(true);
                                      try {
                                        await updateAssignment(accessToken, a.id, editForm);
                                        const updated = await getDoctorPatientAssignments(accessToken, selectedPatientId);
                                        setPatientAssignments(updated);
                                        setEditingAssignmentId(null);
                                        setSuccess('Assignment updated!');
                                        setTimeout(() => setSuccess(null), 3000);
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Update failed');
                                      } finally { setBusy(false); }
                                    }} className="btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}>Save</button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={a.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.55rem 0.75rem',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '8px',
                                borderLeft: `2px solid ${sc}`,
                              }}>
                                <div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{a.exercise_name}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>{a.target_sets ?? 3}×{a.target_reps} · {a.rest_interval_seconds ?? 60}s rest</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: sc, background: `${sc}15`, padding: '2px 8px', borderRadius: '8px' }}>{sl}</span>
                                  {a.status === 'completed' ? (
                                    <button type="button" title="View Report" onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!accessToken) return;
                                      setBusy(true);
                                      try {
                                        const sessions = await getDoctorPatientSessions(accessToken, selectedPatientId);
                                        const filtered = sessions.filter(s => s.exercise_name === a.exercise_name && s.status === 'completed');
                                        setReportModal({ assignment: a, sessions: filtered, aiFeedback: {} });
                                        const fb: { [k: string]: string } = {};
                                        for (const s of filtered) { fb[s.id] = s.doctor_feedback || ''; }
                                        setReportFeedbackInput(fb);
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Failed to load sessions');
                                      } finally { setBusy(false); }
                                    }} style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '2px 8px', fontSize: '0.7rem', borderRadius: '6px', fontWeight: 500 }}>View</button>
                                  ) : (
                                    <>
                                      <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingAssignmentId(a.id); setEditForm({ target_sets: a.target_sets ?? 3, target_reps: a.target_reps, rest_interval_seconds: a.rest_interval_seconds ?? 60 }); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.8rem' }}>✏️</button>
                                      <button type="button" title="Delete" onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!accessToken || !confirm(`Remove ${a.exercise_name}?`)) return;
                                        setBusy(true);
                                        try {
                                          await deleteAssignment(accessToken, a.id);
                                          const updated = await getDoctorPatientAssignments(accessToken, selectedPatientId);
                                          setPatientAssignments(updated);
                                          const stats = await getDoctorPatientAssignmentStats(accessToken);
                                          setAssignmentStats(stats);
                                          setSuccess('Assignment removed');
                                          setTimeout(() => setSuccess(null), 3000);
                                        } catch (err) {
                                          setError(err instanceof Error ? err.message : 'Delete failed');
                                        } finally { setBusy(false); }
                                      }} style={{ background: 'none', border: 'none', color: 'var(--accent-coral)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.8rem' }}>🗑️</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Assign exercise program */}
        <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600, marginBottom: '1.25rem' }}>Assign exercise program</h2>
          <form onSubmit={onCreateAssignment} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}>
            {/* Patient selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Patient</div>
              <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} style={{ width: '100%' }}>
                {patients.length === 0 && <option value="">No patients linked</option>}
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Exercise list — scrollable */}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Select exercise</div>
            <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {exercises.map(ex => {
                const isActive = exerciseName === ex.name;
                return (
                  <div
                    key={ex.name}
                    onClick={() => setExerciseName(ex.name)}
                    style={{
                      padding: '0.75rem 0.9rem',
                      background: isActive ? 'rgba(52, 211, 153, 0.06)' : 'rgba(255,255,255,0.02)',
                      borderLeft: `3px solid ${isActive ? 'var(--accent-emerald)' : 'transparent'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontWeight: isActive ? 600 : 400, fontSize: '0.92rem', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{ex.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px' }}>{ex.target_rom}°</span>
                  </div>
                );
              })}
            </div>

            {/* Customization — compact row */}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Sets', value: targetSets, setter: setTargetSets, min: 1, max: 10, step: 1 },
                { label: 'Reps', value: targetReps, setter: setTargetReps, min: 1, max: 30, step: 1 },
                { label: 'Rest (s)', value: restInterval, setter: setRestInterval, min: 10, max: 300, step: 5 },
              ].map(({ label, value, setter, min, max, step }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '0.35rem' }}>{label}</div>
                  <input type="number" min={min} max={max} step={step} value={value} onChange={e => setter(Number(e.target.value))} style={{ textAlign: 'center', width: '100%', padding: '0.45rem', fontSize: '0.95rem', fontWeight: 600 }} />
                </div>
              ))}
            </div>

            {/* Assign button */}
            <button disabled={busy || !selectedPatientId} type="submit" className="btn-primary" style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem', marginTop: 'auto' }}>
              {busy ? 'Assigning…' : `Assign ${exerciseName}`}
            </button>
          </form>
        </div>
      </div>

      {/* Session Report Modal */}
      {reportModal && (
        <div onClick={() => setReportModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-subtle)', maxWidth: '720px', width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{reportModal.assignment.exercise_name}</h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>{reportModal.sessions.length} completed session{reportModal.sessions.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setReportModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            {/* Modal Body */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reportModal.sessions.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontStyle: 'italic', padding: '2rem 0', textAlign: 'center' }}>No completed sessions found for this exercise.</div>
              ) : reportModal.sessions.map((s) => {
                const avg = s.summary?.avg_final_score ?? 0;
                const reps = s.summary?.reps ?? [];
                const aiFb = reportModal.aiFeedback[s.id];
                const isLoadingAi = loadingAi[s.id];
                return (
                  <div key={s.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '1rem' }}>
                    {/* Session header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{s.summary?.total_reps ?? 0} reps</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: scoreColor(avg) }}>{Math.round(avg)}</span>
                      </div>
                    </div>
                    {/* Per-rep scores */}
                    {reps.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        {reps.map((r: any, i: number) => {
                          const rs = r.final_score ?? 0;
                          return (
                            <div key={i} title={`Rep ${r.rep}: ROM ${r.rom_score}, Stab ${r.stability_score}, Tempo ${r.tempo_score}`} style={{
                              width: '32px', height: '32px', borderRadius: '6px',
                              background: scoreColor(rs) + '20',
                              border: `1px solid ${scoreColor(rs)}40`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.7rem', fontWeight: 600, color: scoreColor(rs),
                            }}>{Math.round(rs)}</div>
                          );
                        })}
                      </div>
                    )}
                    {/* AI Feedback */}
                    <div style={{ marginBottom: '0.65rem' }}>
                      {aiFb ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(6,182,212,0.06)', padding: '0.6rem 0.75rem', borderRadius: '8px', borderLeft: '2px solid var(--accent-cyan)' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>AI Analysis</div>
                          {aiFb}
                        </div>
                      ) : (
                        <button type="button" disabled={isLoadingAi} onClick={async () => {
                          if (!accessToken) return;
                          setLoadingAi(prev => ({ ...prev, [s.id]: true }));
                          try {
                            const fb = await getDoctorSessionAiFeedback(accessToken, s.id);
                            setReportModal(prev => prev ? { ...prev, aiFeedback: { ...prev.aiFeedback, [s.id]: fb } } : null);
                          } catch {} finally {
                            setLoadingAi(prev => ({ ...prev, [s.id]: false }));
                          }
                        }} style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', background: 'none', border: '1px solid var(--accent-cyan)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
                          {isLoadingAi ? 'Loading…' : 'Get AI analysis'}
                        </button>
                      )}
                    </div>
                    {/* Doctor Feedback */}
                    <div>
                      {s.doctor_feedback && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', padding: '0.5rem 0.65rem', background: 'rgba(52,211,153,0.06)', borderRadius: '6px', borderLeft: '2px solid var(--accent-emerald)' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>Your feedback: </span>{s.doctor_feedback}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input placeholder="Add feedback…" value={reportFeedbackInput[s.id] || ''} onChange={e => setReportFeedbackInput(prev => ({ ...prev, [s.id]: e.target.value }))} style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.65rem' }} />
                        <button type="button" disabled={busy || !(reportFeedbackInput[s.id] || '').trim()} onClick={async () => {
                          if (!accessToken) return;
                          const msg = (reportFeedbackInput[s.id] || '').trim();
                          if (!msg) return;
                          setBusy(true);
                          try {
                            await postSessionFeedback(accessToken, s.id, msg);
                            // Update session in modal
                            setReportModal(prev => {
                              if (!prev) return null;
                              return { ...prev, sessions: prev.sessions.map(ss => ss.id === s.id ? { ...ss, doctor_feedback: msg } : ss) };
                            });
                            setReportFeedbackInput(prev => ({ ...prev, [s.id]: '' }));
                            setSuccess('Feedback saved!');
                            setTimeout(() => setSuccess(null), 3000);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to save feedback');
                          } finally { setBusy(false); }
                        }} className="btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', borderRadius: '6px' }}>Send</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
