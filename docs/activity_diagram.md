# Rehab AI — Activity Diagrams

> **Scope:** Current production architecture only — React (Vite + TypeScript) web client, FastAPI Python server, MongoDB persistence.  
> The legacy Tkinter desktop UI (`app.py`) is **deprecated** and excluded from these diagrams.

---

## 1. Top-Level System Activity Diagram

This diagram shows the complete lifecycle of the application from the perspective of **both actors** (Doctor & Patient) and the **system** (Server + Database).

```mermaid
flowchart TD
    Start((●)) --> Auth{User Role?}

    Auth -- Doctor --> D_Login[Doctor Logs In]
    Auth -- Patient --> P_Login[Patient Logs In]

    %% ===================== DOCTOR SWIMLANE =====================
    subgraph DoctorFlow["🩺 Doctor Flow"]
        D_Login --> D_Dashboard[Access Doctor Dashboard]
        D_Dashboard --> D_Choice{Action?}

        D_Choice --> D_Link[Search & Link Patient]
        D_Choice --> D_Assign[Create Exercise Assignment]
        D_Choice --> D_Report[View Patient Report]

        D_Link --> D_Search[Search by Name / Email / Username]
        D_Search --> D_LinkAPI["POST /doctor/patients/link"]
        D_LinkAPI --> D_Dashboard

        D_Assign --> D_SelectPatient[Select Linked Patient]
        D_SelectPatient --> D_SelectExercise[Select Exercise & Target Reps]
        D_SelectExercise --> D_AssignAPI["POST /doctor/assignments"]
        D_AssignAPI --> D_Dashboard

        D_Report --> D_SelectReport[Select Patient]
        D_SelectReport --> D_ReportAPI["GET /doctor/patients/:id/report"]
        D_ReportAPI --> D_ViewReport[View Avg Score, Trend,\nAdherence %, Progression]
        D_ViewReport --> D_Dashboard
    end

    %% ===================== PATIENT SWIMLANE =====================
    subgraph PatientFlow["🏃 Patient Flow"]
        P_Login --> P_Choice{Action?}

        P_Choice --> P_Exercise[Exercise Session]
        P_Choice --> P_Progress[View My Progress]

        P_Progress --> P_ProgressAPI["GET /patient/progress\nGET /patient/sessions"]
        P_ProgressAPI --> P_ViewProgress[View Avg Score, Trend,\nAdherence, Session History]
        P_ViewProgress --> P_Choice

        P_Exercise --> P_FetchAssignments["GET /patient/assignments"]
        P_FetchAssignments --> P_SelectAssignment[Select Assignment]
        P_SelectAssignment --> P_Camera[Turn On Camera]
        P_Camera --> P_InitMP[Initialize Browser MediaPipe\nWASM Pose Landmarker]
        P_InitMP --> P_DetectionLoop[Start Pose Detection Loop]
        P_DetectionLoop --> P_GestureWait{"Hands Together\nGesture ≥ 1s?"}
        P_GestureWait -- No --> P_DetectionLoop
        P_GestureWait -- Yes --> P_StartSession[Start WebSocket Session]
    end

    %% ===================== SESSION SWIMLANE =====================
    subgraph SessionFlow["⚡ Real-Time Exercise Session"]
        P_StartSession --> WS_Connect["WS /ws/session\n?token=JWT&assignment_id=ID"]
        WS_Connect --> WS_Auth{Server:\nAuthenticate JWT &\nVerify Assignment}
        WS_Auth -- Invalid --> WS_Error[Send Error & Close]
        WS_Auth -- Valid --> WS_Provision[Provision\nRealtimeSessionRuntime]
        WS_Provision --> WS_SessionDoc[Insert Session Doc\ninto MongoDB]
        WS_SessionDoc --> WS_Started["Send session_started\npacket to Client"]
        WS_Started --> FrameLoop

        subgraph FrameLoop["🔁 Frame Processing Loop"]
            FL_Capture[Capture Video Frame] --> FL_MediaPipe[Browser MediaPipe:\nExtract 33 Landmarks]
            FL_MediaPipe --> FL_DrawOverlay[Draw Skeleton Overlay\non Canvas]
            FL_MediaPipe --> FL_Send["Send landmark_frame\nJSON over WebSocket"]

            FL_Send --> BE_Smooth[EMA Landmark Smoother]
            BE_Smooth --> BE_Process[Process Landmarks\n& Compute Hip Center]
            BE_Process --> BE_Sway[Sway & Stability Tracking]
            BE_Sway --> BE_FSM[Exercise FSM\nState Tracking]
            BE_FSM --> BE_RepCheck{Repetition\nCompleted?}

            BE_RepCheck -- No --> BE_Feedback[Feedback Engine\nEvaluation]
            BE_Feedback --> FL_FeedbackSend["Send frame_feedback\nto Client"]
            FL_FeedbackSend --> FL_UpdateUI[Update Feedback Text,\nStage Badge, Sway Meter]
            FL_UpdateUI --> FL_GestureCheck{"Stop Gesture\nor Target Reached?"}
            FL_GestureCheck -- No --> FL_Capture
            FL_GestureCheck -- Yes --> SessionEnd

            BE_RepCheck -- Yes --> BE_RuleScore[Rule-Based Scoring:\nROM, Stability, Tempo]
            BE_RuleScore --> BE_MLScore[ML Inference:\nLSTM + Transformer]
            BE_MLScore --> BE_Ensemble["Ensemble Blend:\n45% LSTM + 20% TF + 35% Rules"]
            BE_Ensemble --> BE_RepDB[Insert rep_event\ninto MongoDB]
            BE_RepDB --> BE_RepSend["Send rep_event\nin frame_feedback"]
            BE_RepSend --> FL_UpdateScores[Update Score Rings,\nRep History Cards,\nSession Average]
            FL_UpdateScores --> FL_GestureCheck
        end
    end

    %% ===================== POST-SESSION =====================
    subgraph PostSession["📊 Post-Session"]
        SessionEnd[Stop Session &\nClose WebSocket] --> PS_Finalize[Finalize Session Summary\non Server]
        PS_Finalize --> PS_UpdateDB[Update Session Doc\nin MongoDB as completed]
        PS_UpdateDB --> PS_MarkAssignment[Mark Assignment\nas completed]
        PS_MarkAssignment --> PS_FetchScores[Fetch Last 5\nSession Scores]
        PS_FetchScores --> PS_Progression[Progression Engine:\nCompute Decision]
        PS_Progression --> PS_ProgressionDB[Insert Progression\nSnapshot into MongoDB]
        PS_ProgressionDB --> PS_ClientSummary[Show Session Complete\nDashboard on Client]
        PS_ClientSummary --> P_Choice
    end

    WS_Error --> P_Choice
```

