import { useState } from "react";
import { useRouter } from "wouter";
import { useAuth } from "../hooks/useAuth";
import "../styles/auth.css";

export function LoginPage() {
  const [, navigate] = useRouter();
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validation
    if (!email || !password) {
      setFormError("Please fill in all fields");
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      navigate("/");
    } else {
      setFormError(result.error || "Login failed");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Sign In</h1>
        <p className="auth-subtitle">Welcome back to German Phrase Master</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
            />
          </div>

          {(formError || error) && (
            <div className="error-message">{formError || error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="auth-button"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{" "}
            <a href="/register" className="auth-link">
              Create one
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

