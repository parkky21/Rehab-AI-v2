import { useEffect, useMemo, useRef, useState } from "react";
import { PoseLandmarker, FilesetResolver, NormalizedLandmark } from "@mediapipe/tasks-vision";

import { getPatientAssignments } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Assignment, RepEvent } from "../lib/types";
import { ScoreRing } from "../components/ScoreRing";
import { RepCard, scoreClass } from "../components/RepCard";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/api/v1";

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28],
];

export function PatientExercisePage() {
  const { accessToken } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [wsStatus, setWsStatus] = useState<"Disconnected" | "Connecting" | "Connected">("Disconnected");
  const [feedback, setFeedback] = useState<string>("Select an assignment and start your session.");
  const [feedbackRules, setFeedbackRules] = useState<string[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [targetReps, setTargetReps] = useState(0);
  const [stage, setStage] = useState<string>("-");
  const [sway, setSway] = useState(0);
  const [running, setRunning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Score state
  const [romScore, setRomScore] = useState(0);
  const [stabilityScore, setStabilityScore] = useState(0);
  const [tempoScore, setTempoScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [sessionAvg, setSessionAvg] = useState(0);
  const [repHistory, setRepHistory] = useState<RepEvent[]>([]);

  // Session summary
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const gestureTimerRef = useRef<number | null>(null);
  const gestureCooldownRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const repHistoryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      try {
        const res = await getPatientAssignments(accessToken);
        setAssignments(res);
        if (res.length > 0) {
          setSelectedAssignmentId(res[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load assignments");
      }
    };
    void load();
  }, [accessToken]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId]
  );

  useEffect(() => {
    return () => { stopSession(false); };
  }, []);

  async function initDetector() {
    if (detectorRef.current) return detectorRef.current;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const detector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    detectorRef.current = detector;
    return detector;
  }

  async function startCamera() {
    if (!accessToken || !selectedAssignment || !videoRef.current) return;

    setError(null);
    setSessionEnded(false);
    setCameraActive(true);
    setFeedback("Camera is ready. Bring your hands together to START tracking.");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      await initDetector();
      startLoop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open camera");
      setCameraActive(false);
    }
  }

  function startWsSession() {
    if (!accessToken || !selectedAssignment) return;

    setRunning(true);
    setRepCount(0);
    setTargetReps(selectedAssignment.target_reps);
    setStage("-");
    setSway(0);
    setRomScore(0);
    setStabilityScore(0);
    setTempoScore(0);
    setFinalScore(0);
    setSessionAvg(0);
    setRepHistory([]);
    setFeedbackRules([]);
    setFeedback("Connecting to analysis server...");
    setWsStatus("Connecting");
    setSessionStartTime(Date.now());

    try {
      const socket = new WebSocket(
        `${WS_BASE}/ws/session?token=${encodeURIComponent(accessToken)}&assignment_id=${encodeURIComponent(
          selectedAssignment.id
        )}`
      );
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus("Connected");
        setFeedback("Connected — start moving when ready.");
      };

      socket.onclose = (event) => {
        setWsStatus("Disconnected");
        if (event.code !== 1000) {
          setError(`Connection closed (${event.code}). Start session again.`);
        }
        stopLoop();
        setRunning(false);
      };

      socket.onerror = () => {
        setError("WebSocket error. Check API server.");
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "error") {
          setError(data.detail || "Session error");
          return;
        }
        if (data.type === "warning") {
          setFeedback(data.detail || "Warning");
          return;
        }
        if (data.type === "session_started") {
          setFeedback("Session started — keep posture stable.");
          setTargetReps(data.target_reps ?? 0);
          return;
        }
        if (data.type === "frame_feedback") {
          setRepCount(data.counter ?? 0);
          setStage(data.stage ?? "-");
          setSway(data.sway ?? 0);

          const topRule = (data.feedback_rules || [])[0];
          setFeedback(topRule || data.feedback || "Keep going!");
          setFeedbackRules(data.feedback_rules || []);

          if (data.rep_event) {
            const re: RepEvent = data.rep_event;
            setRomScore(re.scores.rom_score);
            setStabilityScore(re.scores.stability_score);
            setTempoScore(re.scores.tempo_score);
            setFinalScore(re.scores.final_score);
            setSessionAvg(re.session_avg);
            setRepHistory((prev) => [...prev, re]);

            setTimeout(() => {
              repHistoryRef.current?.scrollTo({
                left: repHistoryRef.current.scrollWidth,
                behavior: "smooth",
              });
            }, 50);
          }
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
      wsRef.current = null;
      setRunning(false);
    }
  }

  const drawOverlay = (landmarks: Array<{ x: number; y: number; visibility?: number }>) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    for (const [start, end] of POSE_CONNECTIONS) {
      const a = landmarks[start];
      const b = landmarks[end];
      if (!a || !b) continue;
      if ((a.visibility ?? 1) < 0.35 || (b.visibility ?? 1) < 0.35) continue;

      const gradient = ctx.createLinearGradient(
        a.x * canvas.width, a.y * canvas.height,
        b.x * canvas.width, b.y * canvas.height
      );
      gradient.addColorStop(0, "rgba(0, 212, 255, 0.8)");
      gradient.addColorStop(1, "rgba(139, 92, 246, 0.8)");
      ctx.strokeStyle = gradient;

      ctx.beginPath();
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.stroke();
    }

    for (let i = 0; i < landmarks.length; i++) {
      if (i < 11) continue;
      
      const lm = landmarks[i];
      if ((lm.visibility ?? 1) < 0.35) continue;
      const px = lm.x * canvas.width;
      const py = lm.y * canvas.height;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 212, 255, 0.9)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (gestureTimerRef.current && landmarks[15] && landmarks[16]) {
      const elapsed = Date.now() - gestureTimerRef.current;
      const progress = Math.min(elapsed / 1000, 1.0);
      
      const dominantHand = landmarks[15].y < landmarks[16].y ? landmarks[15] : landmarks[16];
      
      if (progress > 0) {
        ctx.beginPath();
        ctx.arc(dominantHand.x * canvas.width, dominantHand.y * canvas.height - 40, 20, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
        ctx.strokeStyle = "rgba(139, 92, 246, 0.9)";
        ctx.lineWidth = 6;
        ctx.stroke();
        
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        
        const isCurrentlyRunning = wsRef.current?.readyState === WebSocket.OPEN;
        ctx.fillText(isCurrentlyRunning ? "STOP" : "START", dominantHand.x * canvas.width, dominantHand.y * canvas.height - 36);
      }
    }
  };

  const areHandsTogether = (lms: any[]) => {
    const lWrist = lms[15];
    const rWrist = lms[16];
    const lShoulder = lms[11];
    const rShoulder = lms[12];
    
    if (!lWrist || !rWrist || !lShoulder || !rShoulder) return false;
    if ((lWrist.visibility ?? 1) < 0.6 || (rWrist.visibility ?? 1) < 0.6) return false;
    
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    const wristDist = dist(lWrist, rWrist);
    const shoulderWidth = dist(lShoulder, rShoulder);
    
    // Check if wrists are very close to each other (less than ~35% of shoulder width)
    return shoulderWidth > 0 && (wristDist / shoulderWidth) < 0.35;
  };

  const loop = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const detector = detectorRef.current;
    if (!detector) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const result = detector.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0];
    
    if (landmarks && landmarks.length >= 33) {
      drawOverlay(landmarks.slice(0, 33));

      // Gesture Logic
      const handsTogether = areHandsTogether(landmarks);
      
      if (handsTogether) {
        if (Date.now() > gestureCooldownRef.current) {
          if (!gestureTimerRef.current) gestureTimerRef.current = Date.now();
          const elapsed = Date.now() - gestureTimerRef.current;
          
          if (elapsed >= 1000) {
            // Trigger action!
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
              startWsSession();
            } else {
              stopWsSession();
            }
            // Require user to separate hands to trigger again
            gestureCooldownRef.current = Infinity;
            gestureTimerRef.current = null;
          }
        }
      } else {
        gestureTimerRef.current = null;
        if (gestureCooldownRef.current === Infinity) {
           // Provide a short 1 second delay after they separate their hands
           gestureCooldownRef.current = Date.now() + 1000;
        }
      }

      // WebSocket streaming
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "landmark_frame",
            timestamp_ms: Date.now(),
            landmarks: landmarks.slice(0, 33).map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility ?? 1,
            })),
          })
        );
      }
    } else {
      gestureTimerRef.current = null;
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(loop);
  };

  function stopLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function stopWsSession() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session_end" }));
    }
    wsRef.current?.close();
    wsRef.current = null;
    
    setRunning(false);
    setWsStatus("Disconnected");
    if (repCount > 0) {
      setSessionEnded(true);
    }
    setFeedback("Session stopped. Start tracking again or turn camera off.");
  }

  function stopSession(sendEndSignal = true) {
    if (sendEndSignal && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session_end" }));
    }
    wsRef.current?.close();
    wsRef.current = null;

    stopLoop();

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setRunning(false);
    setCameraActive(false);
    setWsStatus("Disconnected");
    if (repCount > 0) {
      setSessionEnded(true);
    }
  }

  // Derived
  const swayPercent = Math.min(sway * 2000, 100); // scale for visual
  const swayLevel = swayPercent < 33 ? "low" : swayPercent < 66 ? "mid" : "high";

  const stageClass =
    stage?.toLowerCase() === "up" ? "stage-up" :
    stage?.toLowerCase() === "down" ? "stage-down" : "stage-idle";

  const sessionDuration = sessionStartTime
    ? Math.round((Date.now() - sessionStartTime) / 1000)
    : 0;

  return (
    <div className="exercise-layout">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Exercise Session</h1>
        <p className="page-subtitle">Real-time AI-powered exercise analysis</p>
      </div>

      {/* Top Bar */}
      <div className="exercise-topbar glass-card" style={{ padding: "0.85rem 1.1rem" }}>
        <div className="exercise-selector">
          <select
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            disabled={running}
          >
            {assignments.length === 0 && <option value="">No assignments available</option>}
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.exercise_name} — {a.target_reps} reps
                {a.notes ? ` (${a.notes})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="exercise-controls">
          <div className={`status-badge ${running ? "live" : "idle"}`}>
            <span className={`status-dot ${wsStatus.toLowerCase()}`} />
            {wsStatus}
          </div>

          {!cameraActive ? (
            <button
              className="btn-primary"
              disabled={!selectedAssignment}
              onClick={startCamera}
            >
              ▶ Turn On Camera
            </button>
          ) : !running ? (
             <>
              <button className="btn-success" onClick={startWsSession}>
                ▶ Start Tracking
              </button>
              <button className="btn-danger" onClick={() => stopSession()} style={{marginLeft: '10px'}}>
                ■ Turn Off
              </button>
             </>
          ) : (
            <button className="btn-danger" onClick={stopWsSession}>
              ■ Stop Tracking
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {/* Main 2-column layout */}
      <div className="exercise-main">
        {/* Left: Camera + Feedback */}
        <div className="camera-section">
          <div className={`camera-container ${cameraActive ? "active" : ""}`}>
            {!cameraActive && (
              <div className="camera-placeholder">
                <span className="camera-placeholder-icon">📷</span>
                <span>Camera feed will appear here</span>
                <span style={{ fontSize: "0.78rem" }}>Select an assignment and click Turn On Camera</span>
              </div>
            )}
            <video ref={videoRef} playsInline muted className="camera-view" />
            <canvas ref={canvasRef} className="pose-overlay" />
            {running && (
              <div className="camera-badge">
                <div className="status-badge live">
                  <span className="status-dot connected" />
                  LIVE
                </div>
              </div>
            )}
          </div>

          {/* Feedback Strip */}
          <div className="feedback-strip">
            <span className="feedback-icon">
              {running ? "💬" : "ℹ️"}
            </span>
            <span className={`feedback-text ${running ? "highlight" : ""}`}>
              {feedback}
            </span>
          </div>

          {/* Additional feedback rules */}
          {feedbackRules.length > 1 && (
            <div className="feedback-strip" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
              <span className="feedback-icon">⚠️</span>
              <span className="feedback-text">{feedbackRules.slice(1).join(" • ")}</span>
            </div>
          )}
        </div>

        {/* Right: Metrics Panel */}
        <div className="metrics-panel">
          {/* Rep Counter */}
          <div className="rep-counter-card glass-card">
            <div className="rep-count-display">
              <span className="rep-current">{repCount}</span>
              {targetReps > 0 && (
                <span className="rep-target">/ {targetReps}</span>
              )}
            </div>
            <p className="rep-label">Repetitions</p>
            <div className={`stage-badge ${stageClass}`} style={{ marginTop: "0.6rem" }}>
              {stage || "-"}
            </div>
          </div>

          {/* Score Rings */}
          <div className="score-rings-row">
            <ScoreRing value={romScore} label="ROM" color="var(--accent-cyan)" size={76} />
            <ScoreRing value={stabilityScore} label="Stability" color="var(--accent-emerald)" size={76} />
            <ScoreRing value={tempoScore} label="Tempo" color="var(--accent-amber)" size={76} />
          </div>

          {/* Final Score */}
          <div className="final-score-card glass-card">
            <p className="final-score-label">Final Score</p>
            <p className={`final-score-value ${scoreClass(finalScore)}`}>
              {finalScore > 0 ? finalScore : "--"}
            </p>
            {sessionAvg > 0 && (
              <p className="session-avg">Session Average: {sessionAvg}</p>
            )}
          </div>

          {/* Sway Meter */}
          <div className="sway-meter glass-card">
            <div className="sway-label-row">
              <span className="sway-label">Body Sway</span>
              <span className="sway-value">{sway.toFixed(4)}</span>
            </div>
            <div className="sway-track">
              <div
                className={`sway-fill sway-${swayLevel}`}
                style={{ width: `${swayPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rep History */}
      {repHistory.length > 0 && (
        <div className="rep-history-section">
          <div className="rep-history-header">
            <span className="rep-history-title">Rep History</span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              {repHistory.length} rep{repHistory.length !== 1 ? "s" : ""} completed
            </span>
          </div>
          <div className="rep-history-scroll" ref={repHistoryRef}>
            {repHistory.map((rep, i) => (
              <RepCard key={i} rep={rep} />
            ))}
          </div>
        </div>
      )}

      {/* Session Summary (shown after ending) */}
      {sessionEnded && !running && (
        <div className="session-summary glass-card glass-card-glow">
          <h2>Session Complete 🎉</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.4rem" }}>
            Great work! Here's your performance summary.
          </p>
          <div className="session-summary-grid">
            <div className="summary-stat">
              <span className="summary-stat-value">{repCount}</span>
              <span className="summary-stat-label">Total Reps</span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-value" style={{ color: "var(--accent-emerald)" }}>
                {sessionAvg > 0 ? sessionAvg : "--"}
              </span>
              <span className="summary-stat-label">Avg Score</span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-value" style={{ color: "var(--accent-amber)" }}>
                {Math.floor(sessionDuration / 60)}:{String(sessionDuration % 60).padStart(2, "0")}
              </span>
              <span className="summary-stat-label">Duration</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