---

## 2. Authentication & Authorization Activity

```mermaid
flowchart TD
    A((●)) --> B[User Opens App]
    B --> C{Has Valid\nAccess Token?}
    C -- Yes --> D[Decode JWT & Fetch /auth/me]
    D --> E{Token Valid?}
    E -- Yes --> F{User Role?}
    F -- doctor --> G[Redirect to /doctor]
    F -- patient --> H[Redirect to /patient/exercise]
    E -- No --> I[Redirect to /login]

    C -- No --> I

    I --> J{Action?}
    J -- Register --> K["POST /auth/register\n(name, email, username, password, role)"]
    K --> L[Hash Password & Insert User]
    L --> M[Return Access + Refresh Tokens]

    J -- Login --> N["POST /auth/login\n(email, password)"]
    N --> O{Credentials Valid?}
    O -- No --> P[Return 401 Unauthorized]
    P --> I
    O -- Yes --> M

    M --> Q[Store Tokens in Client]
    Q --> F

    style P fill:#ff6b6b,color:#fff
```

---

## 3. Doctor Workflow Activity

```mermaid
flowchart TD
    A((●)) --> B[Doctor Dashboard Loads]
    B --> C["Parallel API Calls:\nGET /doctor/patients\nGET /exercises\nGET /doctor/patients/assignment-stats"]
    C --> D[Render Dashboard:\nLink Panel, Assign Panel,\nPatient Table, Report Panel]

    D --> E{Doctor Action?}

    %% Link Patient
    E -- Link Patient --> F[Type Search Query]
    F --> G["GET /doctor/patients/search?q=..."]
    G --> H[Display Search Results\nwith Linked Badge]
    H --> I[Select Patient from Results]
    I --> J["POST /doctor/patients/link\n(patient_id or email or username)"]
    J --> K[Upsert doctor_patient_links\nin MongoDB]
    K --> L[Refresh Patient List & Stats]
    L --> D

    %% Assign Exercise
    E -- Assign Exercise --> M[Select Patient from Dropdown]
    M --> N[Select Exercise Type]
    N --> O[Set Target Reps]
    O --> P["POST /doctor/assignments"]
    P --> Q{Exercise\nSupported?}
    Q -- No --> R[Return 400 Error]
    R --> D
    Q -- Yes --> S{Patient\nLinked?}
    S -- No --> T[Return 403 Forbidden]
    T --> D
    S -- Yes --> U[Insert Assignment Doc\nstatus: assigned]
    U --> V[Refresh Stats Table]
    V --> D

    %% View Report
    E -- View Report --> W[Select Patient Row\nin Stats Table]
    W --> X["GET /doctor/patients/:id/report\n(?exercise_name=optional)"]
    X --> Y[Server Aggregates:\n- Completed Sessions\n- Average Scores\n- Adherence %\n- Score Trend\n- Latest Progression Snapshot]
    Y --> Z[Render Report:\nAvg Score, Trend Icon,\nAdherence %, Score Bars,\nProgression Decision]
    Z --> D

    E -- Done --> End((●))
```

