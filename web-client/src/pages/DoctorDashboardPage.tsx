import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createAssignment,
  getDoctorPatientAssignmentStats,
  getDoctorPatients,
  getDoctorReport,
  getExercises,
  linkPatient,
  searchDoctorPatients,
  getDoctorPatientSessions,
  postSessionFeedback,
  getDoctorPatientRecommendations
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type {
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
    <div className="doctor-layout" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
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
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>AI reports generated</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>31</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>avg score: 74/100</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem' }}>
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
                <div 
                  key={row.patient.id} 
                  onClick={() => setSelectedPatientId(row.patient.id)}
                  style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '1.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer', opacity: isSelected ? 1 : 0.7
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--bg-card)' }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{row.patient.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Post-ACL • Week 6</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '60px' }}>
                      <div style={{ color: sColor, fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>{score}/100</div>
                      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                         <div style={{ width: `${score}%`, height: '100%', background: sColor }} />
                      </div>
                    </div>
                    <div style={{ background: statusBg, color: statusTextColor, padding: '4px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600, width: '80px', textAlign: 'center' }}>
                      {statusText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Assign exercise program */}
        <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600, marginBottom: '1.5rem' }}>Assign exercise program</h2>
          <form onSubmit={onCreateAssignment}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
               <label style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>Patient</label>
               <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.95rem', appearance: 'none', cursor: 'pointer' }}>
                 {patients.length === 0 && <option value="">No patients linked</option>}
                 {patients.map(p => <option key={p.id} value={p.id}>{p.name} — ACL</option>)}
               </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', marginBottom: '2rem', gap: '1rem' }}>
               <label style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>Protocol</label>
               <select value={protocol} onChange={(e) => setProtocol(e.target.value)} style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.95rem', appearance: 'none', cursor: 'pointer' }}>
                 <option value="Post-ACL Phase 2">Post-ACL Phase 2</option>
                 <option value="Post-ACL Phase 3">Post-ACL Phase 3</option>
               </select>
            </div>

            <div style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>Exercise selection</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
               {exercises.map(ex => {
                 const isActive = exerciseName === ex.name;
                 const isAdvanced = ex.name.includes("Balance");
                 const isModerate = ex.name.includes("Raise");
                 const difficultyLabel = isAdvanced ? "Advanced" : isModerate ? "Moderate" : "Beginner";
                 const difficultyColor = isAdvanced ? "#b45309" : isModerate ? "#1d4ed8" : "#047857";
                 const difficultyBg = "white";
                 
                 return (
                   <div 
                     key={ex.name} 
                     onClick={() => setExerciseName(ex.name)}
                     style={{ 
                       padding: '1.25rem', 
                       background: isActive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.02)', 
                       border: `1px solid ${isActive ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.05)'}`, 
                       borderRadius: '12px',
                       display: 'flex',
                       alignItems: 'center',
                       justifyContent: 'space-between',
                       cursor: 'pointer',
                       transition: 'all 0.2s ease'
                     }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                       <div style={{ width: '48px', height: '48px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <span style={{ fontSize: '1.5rem' }}>{ex.name.includes("Quad") ? "🦵" : ex.name.includes("Raise") ? "🏋️" : "⚖️"}</span>
                       </div>
                       <div>
                         <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: '4px' }}>{ex.name}</div>
                         <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{targetSets} sets • {targetReps} reps • {restInterval}s rest</div>
                       </div>
                     </div>
                     <div style={{ background: difficultyBg, padding: '4px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600, color: difficultyColor }}>
                       {difficultyLabel}
                     </div>
                   </div>
                 )
               })}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button disabled={busy || !selectedPatientId} type="submit" style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'background 0.2s' }}>Assign program</button>
              <button type="button" style={{ flex: 1, padding: '1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Preview AI guide</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
