import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"doctor" | "patient">("patient");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({ name, username, email, password, role });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="hero">
        <div className="hero-badge">⚡ AI-Powered Rehabilitation</div>
        <h1>Movement Intelligence for Clinical Recovery</h1>
        <p>
          Real-time biomechanical scoring, ML-powered rep analysis, and
          doctor-supervised progression tracking — all from your browser.
        </p>
        <div className="hero-features">
          <div className="hero-feature">
            <div className="hero-feature-icon">🎯</div>
            <span>ROM, Stability & Tempo scoring per rep</span>
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">🤖</div>
            <span>LSTM & Transformer ML models for form analysis</span>
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">📊</div>
            <span>Doctor dashboard with patient progress reports</span>
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">📈</div>
            <span>Adaptive progression engine across sessions</span>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", placeItems: "center", padding: "2rem" }}>
        <div className="auth-card">
          <h2>{mode === "login" ? "Welcome Back" : "Create Account"}</h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to your Rehab AI account"
              : "Get started with your rehab journey"}
          </p>

          <div className="mode-switch">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
              type="button"
            >
              Create Account
            </button>
          </div>

          <form onSubmit={onSubmit}>
            {mode === "register" && (
              <>
                <label>
                  Full Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </label>
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="janesmith"
                    required
                  />
                </label>
                <label>
                  Role
                </label>
                <div className="role-picker">
                  <button
                    type="button"
                    className={`role-option ${role === "patient" ? "active" : ""}`}
                    onClick={() => setRole("patient")}
                  >
                    <span className="role-option-icon">🏃</span>
                    Patient
                  </button>
                  <button
                    type="button"
                    className={`role-option ${role === "doctor" ? "active" : ""}`}
                    onClick={() => setRole("doctor")}
                  >
                    <span className="role-option-icon">🩺</span>
                    Doctor
                  </button>
                </div>
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            {error && <p className="error-text">{error}</p>}

            <button className="btn-primary" disabled={busy} type="submit">
              {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