---

## 4. Patient Exercise Session — Detailed Activity

```mermaid
flowchart TD
    A((●)) --> B["GET /patient/assignments\n(status: assigned | in_progress)"]
    B --> C[Display Assignment Dropdown]
    C --> D[Patient Selects Assignment]
    D --> E[Click Turn On Camera]
    E --> F["navigator.mediaDevices\n.getUserMedia({ video: true })"]
    F --> G{Camera\nGranted?}
    G -- No --> H[Show Error Message]
    H --> C
    G -- Yes --> I[Start Video Playback]
    I --> J["Download & Initialize\nMediaPipe Pose Landmarker\n(WASM, float16)"]
    J --> K[Start requestAnimationFrame Loop]
    K --> L[Show: Bring hands\ntogether to START]

    L --> M[Detect Pose in Frame]
    M --> N{Landmarks\nDetected?}
    N -- No --> M
    N -- Yes --> O[Draw Skeleton Overlay\non Canvas]
    O --> P{Wrists Within\n35% Shoulder Width?}
    P -- No --> Q[Reset Gesture Timer]
    Q --> M
    P -- Yes --> R{Held for\n≥ 1 Second?}
    R -- No --> S[Draw Progress Ring\non Dominant Hand]
    S --> M
    R -- Yes --> T{WebSocket\nAlready Open?}
    T -- No --> StartWS
    T -- Yes --> StopWS

    subgraph StartWS["Start Session"]
        U[Open WebSocket\nwith JWT + assignment_id] --> V[Reset All Scores & UI]
        V --> W["Server: Authenticate,\nVerify Assignment,\nProvision Runtime"]
        W --> X[Receive session_started]
        X --> Y[Begin Streaming\nlandmark_frame packets]
    end

    subgraph FrameProcessing["Per-Frame Server Processing"]
        Y --> BE1[Validate 33 Landmarks]
        BE1 --> BE2[EMA Smooth Landmarks]
        BE2 --> BE3["process_landmarks()\nCompute Hip Center"]
        BE3 --> BE4[SwayTracker.update\nhip_center_x]
        BE4 --> BE5["Exercise.process()\nFSM State Machine"]
        BE5 --> BE6{Rep\nCompleted?}
        BE6 -- No --> BE7[FeedbackEngine.evaluate\nwith context]
        BE7 --> BE8["Send frame_feedback:\ncounter, stage, sway,\nfeedback_rules"]
        BE8 --> UI1[Update: Rep Count,\nStage Badge, Sway Meter,\nFeedback Text]
        UI1 --> M

        BE6 -- Yes --> SC1["Rule Scoring:\ncompute_rom_score()\ncompute_stability_score()\ncompute_tempo_score()"]
        SC1 --> SC2["ML Scoring:\nLSTM.score_rep()\nTransformer.score_rep()"]
        SC2 --> SC3["Ensemble:\nfinal = 0.45×LSTM\n+ 0.20×TF + 0.35×Rules"]
        SC3 --> SC4[Insert rep_event\ninto MongoDB]
        SC4 --> SC5["Send rep_event in\nframe_feedback response"]
        SC5 --> UI2[Update: Score Rings\nROM / Stability / Tempo,\nFinal Score, Session Avg,\nAppend Rep Card]
        UI2 --> M
    end

    subgraph StopWS["Stop Session"]
        SW1["Send session_end\nJSON message"] --> SW2[Close WebSocket]
        SW2 --> SW3["Server: session.end_session()\nCompute Summary"]
        SW3 --> SW4[Update Session Doc\nstatus → completed]
        SW4 --> SW5[Update Assignment\nstatus → completed]
        SW5 --> SW6["Fetch Last 5 Scores\nfor this Exercise"]
        SW6 --> SW7["ProgressionState\n.compute_progression()"]
        SW7 --> SW8[Insert progression_snapshot\ninto MongoDB]
        SW8 --> SW9["Client: Show Session\nComplete Dashboard\n(Reps, Avg Score, Duration)"]
    end
```

