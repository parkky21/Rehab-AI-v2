import type {
  Assignment,
  PatientAssignmentStats,
  ExerciseInfo,
  PatientSearchResult,
  SessionDoc,
  TokenResponse,
  UserProfile,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // If JSON parsing fails, use the status text
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function register(payload: {
  name: string;
  email: string;
  username: string;
  password: string;
  role: "doctor" | "patient";
}): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<TokenResponse>(res);
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJson<TokenResponse>(res);
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return parseJson<TokenResponse>(res);
}

export async function me(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<UserProfile>(res);
}

export async function getExercises(accessToken: string): Promise<ExerciseInfo[]> {
  const res = await fetch(`${API_BASE}/exercises`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<ExerciseInfo[]>(res);
}

export async function getDoctorPatients(accessToken: string): Promise<UserProfile[]> {
  const res = await fetch(`${API_BASE}/doctor/patients`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ patients: UserProfile[] }>(res);
  return body.patients;
}

export async function getDoctorPatientAssignmentStats(
  accessToken: string,
  query = ""
): Promise<PatientAssignmentStats[]> {
  const q = query.trim();
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`${API_BASE}/doctor/patients/assignment-stats${suffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ stats: PatientAssignmentStats[] }>(res);
  return body.stats;
}

export async function searchDoctorPatients(
  accessToken: string,
  query: string
): Promise<PatientSearchResult[]> {
  const res = await fetch(`${API_BASE}/doctor/patients/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ patients: PatientSearchResult[] }>(res);
  return body.patients;
}

export async function linkPatient(
  accessToken: string,
  payload: { patientId?: string; patientLookup?: string }
): Promise<void> {
  const lookup = payload.patientLookup?.trim() ?? "";
  const body = payload.patientId
    ? { patient_id: payload.patientId }
    : lookup.includes("@")
      ? { patient_email: lookup.toLowerCase() }
      : { patient_username: lookup.toLowerCase() };

  const res = await fetch(`${API_BASE}/doctor/patients/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  await parseJson<Record<string, string>>(res);
}

export async function createAssignment(
  accessToken: string,
  payload: {
    patient_id: string;
    exercise_name: string;
    target_reps: number;
    target_sets?: number;
    rest_interval_seconds?: number;
    protocol?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<Assignment> {
  const res = await fetch(`${API_BASE}/doctor/assignments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJson<Assignment>(res);
}

export async function getDoctorReport(accessToken: string, patientId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/report`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<any>(res);
}

export async function getDoctorPatientAssignments(accessToken: string, patientId: string): Promise<Assignment[]> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/assignments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ assignments: Assignment[] }>(res);
  return body.assignments;
}

export async function updateAssignment(
  accessToken: string,
  assignmentId: string,
  payload: { target_reps?: number; target_sets?: number; rest_interval_seconds?: number }
): Promise<Assignment> {
  const res = await fetch(`${API_BASE}/doctor/assignments/${assignmentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ assignment: Assignment }>(res);
  return body.assignment;
}

export async function deleteAssignment(
  accessToken: string,
  assignmentId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/doctor/assignments/${assignmentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await parseJson<Record<string, string>>(res);
}

export async function getDoctorPatientSessions(accessToken: string, patientId: string): Promise<SessionDoc[]> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ sessions: SessionDoc[] }>(res);
  return body.sessions;
}

export async function postSessionFeedback(
  accessToken: string,
  sessionId: string,
  doctorFeedback: string
): Promise<void> {
  await fetch(`${API_BASE}/doctor/sessions/${sessionId}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ doctor_feedback: doctorFeedback }),
  });
}

export async function getPatientAssignments(accessToken: string): Promise<Assignment[]> {
  const res = await fetch(`${API_BASE}/patient/assignments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ assignments: Assignment[] }>(res);
  return body.assignments;
}

export async function getPatientSessions(accessToken: string): Promise<SessionDoc[]> {
  const res = await fetch(`${API_BASE}/patient/sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ sessions: SessionDoc[] }>(res);
  return body.sessions;
}

export async function getPatientProgress(accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}/patient/progress`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<any>(res);
}

export async function getGlobalAiInsights(accessToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/patient/progress/ai-insights`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ insights: string }>(res);
  return body.insights;
}

export async function getPatientFeedback(accessToken: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/patient/feedback`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ feedback: any[] }>(res);
  return body.feedback;
}

export async function postDoctorFeedback(
  accessToken: string,
  patientId: string,
  message: string,
  category: string = "general"
): Promise<void> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ patient_id: patientId, message, category }),
  });
  await parseJson<Record<string, string>>(res);
}

export async function getDoctorPatientFeedback(
  accessToken: string,
  patientId: string
): Promise<any[]> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/feedback`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ feedback: any[] }>(res);
  return body.feedback;
}


export async function getPatientSessionAiFeedback(accessToken: string, sessionId: string): Promise<{ feedback: string }> {
  const res = await fetch(`${API_BASE}/patient/sessions/${sessionId}/ai-feedback`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<{ feedback: string }>(res);
}

export async function getPatientRecoveryScore(accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}/patient/recovery-score`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<any>(res);
}

export async function getPatientPainLogs(accessToken: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/patient/pain-logs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ pain_logs: any[] }>(res);
  return body.pain_logs;
}

export async function postPatientPainLog(accessToken: string, score: number, location: string, notes: string): Promise<any> {
  const res = await fetch(`${API_BASE}/patient/pain-logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ score, location, notes }),
  });
  return parseJson<any>(res);
}

export async function getPatientRoadmap(accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}/patient/roadmap`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ roadmap: any }>(res);
  return body.roadmap;
}

export async function getDoctorPatientRecommendations(accessToken: string, patientId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/doctor/patients/${patientId}/recommendations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseJson<{ recommendations: any[] }>(res);
  return body.recommendations;
}
