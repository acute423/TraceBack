import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowRight, Bell, Box, CheckCircle2, HeartHandshake, MapPin,
  Search, ShieldCheck, Sparkles,
} from "lucide-react";
import api from "../api/api";
import { useAuth } from "../context/useAuth";
import ThemeToggle from "../components/ThemeToggle";
import { filterReportsByLocationAndDate } from "../utils/filterReports";

const categories = ["All categories", "Accessories", "Bags", "Clothing", "Electronics", "Keys", "Other"];

function getRows(data) {
  if (Array.isArray(data)) return data;
  return data?.items || data?.foundItems || data?.reports || data?.results || (data?.data ? getRows(data.data) : []);
}

function photoFor(item) {
  const photo = item.photos?.[0] || item.images?.[0] || item.photo || item.image;
  return typeof photo === "string" ? photo : photo?.url || photo?.secure_url || "";
}

function displayName(item) {
  return item.itemName || item.title || item.name || "Found item";
}

function activeItems(data) {
  return getRows(data).filter((item) => !["closed", "resolved", "returned", "inactive"].includes(String(item.status || "active").toLowerCase()));
}

export default function Landing({ browseOnly = false }) {
  const { user, loading: authLoading, logout } = useAuth();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const visibleItems = useMemo(
    () => filterReportsByLocationAndDate(items, { location: locationFilter, since: dateFrom }),
    [dateFrom, items, locationFilter],
  );
  const locations = useMemo(
    () => [...new Set(items.map((item) => item.location?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const search = useCallback(async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (category) params.category = category;
      const { data } = await api.get("/found/public", { params });
      setItems(activeItems(data));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "We couldn’t load found items. Please try again.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [category, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => search(), 0);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="TraceBack home">
          <span className="brand-mark"><Search size={20} strokeWidth={2.5} /></span>
          <span>TraceBack<span className="brand-period">.</span></span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href={browseOnly ? "#found-items" : "#how-it-works"}>{browseOnly ? "Found items" : "How it works"}</a>
          <Link to="/browse">Browse</Link>
          <ThemeToggle />
          {authLoading ? <span className="nav-loading" aria-label="Loading account" /> : user ? (
            <>
              <Link to="/dashboard" className="nav-dashboard">My dashboard</Link>
              <button className="nav-text-button" onClick={logout}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-login">Log in</Link>
              <Link to="/register" className="button button-dark button-small">Get started <ArrowRight size={15} /></Link>
            </>
          )}
        </nav>
      </header>

      {!browseOnly && (
        <main>
          <section className="hero-section">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={14} /> A little help goes a long way</div>
              <h1>Lost something?<br /><span>Let’s bring it back.</span></h1>
              <p className="hero-description">
                A thoughtful community-powered way to reconnect people with the things they care about.
              </p>
              <div className="hero-actions">
                <Link to={user ? "/dashboard" : "/register"} className="button button-dark">
                  Report an item <ArrowRight size={17} />
                </Link>
                <a className="button button-light" href="#found-items">Browse found items <ArrowDown size={16} /></a>
              </div>
              <div className="hero-note"><ShieldCheck size={17} /> Private by design. Only share what you choose.</div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-sun" />
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="art-card art-card-main">
                <div className="art-card-image"><Box size={42} /></div>
                <div><span className="art-kicker">JUST FOUND</span><strong>Something special</strong><small>Waiting to find its way home</small></div>
                <span className="art-check"><CheckCircle2 size={19} /></span>
              </div>
              <div className="art-card art-card-note"><HeartHandshake size={18} /><span>Good things find their way back.</span></div>
              <div className="art-spark art-spark-one">✳</div><div className="art-spark art-spark-two">✦</div>
            </div>
          </section>

          <section className="trust-strip" aria-label="TraceBack values">
            <div><ShieldCheck /><span><b>Safe by default</b><small>Your contact info stays private</small></span></div>
            <div><HeartHandshake /><span><b>Community powered</b><small>Small acts make a big difference</small></span></div>
            <div><Sparkles /><span><b>Smart matching</b><small>Helpful matches, less searching</small></span></div>
          </section>

          <section id="how-it-works" className="how-section">
            <div className="section-heading">
              <div><span className="eyebrow">HOW TRACEBACK WORKS</span><h2>Three steps. One happy reunion.</h2></div>
              <p>Whether you’ve lost something or found it, we make the next step simple.</p>
            </div>
            <div className="steps-grid">
              <article className="step-card"><span className="step-number">01</span><span className="step-icon"><Search /></span><h3>Tell us what happened</h3><p>Share a few details about a lost or found item. Keep private details to yourself.</p></article>
              <article className="step-card"><span className="step-number">02</span><span className="step-icon step-icon-peach"><Sparkles /></span><h3>Find a possible match</h3><p>We surface related reports so owners and finders can connect with confidence.</p></article>
              <article className="step-card"><span className="step-number">03</span><span className="step-icon step-icon-green"><HeartHandshake /></span><h3>Make the reunion</h3><p>Verify ownership, coordinate safely, and let a good deed find its way home.</p></article>
            </div>
          </section>
        </main>
      )}

      <section id="found-items" className={`found-section ${browseOnly ? "found-section-full" : ""}`}>
        <div className="section-heading found-heading">
          <div><span className="eyebrow">THE COMMUNITY FINDS</span><h2>Recently found items</h2></div>
          <p>Browse active reports. Have a question? Sign in to securely reach the finder.</p>
        </div>
        <form className="search-bar" onSubmit={search} role="search">
          <label className="search-input-wrap"><Search size={18} /><span className="sr-only">Search found items</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “blue backpack” or “keys”" />
          </label>
          <label className="sr-only" htmlFor="public-category">Filter by category</label>
          <select id="public-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((value) => <option key={value} value={value === "All categories" ? "" : value}>{value}</option>)}
          </select>
          <label className="sr-only" htmlFor="public-location">Filter by location</label>
          <select id="public-location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
            <option value="">All locations</option>
            {locations.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          <label className="sr-only" htmlFor="public-date-from">Found since</label>
          <input id="public-date-from" className="date-filter" type="date" aria-label="Found since" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <button type="submit" className="button button-dark search-submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
        </form>

        {error && <div className="state-card error-state" role="alert">{error} <button className="inline-button" onClick={search}>Try again</button></div>}
        {loading && !items.length && <div className="state-card" role="status"><span className="spinner" /> Finding recent reports…</div>}
        {!loading && !error && !visibleItems.length && <div className="state-card empty-state"><span className="empty-icon"><Search size={21} /></span><h3>{items.length ? "No items match these filters" : "No matching items yet"}</h3><p>{items.length ? "Try clearing the location or date filters." : "Try a different search, or check back later as new finds are added."}</p></div>}
        {!!visibleItems.length && (
          <div className="item-grid">
            {visibleItems.map((item) => {
              const image = photoFor(item);
              return (
                <article className="public-item-card" key={item._id || item.id || `${displayName(item)}-${item.location}`}>
                  <div className="public-item-photo">
                    {image ? <img src={image} alt={displayName(item)} loading="lazy" /> : <div className="photo-placeholder"><Box size={32} /></div>}
                    <span className="category-chip">{item.category || "Other"}</span>
                  </div>
                  <div className="public-item-content">
                    <div className="public-item-title"><h3>{displayName(item)}</h3><span className="status-dot">Active</span></div>
                    <p>{item.description || "A community member is helping this item find its owner."}</p>
                    <div className="item-meta">
                      {item.location && <span><MapPin size={14} />{item.location}</span>}
                      {(item.foundDate || item.createdAt) && <span>{new Date(item.foundDate || item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                    </div>
                    {user ? <Link to="/dashboard?view=browse" className="item-action">I think this is mine <ArrowRight size={15} /></Link> : <Link to="/login" className="item-action">Sign in to ask about this <ArrowRight size={15} /></Link>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!browseOnly && <div className="browse-all"><Link to="/browse">Browse all found items <ArrowRight size={16} /></Link></div>}
      </section>

      {!browseOnly && <section className="closing-cta">
        <div className="closing-icon"><Bell size={22} /></div>
        <div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Every reunion starts with a report.</h2><p>Join your community and help good things find their way back.</p></div>
        <Link to={user ? "/dashboard" : "/register"} className="button button-dark">Get started <ArrowRight size={16} /></Link>
      </section>}

      <footer className="site-footer"><Link className="brand" to="/"><span className="brand-mark"><Search size={16} /></span><span>TraceBack<span className="brand-period">.</span></span></Link><span>Made for the things that matter.</span><Link to="/browse">Browse found items</Link></footer>
    </div>
  );
}