---

## 5. Patient Progress View Activity

```mermaid
flowchart TD
    A((●)) --> B[Patient Navigates to\n/patient/progress]
    B --> C["Parallel Fetch:\nGET /patient/progress\nGET /patient/sessions"]

    C --> D["Server Computes:\n- All Completed Sessions\n- Average Final Score\n- Trend Label (improving/stable/declining)\n- Adherence % (completed / total assignments)\n- Latest Progression Snapshot"]

    D --> E[Render Progress Dashboard]

    E --> F[Stat Cards:\nAvg Score | Trend | Adherence | Sessions]
    E --> G[Recent Scores Bar Chart]
    E --> H[Progression Decision:\nAction + Reason]
    E --> I[Session History List:\nExercise, Date, Score, Reps, Status]
```

---

## 6. Scoring Pipeline — Internal Activity

```mermaid
flowchart TD
    A[Rep Completed\nby FSM] --> B["ROMTracker.complete_rep()\n→ max_angle - min_angle"]
    B --> C["TempoTracker.complete_rep()\n→ elapsed seconds"]
    C --> D["SwayTracker.current_std\n→ hip stability metric"]

    D --> RulePath
    D --> MLPath

    subgraph RulePath["Rule-Based Scoring"]
        R1["ROM Score =\nmin(user_rom / target_rom × 100, 100)"]
        R2["Stability Score =\n100 - (sway / acceptable_sway) × factor"]
        R3["Tempo Score =\n100 - |deviation| × factor × direction_mult\n(fast: ×2, slow: ×0.5)"]
        R1 --> R4["Final Rule Score =\nw_rom×ROM + w_stability×Stability\n+ w_tempo×Tempo"]
        R2 --> R4
        R3 --> R4
    end

    subgraph MLPath["ML Model Scoring"]
        M1[Retrieve Frame Buffer\nfrom LSTM Scorer]
        M1 --> M2["LSTM Inference\n→ Predicted Score"]
        M3[Retrieve Frame Buffer\nfrom Transformer Scorer]
        M3 --> M4["Transformer Inference\n→ Predicted Score"]
    end

    R4 --> Ensemble
    M2 --> Ensemble
    M4 --> Ensemble

    subgraph Ensemble["Ensemble Blending"]
        E1["For each metric\n(ROM, Stability, Tempo, Final):\nblended = 0.45×LSTM + 0.20×TF + 0.35×Rules"]
    end

    Ensemble --> F[Store as last_rep_scores]
    F --> G["Broadcast rep_event\nvia WebSocket"]
    F --> H[Insert into MongoDB\nrep_events collection]
```

