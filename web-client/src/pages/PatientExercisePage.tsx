import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

import { getPatientAssignments, postPatientPainLog } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useImmersive } from "../lib/ImmersiveContext";
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
  const { setImmersive } = useImmersive();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [wsStatus, setWsStatus] = useState<"Disconnected" | "Connecting" | "Connected">("Disconnected");
  const [feedback, setFeedback] = useState<string>("Select an assignment and start your session.");
  const [feedbackRules, setFeedbackRules] = useState<string[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [targetReps, setTargetReps] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [targetSets, setTargetSets] = useState(1);
  const [restIntervalSeconds, setRestIntervalSeconds] = useState(60);
  const [isResting, setIsResting] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [jointAngles, setJointAngles] = useState<Record<string, number>>({});
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

  const [popup, setPopup] = useState<{title: string; sub?: string; duration?: number} | null>(null);
  
  const [showPainLogger, setShowPainLogger] = useState(false);
  const [painScoreInput, setPainScoreInput] = useState(0);
  const [painSubmitting, setPainSubmitting] = useState(false);

  // Auto-dismiss popup
  useEffect(() => {
    if (popup && popup.duration) {
      const t = setTimeout(() => setPopup(null), popup.duration);
      return () => clearTimeout(t);
    }
  }, [popup]);

  // Session summary
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // UI state
  const [repDrawerOpen, setRepDrawerOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const gestureTimerRef = useRef<number | null>(null);
  const gestureCooldownRef = useRef<number>(0);
  const isRestingRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTickRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => { 
      stopSession(false);
      setImmersive(false);
    };
  }, []);

  // Session timer
  useEffect(() => {
    if (running && sessionStartTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, sessionStartTime]);

  // Keep ref in sync with state so the render loop can read it
  useEffect(() => { isRestingRef.current = isResting; }, [isResting]);

  // Rest Timer & Set progression
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isResting && restTimeLeft > 0) {
      interval = setInterval(() => {
        setRestTimeLeft((prev) => {
          if (prev <= 1) {
            setIsResting(false);
            setCurrentSet(c => c + 1);
            setFeedback("Get Ready! Starting next set.");
            setPopup({ title: "Get Ready!", sub: "Let's go!", duration: 3000 });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimeLeft]);

  const displayReps = repCount - ((currentSet - 1) * targetReps);

  useEffect(() => {
    if (targetReps > 0 && displayReps >= targetReps && !isResting) {
      if (currentSet < targetSets) {
        setIsResting(true);
        setRestTimeLeft(restIntervalSeconds);
        setFeedback(`Set ${currentSet} complete! Resting...`);
        setPopup({ title: "Rest Time", sub: "Take a breather.", duration: 3000 });
      } else {
        setFeedback("All sets completed! Finishing session...");
        if (!sessionEnded && !popup) {
          setPopup({ title: "Done Hooray!", sub: "Session fully complete. Great work!", duration: 4000 });
          stopWsSession();
          setTimeout(() => {
            stopSession(true);
            setImmersive(false);
            setShowPainLogger(true);
          }, 3500);
        }
      }
    }
  }, [displayReps, targetReps, isResting, currentSet, targetSets, restIntervalSeconds, sessionEnded, popup, navigate]);

  // Enter immersive when camera activates
  useEffect(() => {
    setImmersive(cameraActive);
  }, [cameraActive, setImmersive]);

  // Initialize camera stream after video element mounts
  useEffect(() => {
    if (!cameraActive || !videoRef.current) return;

    let cancelled = false;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled || !videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        await initDetector();
        startLoop();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open camera");
          setCameraActive(false);
        }
      }
    };

    void initCamera();

    return () => {
      cancelled = true;
    };
  }, [cameraActive]);

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

  function startCamera() {
    if (!accessToken || !selectedAssignment) return;

    setError(null);
    setSessionEnded(false);
    setCameraActive(true);
    setFeedback("Initializing camera...");
  }

  function startWsSession() {
    if (!accessToken || !selectedAssignment) return;

    setRunning(true);
    setRepCount(0);
    setTargetReps(selectedAssignment.target_reps);
    setCurrentSet(1);
    setTargetSets(1);
    setIsResting(false);
    setRestTimeLeft(0);
    setJointAngles({});
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
    setElapsedTime(0);

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
        if (event.code !== 1000 && event.code !== 1005) {
          setError(`Connection closed (${event.code}). Start session again.`);
        }
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
          setTargetSets(data.target_sets ?? 1);
          setRestIntervalSeconds(data.rest_interval_seconds ?? 60);
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
      gradient.addColorStop(0, "rgba(6, 182, 212, 0.8)");
      gradient.addColorStop(1, "rgba(167, 139, 250, 0.8)");
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
      ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
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
        ctx.strokeStyle = "rgba(167, 139, 250, 0.9)";
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

    return shoulderWidth > 0 && (wristDist / shoulderWidth) < 0.35;
  };

  const loop = () => {
    try {
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

      // Prevent identical timestamps to MediaPipe by ensuring strictly monotonically increasing times
      let startTimeMs = performance.now();
      if (lastVideoTickRef.current) {
        if (startTimeMs <= lastVideoTickRef.current) {
          startTimeMs = lastVideoTickRef.current + 1;
        }
      }
      lastVideoTickRef.current = startTimeMs;

      const result = detector.detectForVideo(video, startTimeMs);
      const landmarks = result.landmarks[0];

      if (landmarks && landmarks.length >= 33) {
        drawOverlay(landmarks.slice(0, 33));

        const handsTogether = areHandsTogether(landmarks);

        if (handsTogether) {
          if (Date.now() > gestureCooldownRef.current) {
            if (!gestureTimerRef.current) gestureTimerRef.current = Date.now();
            const elapsed = Date.now() - gestureTimerRef.current;

            if (elapsed >= 1000) {
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                startWsSession();
              } else {
                stopWsSession();
              }
              gestureCooldownRef.current = Infinity;
              gestureTimerRef.current = null;
            }
          }
        } else {
          gestureTimerRef.current = null;
          if (gestureCooldownRef.current === Infinity) {
            gestureCooldownRef.current = Date.now() + 1000;
          }
        }

        if (wsRef.current?.readyState === WebSocket.OPEN && !isRestingRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: "landmark_frame",
              timestamp_ms: Date.now(),
              landmarks: landmarks.slice(0, 33).map((lm) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility ?? 1.0,
              })),
            })
          );
        }
      } else {
        gestureTimerRef.current = null;
      }
    } catch (err) {
      console.error("Error in render loop:", err);
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const stopWsSession = () => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "session_end" }));
      }
      wsRef.current.close(1000, "User stopped session");
      wsRef.current = null;
    }
    setRunning(false);
    setWsStatus("Disconnected");
    if (repCount > 0) {
      setSessionEnded(true);
    }
  };

  const stopSession = (save = true) => {
    stopWsSession();
    stopLoop();
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setRunning(false);
    if (!save) {
      setSessionEnded(false);
    } else if (repCount > 0) {
      setSessionEnded(true);
    }
  };

  // Derived
  const swayPercent = Math.min(sway * 2000, 100);
  const swayLevel = swayPercent < 33 ? "low" : swayPercent < 66 ? "mid" : "high";

  const stageClass =
    stage?.toLowerCase() === "up" ? "stage-up" :
    stage?.toLowerCase() === "down" ? "stage-down" : "stage-idle";

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const sessionDuration = sessionStartTime
    ? Math.round((Date.now() - sessionStartTime) / 1000)
    : 0;

  // ─── NON-IMMERSIVE: assignment selection screen ───
  if (!cameraActive) {
    return (
      <div className="exercise-layout" id="exercise-page">
        <div className="page-header">
          <h1 className="page-title">Exercise Session</h1>
          <p className="page-subtitle">Real-time AI-powered exercise analysis</p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="exercise-dashboard-grid">
          <div className="exercise-start-card glass-card glass-card-glow">
            <div className="start-card-inner">
              <div className="start-card-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
              <h2 className="start-card-title">Ready to Begin?</h2>
              <p className="start-card-desc">Select your assigned exercise and turn on the camera to start your AI-guided session.</p>

              <div className="start-card-select">
                <label className="start-card-label">Exercise Assignment</label>
                <select
                  value={selectedAssignmentId}
                  onChange={(e) => setSelectedAssignmentId(e.target.value)}
                >
                  {assignments.length === 0 && <option value="">No assignments available</option>}
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.exercise_name} — {a.target_reps} reps {a.doctor_name ? `(Assigned by Dr. ${a.doctor_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn-primary btn-lg"
                disabled={!selectedAssignment}
                onClick={startCamera}
                id="start-camera-btn"
                style={{ width: "100%", marginTop: "1rem" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                Turn On Camera
              </button>
            </div>
          </div>

          {/* Right Column: Instructions */}
          <div className="exercise-details-card glass-card">
             <div className="details-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
               <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
               <h3 style={{ margin: 0 }}>How it Works</h3>
             </div>
             <div className="details-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               <div className="detail-step" style={{ display: 'flex', gap: '1rem' }}>
                 <div className="detail-step-num" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-cyan-glow)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>1</div>
                 <div className="detail-step-text">
                   <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Position yourself</h4>
                   <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ensure your full body is visible in the camera frame.</p>
                 </div>
               </div>
               <div className="detail-step" style={{ display: 'flex', gap: '1rem' }}>
                 <div className="detail-step-num" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-cyan-glow)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>2</div>
                 <div className="detail-step-text">
                   <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Hands together to Start</h4>
                   <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bring your hands together in front of you for 1 second to start or stop the tracker.</p>
                 </div>
               </div>
               <div className="detail-step" style={{ display: 'flex', gap: '1rem' }}>
                 <div className="detail-step-num" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-cyan-glow)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>3</div>
                 <div className="detail-step-text">
                   <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Follow AI Feedback</h4>
                   <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Perform the exercise. The AI will track your Range of Motion, Stability, and Tempo.</p>
                 </div>
               </div>
             </div>
             
             {selectedAssignment && selectedAssignment.notes && (
               <div className="doctor-note-box" style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: 'var(--radius-md)' }}>
                 <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-purple)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                   Doctor's Note
                 </h4>
                 <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{selectedAssignment.notes}</p>
               </div>
             )}
          </div>
        </div>

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
                  {formatTime(sessionDuration)}
                </span>
                <span className="summary-stat-label">Duration</span>
              </div>
            </div>
            {repHistory.length > 0 && (
              <div className="summary-rep-history">
                <h3 style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>Rep Breakdown</h3>
                <div className="rep-history-scroll">
                  {repHistory.map((rep, i) => (
                    <RepCard key={i} rep={rep} />
                  ))}
                </div>
              </div>
            )}
            
            <button
              className="btn-primary"
              onClick={() => setShowPainLogger(true)}
              style={{ width: "100%", marginTop: "2rem", padding: "1rem", fontSize: "1.1rem", background: "var(--accent-coral)", borderColor: "var(--accent-coral)" }}
            >
              Log Pain & Complete Session
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── IMMERSIVE MODE: fullscreen camera with HUD overlays ───
  return (
    <div className="immersive-view" id="exercise-immersive">
      {/* Camera Feed (fullscreen) */}
      <div className="immersive-camera">
        <video ref={videoRef} playsInline muted className="immersive-video" />
        <canvas ref={canvasRef} className="immersive-canvas" />
      </div>

      {/* Top Bar Controls */}
      <div className={`hud-top-bar ${showControls ? "" : "hud-hidden"}`}>
        <div className="hud-top-left">
          <div className={`hud-status-badge ${running ? "live" : "idle"}`}>
            <span className={`status-dot ${wsStatus.toLowerCase()}`} />
            {running ? "LIVE" : wsStatus}
          </div>
          {running && (
            <div className="hud-timer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {formatTime(elapsedTime)}
            </div>
          )}
        </div>

        <div className="hud-top-center">
          <select
            className="hud-select"
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            disabled={running}
          >
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.exercise_name} — {a.target_reps} reps
              </option>
            ))}
          </select>
        </div>

        <div className="hud-top-right">
          {/* Controls */}
          {!running ? (
            <>
              <button className="hud-btn hud-btn-primary" onClick={startWsSession}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start
              </button>
              <button className="hud-btn hud-btn-danger" onClick={() => stopSession()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                Exit
              </button>
            </>
          ) : (
            <button className="hud-btn hud-btn-danger" onClick={stopWsSession}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Left HUD Panel — Transparent Stats Overlay */}
      <div className={`hud-left-panel ${running ? "visible" : ""}`}>
        {/* Set Dots */}
        <div className="hud-sets" style={{ display: 'flex', gap: '8px', marginBottom: '1rem', justifyContent: 'center' }}>
          {Array.from({ length: targetSets }).map((_, i) => (
            <div key={i} style={{
              width: '12px', height: '12px', borderRadius: '50%',
              background: i + 1 < currentSet ? 'var(--accent-emerald)' : i + 1 === currentSet ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.2)',
              boxShadow: i + 1 === currentSet ? '0 0 10px var(--accent-cyan)' : 'none'
            }} />
          ))}
        </div>

        {/* Rep Counter */}
        <div className="hud-rep-counter">
          <div className="hud-rep-display">
            <span className="hud-rep-current">{isResting ? "REST" : displayReps}</span>
            {!isResting && targetReps > 0 && (
              <span className="hud-rep-target">/ {targetReps}</span>
            )}
          </div>
          <div className="hud-rep-label">{isResting ? "TIMER" : "REPS"}</div>
          {!isResting && (
            <div className={`hud-stage-badge ${stageClass}`}>
              {stage || "-"}
            </div>
          )}
          {isResting && (
            <div style={{ fontSize: '2rem', color: 'var(--accent-cyan)', fontWeight: 'bold', marginTop: '0.5rem' }}>
              {formatTime(restTimeLeft)}
            </div>
          )}
        </div>

        {/* Score Rings */}
        <div className="hud-scores">
          <ScoreRing value={romScore} label="ROM" color="var(--accent-cyan)" compact />
          <ScoreRing value={stabilityScore} label="Stability" color="var(--accent-emerald)" compact />
          <ScoreRing value={tempoScore} label="Tempo" color="var(--accent-amber)" compact />
        </div>

        {/* Final Score */}
        <div className="hud-final-score">
          <span className="hud-final-label">SCORE</span>
          <span className={`hud-final-value ${scoreClass(finalScore)}`}>
            {finalScore > 0 ? finalScore : "--"}
          </span>
          {sessionAvg > 0 && (
            <span className="hud-session-avg">avg {sessionAvg}</span>
          )}
        </div>

        {/* Sway */}
        <div className="hud-sway">
          <div className="hud-sway-header">
            <span>SWAY</span>
            <span className="hud-sway-val">{sway.toFixed(4)}</span>
          </div>
          <div className="hud-sway-track">
            <div
              className={`hud-sway-fill sway-${swayLevel}`}
              style={{ width: `${swayPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen Animated Popups */}
      {popup && (
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", zIndex: 100, backdropFilter: "blur(4px)",
          animation: "fadeIn 0.3s ease-out"
        }}>
          <div style={{
            background: "rgba(30, 30, 40, 0.9)", border: "2px solid var(--accent-cyan)",
            padding: "2rem 4rem", borderRadius: "24px", textAlign: "center",
            boxShadow: "0 0 40px rgba(6, 182, 212, 0.4)",
            animation: "popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
          }}>
            <h1 style={{ fontSize: "3rem", margin: "0 0 0.5rem 0", color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "2px" }}>
              {popup.title}
            </h1>
            {popup.sub && (
              <p style={{ fontSize: "1.2rem", margin: 0, color: "var(--text-secondary)" }}>{popup.sub}</p>
            )}
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
          `}</style>
        </div>
      )}

      {/* End of Session Pain Logger Modal */}
      {showPainLogger && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.85)", zIndex: 9999, backdropFilter: "blur(12px)",
          animation: "fadeIn 0.3s ease-out"
        }}>
          <div className="glass-card" style={{ width: "90%", maxWidth: "450px", padding: "2.5rem", textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
            <h2 style={{ color: "var(--accent-coral)", marginBottom: "0.5rem", fontSize: "1.8rem" }}>Session Complete! 🎉</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2.5rem", fontSize: "1.1rem" }}>Please log your current pain level before continuing.</p>
            
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "2.5rem" }}>
              <input 
                type="range" 
                min="0" max="10" 
                value={painScoreInput} 
                onChange={e => setPainScoreInput(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent-coral)", height: "8px" }}
              />
              <span style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--text-primary)", width: "40px" }}>{painScoreInput}</span>
            </div>
            
            <button 
              className="btn-primary" 
              onClick={async () => {
                setPainSubmitting(true);
                try {
                  await postPatientPainLog(accessToken ?? "", painScoreInput, "General Session Pain", "Logged at end of session");
                } catch (e) {
                  console.error(e);
                }
                setPainSubmitting(false);
                setShowPainLogger(false);
                navigate("/patient/progress");
              }}
              disabled={painSubmitting}
              style={{ width: "100%", background: "var(--accent-coral)", borderColor: "var(--accent-coral)", padding: "1rem", fontSize: "1.1rem", borderRadius: "12px", color: "#fff" }}
            >
              {painSubmitting ? "Saving..." : "Submit & View Progress"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="hud-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
        </div>
      )}
    </div>
  );
}
