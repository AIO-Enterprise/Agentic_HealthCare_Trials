/**
 * M10: Auth UI — Login Page
 * Owner: Frontend Dev 1
 * Dependencies: AuthContext, api.js
 *
 * Role-based sign-in page. Routes to appropriate dashboard after login.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { LogIn } from "lucide-react";

const ROLE_ROUTES = {
  admin:           "/admin",
  reviewer:        "/reviewer",
  ethics_reviewer: "/ethics",
  publisher:       "/publisher",
};

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const user = await login(email, password);
      navigate(ROLE_ROUTES[user.role] || "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      {/* Subtle grid background — same as OnboardingPage */}
      <div className="fixed inset-0" style={{
        backgroundColor: "var(--color-sidebar-bg)",
        backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
      }} />

      <div className="relative w-full max-w-md">

        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="sidebar__logo-mark w-8 h-8 rounded-lg">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--color-sidebar-bg)" }} />
          </div>
          <span className="sidebar__app-name text-lg">AgenticMarketing</span>
        </div>

        {/* Login card */}
        <div className="onboarding-card">
          <div className="onboarding-card__accent-bar" />
          <div className="onboarding-card__body space-y-5">

            <div className="text-center">
              <h1 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>
                Sign in to your dashboard
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
                Enter your credentials to continue
              </p>
            </div>

            {error && (
              <div className="alert--error">
                {error}
              </div>
            )}

            {/* Using a form element here is fine — no ProtectedRoute, just a plain page */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-input-text)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-input-text)" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="field-input"
                />
              </div>

              <button type="submit" disabled={loading} className="btn--primary-full mt-2">
                <LogIn size={18} />
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <p className="text-center text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              New company?{" "}
              <Link to="/onboarding" className="font-medium transition-colors"
                style={{ color: "var(--color-accent)" }}>
                Get Started
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}