---

## 7. AI Progression Engine Activity

```mermaid
flowchart TD
    A[Session Ends] --> B[Fetch Last 5 Completed\nSession Scores from MongoDB]
    B --> C{5 Scores\nAvailable?}
    C -- No --> D["Action: none\nReason: Insufficient data"]
    C -- Yes --> E[Compute Average\nof Last 5 Scores]
    E --> F{Average ≥ 80?}
    F -- Yes --> G["Action: increase_difficulty\nReason: Consistently scoring above 80"]
    F -- No --> H{Average ≤ 50?}
    H -- Yes --> I["Action: decrease_difficulty\nReason: Consistently scoring below 50"]
    H -- No --> J["Action: none\nReason: Performance is within\nacceptable range"]

    G --> K[Insert progression_snapshot\ninto MongoDB]
    I --> K
    J --> K

    K --> L["Snapshot Contains:\n- patient_id, doctor_id\n- exercise_name\n- latest_score\n- recent_scores[]\n- target_reps\n- target_rom_multiplier\n- sway_tolerance_multiplier\n- decision: {action, reason}\n- snapshot_at"]
```

---

## 8. Supported Exercises

The system currently supports **10 exercises**, each with a custom FSM and `ExerciseConfig`:

| Exercise | FSM Tracking | Key Metric |
|---|---|---|
| Squats | Hip-to-knee vertical distance | Depth ROM |
| Sit To Stand | Seated ↔ Standing transitions | Verticality |
| Heel Raises | Ankle elevation | Calf ROM |
| Standing Hip Abduction | Lateral leg angle | Abduction ROM |
| Standing Hip Extension | Backward leg angle | Extension ROM |
| Leg Raises | Forward leg elevation | Flexion ROM |
| Marching | Alternating knee lifts | Bilateral tracking |
| Forward Arm Raises | Shoulder flexion angle | Arm ROM |
| Side Arm Raises | Shoulder abduction angle | Arm ROM |
| Wall Push-ups | Elbow angle changes | Push-up depth |

---

## 9. MongoDB Collections Used

```mermaid
erDiagram
    users {
        ObjectId _id
        string name
        string email
        string username
        string password_hash
        string role
        datetime created_at
    }

    doctor_patient_links {
        ObjectId _id
        ObjectId doctor_id
        ObjectId patient_id
        string status
        datetime created_at
    }

    exercise_assignments {
        ObjectId _id
        ObjectId doctor_id
        ObjectId patient_id
        string exercise_name
        int target_reps
        string status
        datetime created_at
    }

    sessions {
        ObjectId _id
        ObjectId assignment_id
        ObjectId doctor_id
        ObjectId patient_id
        string exercise_name
        int target_reps
        string status
        datetime started_at
        datetime ended_at
        object summary
    }

    rep_events {
        ObjectId _id
        ObjectId session_id
        ObjectId patient_id
        ObjectId doctor_id
        string exercise_name
        int rep_number
        object scores
        float rep_time
        float rom_value
        datetime created_at
    }

    progression_snapshots {
        ObjectId _id
        ObjectId patient_id
        ObjectId doctor_id
        string exercise_name
        float latest_score
        array recent_scores
        object decision
        datetime snapshot_at
    }

    users ||--o{ doctor_patient_links : "doctor links to"
    users ||--o{ doctor_patient_links : "patient linked by"
    users ||--o{ exercise_assignments : "assigned to"
    exercise_assignments ||--o{ sessions : "starts"
    sessions ||--o{ rep_events : "contains"
    sessions ||--o| progression_snapshots : "triggers"
```
