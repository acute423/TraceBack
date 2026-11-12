import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Search, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/useAuth";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(form);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Unable to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-layout">
        <aside className="auth-story">
          <Link to="/" className="brand auth-brand" aria-label="TraceBack home">
            <span className="brand-mark"><Search size={19} strokeWidth={2.5} /></span>
            <span>TraceBack<span className="brand-period">.</span></span>
          </Link>
          <div className="auth-story-copy">
            <span className="eyebrow">A COMMUNITY THAT CARES</span>
            <h2>Some things are too important to lose.</h2>
            <p>Thoughtful matches and a trusted community help bring the things you care about back home.</p>
            <div className="auth-proof"><span><Eye size={16} /></span><span><strong>Private by design</strong><small>Your contact details stay protected until it’s safe to connect.</small></span></div>
          </div>
          <span className="auth-story-footer">Made for the things that matter.</span>
        </aside>
        <section className="auth-form-panel">
          <div className="auth-form-wrap">
          <p className="eyebrow">WELCOME BACK</p>
          <h1>Sign in</h1>
          <p className="auth-description">Pick up where you left off and see what’s happening with your reports.</p>

          {error && (
            <div role="alert" className="inline-error auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="form-control"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="form-control password-control"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="password-visibility"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <button
              disabled={submitting}
              className="button button-dark auth-submit"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            New to TraceBack?{" "}
            <Link to="/register">Create an account</Link>
          </p>
          </div>
        </section>
      </div>
    </main>
  );
}
