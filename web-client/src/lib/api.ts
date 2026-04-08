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
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
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
