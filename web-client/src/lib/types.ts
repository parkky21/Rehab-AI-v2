export type Role = "doctor" | "patient";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  created_at: string;
};

export type PatientSearchResult = UserProfile & {
  linked: boolean;
};

export type PatientAssignmentStats = {
  patient: UserProfile;
  assigned_count: number;
  in_progress_count: number;
  completed_count: number;
  total_count: number;
  triage_status?: string;
  risk_score?: number;
};

export type Assignment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  exercise_name: string;
  target_reps: number;
  target_sets?: number;
  rest_interval_seconds?: number;
  protocol?: string;
  due_date?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
  doctor_name?: string;
};

export type ExerciseInfo = {
  name: string;
  target_rom: number;
  ideal_rep_time: number;
  acceptable_sway: number;
};

export type SessionSummary = {
  avg_final_score: number;
  total_reps: number;
  duration_seconds: number;
  reps?: any[];
};

export type SessionDoc = {
  id: string;
  exercise_name: string;
  status: string;
  started_at: string;
  ended_at?: string;
  summary?: SessionSummary;
  doctor_feedback?: string;
};

export type RepScores = {
  rom_score: number;
  stability_score: number;
  tempo_score: number;
  asymmetry_score: number;
  final_score: number;
  rom_value?: number;
  rep_time?: number;
  lstm_final?: number | string;
  transformer_final?: number | string;
};

export type RepEvent = {
  rep_number: number;
  scores: RepScores;
  rep_time: number;
  rom_value: number;
  session_avg: number;
};

export type FrameFeedback = {
  type: "frame_feedback";
  counter: number;
  stage: string | null;
  feedback: string;
  feedback_rules: string[];
  sway: number;
  rep_event: RepEvent | null;
};

export type SessionStarted = {
  type: "session_started";
  session_id: string;
  exercise_name: string;
  target_reps: number;
};

export type WsMessage = FrameFeedback | SessionStarted | {
  type: "error" | "warning";
  detail: string;
};
