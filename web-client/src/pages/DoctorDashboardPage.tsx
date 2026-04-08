import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createAssignment,
  getDoctorPatientAssignmentStats,
  getDoctorPatients,
  getDoctorReport,
  getExercises,
  linkPatient,
  searchDoctorPatients,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type {
  ExerciseInfo,
  PatientAssignmentStats,
  PatientSearchResult,
  UserProfile,
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
  const [exerciseName, setExerciseName] = useState("Squats");
  const [patientLookup, setPatientLookup] = useState("");
  const [selectedSearchPatient, setSelectedSearchPatient] = useState<PatientSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [statsFilter, setStatsFilter] = useState("");
  const [assignmentStats, setAssignmentStats] = useState<PatientAssignmentStats[]>([]);
  const [report, setReport] = useState<any>(null);
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
      });
      const stats = await getDoctorPatientAssignmentStats(accessToken, statsFilter);
      setAssignmentStats(stats);
      setSuccess("Assignment created!");
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
      setReport(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load report");
    } finally {
      setBusy(false);
    }
  }

  const recentScores: number[] = report?.recent_scores ?? [];

  return (
    <div className="doctor-layout">
      {/* Page Header */}
      <div className="page-header doctor-layout-full">
        <h1 className="page-title">Doctor Dashboard</h1>
        <p className="page-subtitle">Manage patients, assign exercises, and track progress</p>
      </div>

      {error && <p className="error-text doctor-layout-full">{error}</p>}
      {success && (
        <p className="doctor-layout-full" style={{
          color: "var(--accent-emerald)",
          fontSize: "0.85rem",
          padding: "0.5rem 0.75rem",
          background: "var(--accent-emerald-glow)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}>
          {success}
        </p>
      )}

      {/* Patient Linking */}
      <div className="glass-card">
        <div className="card-header">
          <h2 className="card-title">🔗 Link Patient</h2>
        </div>
        <form onSubmit={onLinkPatient} className="stacked-form">
          <label>
            Search by name, email, or username
            <input
              value={patientLookup}
              onChange={(e) => {
                setPatientLookup(e.target.value);
                setSelectedSearchPatient(null);
              }}
              placeholder="Type to search..."
            />
          </label>
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className="search-result-btn"
                  onClick={() => {
                    setSelectedSearchPatient(patient);
                    setPatientLookup(`${patient.name} (${patient.username})`);
                    setSearchResults([]);
                  }}
                >
                  {patient.name} ({patient.username}) — {patient.email}
                  {patient.linked && <span className="linked-badge">Linked</span>}
                </button>
              ))}
            </div>
          )}
          <button className="btn-secondary" disabled={busy} type="submit">
            Link Patient
          </button>
        </form>
      </div>

      {/* Exercise Assignment */}
      <div className="glass-card">
        <div className="card-header">
          <h2 className="card-title">📝 Assign Exercise</h2>
        </div>
        <form onSubmit={onCreateAssignment} className="stacked-form">
          <label>
            Patient
            <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
              {patients.length === 0 && <option value="">No patients linked</option>}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Exercise
            <select value={exerciseName} onChange={(e) => setExerciseName(e.target.value)}>
              {exercises.map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target Reps
            <input
              type="number"
              min={1}
              max={200}
              value={targetReps}
              onChange={(e) => setTargetReps(Number(e.target.value))}
            />
          </label>
          <button className="btn-primary" disabled={busy || !selectedPatient} type="submit">
            Assign Exercise
          </button>
        </form>
      </div>

      {/* Patient Stats Table */}
      <div className="glass-card doctor-layout-full">
        <div className="card-header">
          <h2 className="card-title">👥 Patient Overview</h2>
          <div style={{ width: "240px" }}>
            <input
              value={statsFilter}
              onChange={(e) => setStatsFilter(e.target.value)}
              placeholder="Filter patients..."
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {assignmentStats.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">👤</span>
            <span className="empty-text">No patients linked yet. Use the link panel above.</span>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Assigned</th>
                  <th>In Progress</th>
                  <th>Completed</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignmentStats.map((row) => (
                  <tr key={row.patient.id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 500 }}>{row.patient.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                          @{row.patient.username}
                        </div>
                      </div>
                    </td>
                    <td>{row.assigned_count}</td>
                    <td>{row.in_progress_count}</td>
                    <td style={{ color: "var(--accent-emerald)" }}>{row.completed_count}</td>
                    <td style={{ fontWeight: 600 }}>{row.total_count}</td>
                    <td>
                      <button
                        className="table-btn"
                        onClick={() => {
                          setSelectedPatientId(row.patient.id);
                          onLoadReport();
                        }}
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patient Report */}
      <div className="glass-card doctor-layout-full">
        <div className="card-header">
          <h2 className="card-title">📊 Patient Report</h2>
          <button
            className="btn-secondary"
            disabled={busy || !selectedPatient}
            onClick={onLoadReport}
          >
            Load Report
          </button>
        </div>

        {!report ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <span className="empty-text">Select a patient and click Load Report to view data.</span>
          </div>
        ) : (
          <>
            <div className="report-stat-grid">
              <div className="report-stat">
                <div className="report-stat-label">Average Score</div>
                <div className="report-stat-value" style={{ color: scoreColor(report.avg_final_score) }}>
                  {report.avg_final_score}
                </div>
              </div>
              <div className="report-stat">
                <div className="report-stat-label">Trend</div>
                <div className="report-stat-value">
                  {trendIcon(report.trend)} {report.trend}
                </div>
              </div>
              <div className="report-stat">
                <div className="report-stat-label">Adherence</div>
                <div className="report-stat-value" style={{ color: "var(--accent-emerald)" }}>
                  {report.adherence_percent}%
                </div>
              </div>
              <div className="report-stat">
                <div className="report-stat-label">Sessions</div>
                <div className="report-stat-value" style={{ color: "var(--accent-cyan)" }}>
                  {report.session_count}
                </div>
              </div>
            </div>

            {recentScores.length > 0 && (
              <>
                <div className="report-scores-label">Recent Score Trend</div>
                <div className="score-bars" style={{ height: "60px" }}>
                  {recentScores.map((score, i) => (
                    <div
                      key={i}
                      className="score-bar"
                      data-score={score}
                      style={{
                        height: `${Math.max(score, 5)}%`,
                        background: scoreColor(score),
                        opacity: 0.7 + (i / recentScores.length) * 0.3,
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {report.latest_progression?.decision && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="report-stat" style={{ width: "100%" }}>
                  <div className="report-stat-label">Progression Decision</div>
                  <div className="report-stat-value" style={{ fontSize: "0.92rem", textTransform: "capitalize" }}>
                    {report.latest_progression.decision.action} — {report.latest_progression.decision.reason}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
