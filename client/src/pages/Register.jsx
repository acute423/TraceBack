import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useAuth } from "../context/useAuth";
import ThemeToggle from "../components/ThemeToggle";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await register(form);
      navigate("/login", {
        replace: true,
        state: { message: "Account created successfully. Please sign in." },
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Registration failed. Please try again.");
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
            <span className="eyebrow">GOOD THINGS FIND THEIR WAY</span>
            <h2>One small report can make someone’s day.</h2>
            <p>Join your campus community to help lost belongings find their way back to the people who miss them.</p>
            <div className="auth-proof"><span><Search size={16} /></span><span><strong>Find a little more easily</strong><small>Smart suggestions bring related lost and found reports together.</small></span></div>
          </div>
          <span className="auth-story-footer">Made for the things that matter.</span>
        </aside>
        <section className="auth-form-panel">
          <div className="auth-form-wrap">
          <p className="eyebrow">JOIN YOUR CAMPUS</p>
          <h1>Create an account</h1>
          <p className="auth-description">A safer, simpler way to find the things that matter.</p>

          {error && (
            <div role="alert" className="inline-error auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div>
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="form-control"
                placeholder="Your full name"
              />
            </div>

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
              <input
                id="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="form-control"
                placeholder="At least 12 characters"
              />
            </div>

            <button
              disabled={submitting}
              className="button button-dark auth-submit"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            Already registered?{" "}
            <Link to="/login">Sign in</Link>
          </p>
          </div>
        </section>
      </div>
    </main>
  );
}

