import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowRight, Bell, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Filter, HandHelping, Heart,
  Inbox, LayoutDashboard, LogOut, Mail, MapPin, Menu, PackageCheck, Plus,
  Search, Sparkles, Users, X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../context/useAuth";
import ThemeToggle from "../components/ThemeToggle";
import { filterReportsByLocationAndDate } from "../utils/filterReports";

const categories = ["Accessories", "Bags", "Clothing", "Electronics", "Keys", "Jewelry", "Other"];
const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "browse", label: "Browse finds", icon: Search },
  { id: "lost", label: "My lost reports", icon: Search },
  { id: "found", label: "My found items", icon: HandHelping },
  { id: "claims", label: "Claims", icon: Inbox },
  { id: "resolved", label: "Resolved", icon: CheckCircle2 },
  { id: "notifications", label: "Notifications", icon: Bell },
];
const adminTabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "claims", label: "Claims", icon: Inbox },
  { id: "users", label: "Users", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function rows(data) {
  if (Array.isArray(data)) return data;
  return data?.items || data?.lostItems || data?.foundItems || data?.reports || data?.claims || data?.users || data?.notifications || data?.results || (data?.data ? rows(data.data) : []);
}

function labelFor(item) {
  return item.itemName || item.title || item.name || "Untitled item";
}

function statusOf(item) {
  return String(item.status || "active").toLowerCase();
}

function prettyStatus(status) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Date not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function imageFor(item) {
  const photo = item.photos?.[0] || item.images?.[0] || item.photo || item.image;
  return typeof photo === "string" ? photo : photo?.url || photo?.secure_url || "";
}

function requestError(error, fallback) {
  const response = error.response?.data;
  if (Array.isArray(response?.errors) && response.errors.length) {
    const fieldNames = {
      title: "item name",
      date: "report date",
      hiddenDetails: "private verification details",
      verificationQuestion: "verification question",
    };
    const details = response.errors.map(({ field, message }) => {
      const label = fieldNames[field] || field;
      return label ? `${label}: ${message}` : message;
    });
    return `${response.message || "Please check the report details"} — ${details.join("; ")}`;
  }
  return response?.message || error.message || fallback;
}

function getId(item) {
  return item._id || item.id || item.claimId;
}

function useDialogEscape(onClose) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

function StatusBadge({ status }) {
  const normalized = statusOf({ status });
  return <span className={`status-badge status-${normalized.replaceAll(" ", "-")}`}><span />{prettyStatus(normalized)}</span>;
}

function ItemCard({ item, kind, onMatches, onClose, onClaim, onContact, onReturned, onDetails, onEdit, busy }) {
  const image = imageFor(item);
  return (
    <article className="report-card">
      <div className="report-photo">
        {image ? <img src={image} alt={labelFor(item)} loading="lazy" /> : <div className="report-photo-empty"><PackageCheck size={26} /></div>}
        <span className="category-chip">{item.category || "Other"}</span>
      </div>
      <div className="report-card-body">
        <div className="report-title-line"><h3>{labelFor(item)}</h3><StatusBadge status={item.status} /></div>
        <p className="report-description">{item.description || "No description provided."}</p>
        <div className="report-meta">
          {item.location && <span><MapPin size={14} />{item.location}</span>}
          <span><Clock3 size={14} />{formatDate(item.lostDate || item.foundDate || item.createdAt)}</span>
        </div>
        {kind === "lost" && (
          <div className="report-actions">
            <button className="button button-outline button-compact" onClick={() => onMatches(item)} disabled={busy}><Sparkles size={14} /> Find matches</button>
            <button className="button button-light button-compact" onClick={() => onEdit(item)} disabled={busy}>Edit</button>
            {!["closed", "resolved", "returned"].includes(statusOf(item)) && <button className="button button-quiet button-compact" onClick={() => onClose(item)} disabled={busy}>Close report</button>}
          </div>
        )}
        {kind === "found-public" && <button className="item-action" onClick={() => onClaim(item)}>This might be mine <ArrowRight size={15} /></button>}
        {kind === "finder" && (
          <div className="report-actions">
            <button className="button button-outline button-compact" onClick={() => onDetails(item)}><CircleHelp size={14} /> Review claims</button>
            <button className="button button-light button-compact" onClick={() => onEdit(item)} disabled={busy}>Edit</button>
            {statusOf(item) === "pending_claim" && <button className="button button-quiet button-compact" onClick={() => onReturned(item)} disabled={busy}>Returned to owner</button>}
          </div>
        )}
        {kind === "claim" && onContact && <button className="item-action" onClick={() => onContact(item)}>Contact securely <ArrowRight size={15} /></button>}
      </div>
    </article>
  );
}

function ReportModal({ kind, item, onClose, onCreated }) {
  useDialogEscape(onClose);
  const [form, setForm] = useState(() => ({
    itemName: item?.itemName || item?.title || item?.name || "",
    description: item?.description || "",
    category: item?.category || "",
    location: item?.location || "",
    date: String(item?.lostDate || item?.foundDate || item?.date || new Date().toISOString()).slice(0, 10),
    verificationQuestion: item?.verificationQuestion || "",
    hiddenDetails: item?.hiddenDetails || "",
  }));
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const photoPreviewUrls = useRef([]);
  const [photoError, setPhotoError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isLost = kind === "lost";
  const isEditing = Boolean(item);

  useEffect(() => () => {
    photoPreviewUrls.current.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  const updatePhotos = (files) => {
    photoPreviewUrls.current.forEach((preview) => URL.revokeObjectURL(preview));
    photoPreviewUrls.current = files.map((photo) => URL.createObjectURL(photo));
    setPhotos(files);
    setPhotoPreviews(photoPreviewUrls.current);
  };

  const addPhotos = (selectedFiles) => {
    setPhotoError("");
    const maximum = isLost ? 3 : 1;
    const files = Array.from(selectedFiles);
    const invalidFile = files.find((file) => !["image/jpeg", "image/png"].includes(file.type));
    if (invalidFile) {
      setPhotoError("Choose JPG or PNG image files only.");
      return;
    }
    const oversizedFile = files.find((file) => file.size > 5 * 1024 * 1024);
    if (oversizedFile) {
      setPhotoError("Each image must be 5 MB or smaller.");
      return;
    }
    if (photos.length + files.length > maximum) {
      setPhotoError(`You can add up to ${maximum} photo${maximum === 1 ? "" : "s"}. Remove or replace a selected photo first.`);
      return;
    }
    updatePhotos([...photos, ...files]);
  };

  const removePhoto = (index) => {
    setPhotoError("");
    updatePhotos(photos.filter((_, photoIndex) => photoIndex !== index));
  };

  const replacePhoto = (index, file) => {
    setPhotoError("");
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoError("Choose a JPG or PNG image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Each image must be 5 MB or smaller.");
      return;
    }
    updatePhotos(photos.map((photo, photoIndex) => photoIndex === index ? file : photo));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("itemName", form.itemName.trim());
      body.append("description", form.description.trim());
      body.append("category", form.category);
      body.append("location", form.location.trim());
      body.append(isLost ? "lostDate" : "foundDate", form.date);
      if (isLost && form.verificationQuestion.trim()) body.append("verificationQuestion", form.verificationQuestion.trim());
      if (!isLost) body.append("hiddenDetails", form.hiddenDetails.trim());
      photos.slice(0, isLost ? 3 : 1).forEach((photo) => body.append("photos", photo));
      if (isEditing) await api.patch(`${isLost ? "/lost" : "/found"}/${getId(item)}`, body);
      else await api.post(isLost ? "/lost" : "/found", body);
      await onCreated();
    } catch (error) {
      setError(requestError(error, "We couldn’t create this report."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <div className="modal-header"><div><span className="eyebrow">{isLost ? "LOST ITEM REPORT" : "FOUND ITEM REPORT"}</span><h2 id="report-modal-title">{isEditing ? "Update your report" : isLost ? "Tell us what you lost" : "Share what you found"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        <p className="modal-intro">A few useful details help the community recognize the item. Please leave out private identifying details.</p>
        {error && <div role="alert" className="inline-error">{error}</div>}
        <form className="modal-form" onSubmit={submit}>
          <label>Item name<input required maxLength={100} value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} placeholder="e.g. Navy blue backpack" /></label>
          <div className="form-two-col">
            <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">Choose a category</option>{categories.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>{isLost ? "Date lost" : "Date found"}<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          </div>
          <label>Where {isLost ? "did you lose it?" : "did you find it?"}<input required maxLength={160} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Building, room, or general area" /></label>
          <label>Description<textarea required rows={4} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Color, brand, or other visible details" /></label>
          {isLost && <label>Verification question <span className="label-hint">The finder will ask this privately to verify a claim.</span><input maxLength={180} value={form.verificationQuestion} onChange={(event) => setForm({ ...form, verificationQuestion: event.target.value })} placeholder="e.g. What is engraved on the inside?" /></label>}
          {!isLost && <label>Private verification details <span className="label-hint">Only you and administrators can see these. Enter 1–2 details.</span><textarea required rows={3} maxLength={2000} value={form.hiddenDetails} onChange={(event) => setForm({ ...form, hiddenDetails: event.target.value })} placeholder="e.g. A small scratch near the cap; initials inside the lid" /></label>}
          <div className="upload-field">
            <label className="upload-label" htmlFor="report-photos"><Plus size={16} /> Add photos <span className="label-hint">Optional · up to {isLost ? 3 : 1} photo{isLost ? "s" : ""} · JPG/PNG, 5 MB max each</span></label>
            <input
              id="report-photos"
              type="file"
              accept="image/jpeg,image/png"
              multiple={isLost}
              onChange={(event) => {
                addPhotos(event.target.files || []);
                event.target.value = "";
              }}
            />
            <span className="file-selection">
              {photos.length
                ? `${photos.length} of ${isLost ? 3 : 1} photo${isLost ? "s" : ""} selected`
                : "Choose JPG or PNG image files"}
            </span>
            {photoError && <span className="inline-error upload-error" role="alert">{photoError}</span>}
            {!!photoPreviews.length && (
              <div className="upload-previews">
                {photoPreviews.map((preview, index) => (
                  <article className="upload-preview" key={preview}>
                    <img src={preview} alt={`Selected item photo ${index + 1}: ${photos[index]?.name || "preview"}`} />
                    <span className="upload-preview-name" title={photos[index]?.name}>{photos[index]?.name}</span>
                    <div className="upload-preview-actions">
                      <label className="upload-control-button">
                        Replace
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          aria-label={`Replace photo ${index + 1}`}
                          onChange={(event) => {
                            const [file] = event.target.files || [];
                            if (file) replacePhoto(index, file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        className="upload-control-button upload-remove-button"
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer"><button type="button" className="button button-light" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark" disabled={submitting}>{submitting ? "Saving…" : isEditing ? "Save changes" : "Submit report"} <ArrowRight size={16} /></button></div>
        </form>
      </section>
    </div>
  );
}

function ClaimModal({ item, lostItems, onClose, onSubmitted }) {
  useDialogEscape(onClose);
  const [lostId, setLostId] = useState(lostItems[0] ? getId(lostItems[0]) : "");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/claims", {
        lostId,
        foundId: item.foundId || item._id || item.id,
        answers: { verificationAnswer: answer.trim() },
      });
      await onSubmitted();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "We couldn’t send your claim. Please check the item details and try again.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card modal-narrow" role="dialog" aria-modal="true" aria-labelledby="claim-modal-title">
        <div className="modal-header"><div><span className="eyebrow">VERIFY YOUR CLAIM</span><h2 id="claim-modal-title">Is this your {labelFor(item)}?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        <p className="modal-intro">Answer the owner’s verification question. Your answer is shared only with people reviewing this claim.</p>
        <form className="modal-form" onSubmit={submit}>
          {lostItems.length === 0 ? <div className="inline-error">Create a lost-item report before claiming a found item.</div> : <>
            <label>Your lost report<select required value={lostId} onChange={(event) => setLostId(event.target.value)}>{lostItems.map((lost) => <option value={getId(lost)} key={getId(lost)}>{labelFor(lost)}</option>)}</select></label>
            <label>{lostItems.find((lost) => getId(lost) === lostId)?.verificationQuestion || "Share one detail that helps verify this item belongs to you."}<textarea rows={4} required maxLength={1000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Your answer" /></label>
          </>}
          {error && <div role="alert" className="inline-error">{error}</div>}
          <div className="modal-footer"><button type="button" className="button button-light" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark" disabled={submitting || lostItems.length === 0}>{submitting ? "Sending…" : "Submit claim"} <ArrowRight size={16} /></button></div>
        </form>
      </section>
    </div>
  );
}

function MatchModal({ item, onClose, onClaim }) {
  useDialogEscape(onClose);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);
  useEffect(() => {
    let active = true;
    api.get(`/lost/${getId(item)}/matches`)
      .then(({ data }) => { if (active) setMatches(rows(data.matches || data)); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Matches aren’t available right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="matches-title">
        <div className="modal-header"><div><span className="eyebrow">POSSIBLE CONNECTIONS</span><h2 id="matches-title">Matches for {labelFor(item)}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        {loading && <div className="state-card" role="status"><span className="spinner" /> Looking for similar found reports…</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {!loading && !error && matches.length === 0 && <div className="state-card empty-state"><h3>No matches just yet</h3><p>We’ll keep your report active. Check back as new found items are posted.</p></div>}
        <div className="match-list">{matches.map((match) => {
          const found = match.foundItem || match.found || match;
          const breakdown = match.breakdown || match.matchBreakdown || {};
          const score = Number(match.score ?? match.matchScore ?? match.confidence);
          const percentage = score <= 1 ? score * 100 : score;
          const confidence = percentage >= 75 ? "High" : percentage >= 50 ? "Medium" : "Low";
          return <article className="match-row" key={getId(found) || getId(match)}><div className="match-score">{Number.isFinite(score) ? `${Math.round(percentage)}%` : <Sparkles size={18} />}</div><div className="match-info"><h3>{labelFor(found)} <span className={`match-level match-level-${confidence.toLowerCase()}`}>{confidence} match</span></h3><p>{found.description || "A found item may match your report."}</p><div className="match-breakdown">{Object.entries(breakdown).filter(([, value]) => typeof value === "number" || typeof value === "string").map(([key, value]) => <span key={key}>{prettyStatus(key)}: {typeof value === "number" && value <= 1 ? `${Math.round(value * 100)}%` : value}</span>)}</div><button className="item-action" onClick={() => onClaim({ ...found, foundId: getId(found) || match.foundId })}>Claim this possible match <ArrowRight size={14} /></button></div><StatusBadge status={found.status || "active"} /></article>;
        })}</div>
        <div className="modal-footer"><button className="button button-light" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

function ContactModal({ claim, onClose }) {
  useDialogEscape(onClose);
  const id = getId(claim);
  const [contact, setContact] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api.get(`/claims/${id}/contact`)
      .then(({ data }) => { if (active) setContact(data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Contact details are available only after the claim passes its privacy checks."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.post(`/claims/${id}/messages`, { message: message.trim() });
      setNotice("Your message was sent securely.");
      setMessage("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Secure messaging isn’t enabled for this claim. You can continue by email.");
    } finally {
      setSending(false);
    }
  };
  const relayEnabled = contact?.relayEnabled === true;
  const email = relayEnabled ? null : contact?.contact?.email || contact?.claimantEmail || contact?.email;
  const itemName = contact?.itemName || labelFor(claim);
  const claimRef = contact?.claimId || id;
  const isFinder = claim._view === "finder";
  const subject = isFinder ? `About your found item: ${itemName}` : `Claiming your found item: ${itemName}`;
  const body = isFinder
    ? `Hello,\n\nI am contacting you about the found item “${itemName}”.\n\nClaim reference: ${claimRef}\n\nThank you.`
    : `Hello,\n\nI believe I may be the owner of the found item “${itemName}”.\n\nClaim reference: ${claimRef}\n\nThank you.`;
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "";
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card modal-narrow" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <div className="modal-header"><div><span className="eyebrow">PRIVATE CONTACT</span><h2 id="contact-title">Coordinate a reunion</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        {loading && <div className="state-card" role="status"><span className="spinner" /> Checking contact eligibility…</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {contact && <>
          <p className="modal-intro">Contact access was approved for <strong>{contact.itemName || labelFor(claim)}</strong>. Your information is shared only with the people in this claim.</p>
          {email && <a className="contact-email" href={mailto}><Mail size={17} />{email}<ArrowRight size={15} /></a>}
          {relayEnabled ? <form className="modal-form" onSubmit={send}>
            <label>Message through TraceBack <span className="label-hint">Available when secure relay is enabled.</span><textarea rows={3} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a short message…" /></label>
            {notice && <div className="success-message" role="status">{notice}</div>}
            <button type="submit" className="button button-dark" disabled={sending}>{sending ? "Sending…" : "Send securely"} <ArrowRight size={15} /></button>
          </form> : <p className="modal-intro">The secure relay is off. You can contact the recipient directly using the protected address below.</p>}
        </>}
        <div className="modal-footer"><button className="button button-light" onClick={onClose}>Close</button>{email && <a className="button button-dark" href={mailto}><Mail size={16} /> Email contact</a>}</div>
      </section>
    </div>
  );
}

function ClaimDetailModal({ claim, onClose, onDecision, busy, admin = false }) {
  useDialogEscape(onClose);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const decide = async (decision) => {
    setDeciding(true);
    setError("");
    try { await onDecision(claim, decision, note); }
    catch (requestError) { setError(requestError.response?.data?.message || "The decision could not be saved."); }
    finally { setDeciding(false); }
  };
  const itemName = claim.itemName || claim.lostItem?.itemName || claim.lost?.itemName || "Item claim";
  const answer = claim.answers?.verificationAnswer || claim.answer || claim.verificationAnswer;
  const lost = claim.lostReport || claim.lostItem || claim.lost;
  const found = claim.foundReport || claim.foundItem || claim.item;
  const breakdown = claim.breakdown || {};
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card modal-narrow" role="dialog" aria-modal="true" aria-labelledby="claim-detail-title">
        <div className="modal-header"><div><span className="eyebrow">CLAIM REVIEW</span><h2 id="claim-detail-title">{itemName}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        <div className="detail-list">
          <div><span>Claim status</span><StatusBadge status={claim.status} /></div>
          {claim.createdAt && <div><span>Submitted</span><strong>{formatDate(claim.createdAt)}</strong></div>}
          {claim.claimant?.name && <div><span>Claimant</span><strong>{claim.claimant.name}</strong></div>}
          {claim.finder?.name && <div><span>Finder</span><strong>{claim.finder.name}</strong></div>}
          {claim.matchScore !== undefined && <div><span>Overall match</span><strong>{Math.round((claim.matchScore <= 1 ? claim.matchScore : claim.matchScore / 100) * 100)}%</strong></div>}
          {claim.verificationScore !== undefined && <div><span>Verification score</span><strong>{Math.round(claim.verificationScore * 100)}%</strong></div>}
        </div>
        <div className="claim-comparison">
          {[["Lost report", lost], ["Found report", found]].map(([label, report]) => report && (
            <article className="claim-side" key={label}>
              <span>{label}</span>
              <strong>{labelFor(report)}</strong>
              <p>{report.description || "No description provided."}</p>
              <small>{report.location || "Location not provided"} · {formatDate(report.lostDate || report.foundDate || report.date)}</small>
              {admin && label === "Found report" && report.hiddenDetails && <div className="private-detail"><b>Hidden verification details</b><p>{report.hiddenDetails}</p></div>}
            </article>
          ))}
        </div>
        {answer && <div className="answer-panel"><span>Verification response</span><p>{typeof answer === "string" ? answer : JSON.stringify(answer)}</p></div>}
        {!answer && <p className="modal-intro">Verification details are not available for this claim.</p>}
        {Object.keys(breakdown).length > 0 && <div className="match-breakdown claim-breakdown">{Object.entries(breakdown).map(([key, value]) => <span key={key}>{prettyStatus(key)}: {typeof value === "number" ? `${Math.round(value * 100)}%` : value}</span>)}</div>}
        {admin && claim.contactLogs?.length > 0 && <div className="contact-log-list"><strong>Contact access history</strong>{claim.contactLogs.map((entry) => <p key={getId(entry)}>{entry.requester?.name || "A participant"} {entry.action === "message" ? "sent a relay message to" : "viewed contact details for"} {entry.recipient?.name || "a participant"} · {formatDate(entry.createdAt)}</p>)}</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {admin && !["accepted", "rejected"].includes(statusOf(claim)) && <div className="decision-area">
          <label>Admin note <span className="label-hint">Optional</span><textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for this decision" /></label>
          {!claim.finderDecision && <p className="modal-intro">The finder must review this claim before an administrator can decide it.</p>}
          <div className="modal-footer"><button className="button button-danger" onClick={() => decide("rejected")} disabled={deciding || busy || !claim.finderDecision}>Reject</button><button className="button button-dark" onClick={() => decide("approved")} disabled={deciding || busy || !claim.finderDecision}>Approve claim <Check size={16} /></button></div>
        </div>}
      </section>
    </div>
  );
}

export default function Dashboard({ adminView = false }) {
  const { user, logout } = useAuth();
  const isAdmin = adminView || user?.role === "admin";
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("view");
  const [tab, setTab] = useState(() => [...tabs, ...adminTabs].some(({ id }) => id === requestedTab) ? requestedTab : "overview");
  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [publicFound, setPublicFound] = useState([]);
  const [publicQuery, setPublicQuery] = useState("");
  const [publicCategory, setPublicCategory] = useState("");
  const [publicLocation, setPublicLocation] = useState("");
  const [publicDateFrom, setPublicDateFrom] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [claims, setClaims] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [adminClaims, setAdminClaims] = useState([]);
  const [claimFilter, setClaimFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const visibleTabs = isAdmin ? adminTabs : tabs;

  const refresh = useCallback(async () => {
    setLoading(true);
    const tasks = isAdmin
      ? [
        ["stats", "/admin/stats", setStats],
        ["claims", `/admin/claims${claimFilter ? `?status=${encodeURIComponent(claimFilter)}` : ""}`, (data) => setAdminClaims(rows(data))],
        ["users", "/admin/users", (data) => setUsers(rows(data))],
        ["notifications", "/notifications", (data) => setNotifications(rows(data))],
      ]
      : [
        ["lost", "/lost", (data) => setLostItems(rows(data))],
        ["found", "/found", (data) => setFoundItems(rows(data))],
        ["claims", "/claims/mine", (data) => setClaims(rows(data))],
        ["finder", "/claims/finder", (data) => setClaims((existing) => [...existing.filter((claim) => claim._view !== "finder"), ...rows(data).map((claim) => ({ ...claim, _view: "finder" }))])],
        ["notifications", "/notifications", (data) => setNotifications(rows(data))],
      ];
    const errorsByArea = {};
    await Promise.all(tasks.map(async ([area, url, apply]) => {
      try {
        const { data } = await api.get(url);
        if (area === "stats") setStats(data.stats || data);
        else apply(data);
      } catch (error) {
        errorsByArea[area] = requestError(error, "Unable to load this section.");
      }
    }));
    setErrors(errorsByArea);
    setLoading(false);
  }, [claimFilter, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const searchPublic = useCallback(async (event) => {
    event?.preventDefault();
    setPublicLoading(true);
    setPublicError("");
    try {
      const params = {};
      if (publicQuery.trim()) params.q = publicQuery.trim();
      if (publicCategory) params.category = publicCategory;
      const { data } = await api.get("/found/public", { params });
      setPublicFound(rows(data).filter((item) => !["closed", "resolved", "returned", "inactive"].includes(statusOf(item))));
    } catch (error) {
      setPublicError(requestError(error, "Found items are unavailable right now."));
      setPublicFound([]);
    } finally { setPublicLoading(false); }
  }, [publicCategory, publicQuery]);

  useEffect(() => {
    if (tab !== "browse") return undefined;
    const timer = window.setTimeout(() => searchPublic(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, searchPublic]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const ownerClaims = useMemo(() => claims.filter((claim) => claim._view !== "finder"), [claims]);
  const finderClaims = useMemo(() => claims.filter((claim) => claim._view === "finder"), [claims]);
  const unreadCount = notifications.filter((notification) => !notification.readAt && !notification.isRead && notification.status !== "read").length;
  const activeLost = lostItems.filter((item) => !["closed", "returned", "resolved"].includes(statusOf(item)));
  const activeFound = foundItems.filter((item) => !["closed", "returned", "resolved"].includes(statusOf(item)));
  const openClaims = isAdmin ? adminClaims : [...ownerClaims, ...finderClaims].filter((claim) => !["approved", "rejected", "resolved"].includes(statusOf(claim)));
  const resolvedItems = [...lostItems, ...foundItems].filter((item) => ["closed", "returned", "resolved"].includes(statusOf(item)));
  const visiblePublicFound = useMemo(
    () => filterReportsByLocationAndDate(publicFound, { location: publicLocation, since: publicDateFrom }),
    [publicDateFrom, publicFound, publicLocation],
  );
  const publicLocations = useMemo(
    () => [...new Set(publicFound.map((item) => item.location?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [publicFound],
  );

  const changed = async (message) => {
    await refresh();
    setModal(null);
    setToast(message);
  };

  const closeLost = async (item) => {
    const confirmed = window.confirm(`Close the report for “${labelFor(item)}”?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.post(`/lost/${getId(item)}/close`);
      await changed("Your lost report was closed.");
    } catch (error) { setToast(requestError(error, "Could not close the report.")); }
    finally { setBusy(false); }
  };

  const editReport = async (item, kind) => {
    setBusy(true);
    try {
      const { data } = await api.get(`/${kind}/${getId(item)}`);
      setModal({ type: "report", kind, item: data.item || data.report || data });
    } catch (error) {
      setToast(requestError(error, "Could not load this report for editing."));
    } finally { setBusy(false); }
  };

  const markReturned = async (item) => {
    setBusy(true);
    try {
      await api.patch(`/found/${getId(item)}`, { status: "returned" });
      await changed("Marked as returned. Thanks for helping reunite it with its owner.");
    } catch (error) { setToast(requestError(error, "Could not update this report.")); }
    finally { setBusy(false); }
  };

  const finderDecision = async (claim, decision) => {
    setBusy(true);
    try {
      await api.post(`/claims/${getId(claim)}/finder-decision`, { decision });
      await refresh();
      setToast(decision === "looks_right" ? "Marked as looking right. The claim is awaiting administrator approval." : "Claim declined and the reports are active again.");
    } catch (error) { setToast(requestError(error, "Could not save your decision.")); }
    finally { setBusy(false); }
  };

  const adminDecision = async (claim, decision, adminNote) => {
    setBusy(true);
    try {
      await api.post(`/claims/${getId(claim)}/admin-decision`, { decision, adminNote });
      await refresh();
      setModal(null);
      setToast(`Claim ${decision}.`);
    } catch (error) {
      setBusy(false);
      throw error;
    } finally { setBusy(false); }
  };

  const markRead = async (notification) => {
    const id = getId(notification);
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((current) => current.map((entry) => getId(entry) === id ? { ...entry, readAt: new Date().toISOString(), isRead: true } : entry));
    } catch (error) { setToast(requestError(error, "Could not mark notification as read.")); }
  };

  const deactivate = async (person) => {
    const id = getId(person);
    if (!window.confirm(`Deactivate ${person.name || person.email || "this account"}?`)) return;
    setBusy(true);
    try {
      await api.patch(`/admin/users/${id}/deactivate`);
      setUsers((current) => current.map((entry) => getId(entry) === id ? { ...entry, isActive: false, status: "inactive" } : entry));
      setToast("Account deactivated.");
    } catch (error) { setToast(requestError(error, "Could not deactivate this account.")); }
    finally { setBusy(false); }
  };

  const showClaim = (claim) => setModal({ type: "claim-detail", claim });
  const currentLabel = visibleTabs.find((item) => item.id === tab)?.label || "Overview";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <Link className="brand sidebar-brand" to="/"><span className="brand-mark"><Search size={19} strokeWidth={2.5} /></span><span>TraceBack<span className="brand-period">.</span></span></Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {visibleTabs.map(({ id, label, icon: Icon }) => <button key={id} className={`sidebar-link ${tab === id ? "sidebar-link-active" : ""}`} onClick={() => { setTab(id); setMobileMenu(false); }}><Icon size={18} /><span>{label}</span>{id === "notifications" && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}</button>)}
        </nav>
        {!isAdmin && <div className="sidebar-help"><span className="help-mark"><Heart size={16} /></span><strong>A good deed comes around.</strong><p>Every report makes it easier for someone to find what matters.</p><Link to="/browse">Browse found items <ArrowRight size={14} /></Link></div>}
        <div className="sidebar-bottom">
          <div className="profile-card"><span className="avatar">{(user?.name || "U").slice(0, 1).toUpperCase()}</span><div><strong>{user?.name || "TraceBack member"}</strong><small>{isAdmin ? "Administrator" : user?.email || "Member account"}</small></div><button className="profile-menu" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button></div>
        </div>
      </aside>
      {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu /></button>
          <div className="breadcrumbs"><Link to="/">TraceBack</Link><span>/</span><strong>{currentLabel}</strong></div>
          <div className="topbar-actions"><Link to="/browse" className="topbar-browse"><Search size={16} /> Browse finds</Link><button className="notification-top-button" onClick={() => setTab("notifications")} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}><Bell size={18} />{unreadCount > 0 && <span />}</button><ThemeToggle /><span className="topbar-avatar" aria-label={`${user?.name || "Member"} profile`}>{(user?.name || "U").slice(0, 1).toUpperCase()}</span></div>
        </header>

        <div className="dashboard-content">
          {tab === "overview" && <>
            <section className="dashboard-welcome"><div><span className="eyebrow">{isAdmin ? "TRACEBACK ADMINISTRATION" : "YOUR TRACEBACK SPACE"}</span><h1>{isAdmin ? "Good to see you, admin." : `Welcome back, ${(user?.name || "friend").split(" ")[0]}.`}</h1><p>{isAdmin ? "Keep the community safe and every reunion moving forward." : "Here’s what’s happening with your reports and claims."}</p></div>{!isAdmin && <button className="button button-dark" onClick={() => setModal({ type: "report", kind: "lost" })}><Plus size={17} /> New report</button>}</section>
            {isAdmin ? <AdminOverview stats={stats} claims={adminClaims} onViewClaims={() => setTab("claims")} /> : <>
              {loading && !lostItems.length && !foundItems.length && <div className="state-card" role="status"><span className="spinner" /> Loading your dashboard…</div>}
              {!!Object.keys(errors).length && <div className="error-banner" role="alert">{Object.values(errors)[0]} <button className="inline-button" onClick={refresh}>Retry</button></div>}
              <div className="stat-grid">
                <StatCard label="Active lost reports" value={activeLost.length} icon={Search} tone="peach" foot={`${lostItems.length} total reports`} />
                <StatCard label="Found items posted" value={activeFound.length} icon={HandHelping} tone="mint" foot="Thanks for helping out" />
                <StatCard label="Open claims" value={openClaims.length} icon={Inbox} tone="lavender" foot="Across your activity" />
                <StatCard label="Notifications" value={unreadCount} icon={Bell} tone="yellow" foot={unreadCount ? "Needs a quick look" : "You’re all caught up"} />
              </div>
              <section className="dashboard-panel overview-panel">
                <div className="panel-heading"><div><h2>Your active reports</h2><p>Keep an eye on things you’ve lost or found.</p></div><button className="text-link" onClick={() => setTab("lost")}>All reports <ArrowRight size={15} /></button></div>
                {activeLost.length + activeFound.length ? <div className="compact-report-list">{[...activeLost.slice(0, 2).map((item) => ({ ...item, _kind: "Lost" })), ...activeFound.slice(0, 2).map((item) => ({ ...item, _kind: "Found" }))].map((item) => <div className="compact-report-row" key={`${item._kind}-${getId(item)}`}><span className={`compact-type compact-${item._kind.toLowerCase()}`}>{item._kind}</span><div><strong>{labelFor(item)}</strong><small>{item.location || "Location not provided"} · {formatDate(item.createdAt)}</small></div><StatusBadge status={item.status} /></div>)}</div> : <EmptyState icon={PackageCheck} title="Your space starts here" text="Create a lost report or post something you’ve found to get started." action="Create a report" onAction={() => setModal({ type: "report", kind: "lost" })} />}
              </section>
              <section className="dashboard-panel quick-actions"><div className="panel-heading"><div><h2>Make a difference today</h2><p>Choose the next helpful step.</p></div></div><div className="quick-action-grid"><button onClick={() => setModal({ type: "report", kind: "lost" })}><span className="quick-action-icon peach-bg"><Search /></span><span><strong>Report something lost</strong><small>Tell the community what you’re looking for</small></span><ArrowRight size={17} /></button><button onClick={() => setModal({ type: "report", kind: "found" })}><span className="quick-action-icon mint-bg"><HandHelping /></span><span><strong>Post a found item</strong><small>Help its owner find their way to you</small></span><ArrowRight size={17} /></button><Link to="/browse"><span className="quick-action-icon lavender-bg"><Sparkles /></span><span><strong>Browse found items</strong><small>See if someone has found your item</small></span><ArrowRight size={17} /></Link></div></section>
            </>}
          </>}

          {!isAdmin && tab === "lost" && <ListPage eyebrow="YOUR LOST REPORTS" title="Things you’re looking for" description="Review possible matches or close reports once your item is back." loading={loading} error={errors.lost} onRetry={refresh} items={activeLost} emptyTitle="No active lost reports" emptyText="Your resolved reports live in the history tab. Create a new report if you need help finding something." emptyAction="Create lost report" onEmpty={() => setModal({ type: "report", kind: "lost" })} renderItem={(item) => <ItemCard key={getId(item)} item={item} kind="lost" onMatches={(value) => setModal({ type: "matches", item: value })} onClose={closeLost} onEdit={(value) => editReport(value, "lost")} busy={busy} />} />}
          {!isAdmin && tab === "browse" && <section className="page-section"><div className="page-heading"><div><span className="eyebrow">COMMUNITY FINDS</span><h1>Browse found items</h1><p>Search recent finds and submit a private claim if something looks familiar.</p></div></div><form className="dashboard-search-form" role="search" onSubmit={searchPublic}><label className="search-input-wrap"><Search size={18} /><span className="sr-only">Search found items</span><input value={publicQuery} onChange={(event) => setPublicQuery(event.target.value)} placeholder="Search by item, color, or place" /></label><label className="sr-only" htmlFor="dashboard-category">Filter by category</label><select id="dashboard-category" value={publicCategory} onChange={(event) => setPublicCategory(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><label className="sr-only" htmlFor="dashboard-location">Filter by location</label><select id="dashboard-location" value={publicLocation} onChange={(event) => setPublicLocation(event.target.value)}><option value="">All locations</option>{publicLocations.map((location) => <option key={location} value={location}>{location}</option>)}</select><label className="sr-only" htmlFor="dashboard-date-from">Found since</label><input id="dashboard-date-from" className="date-filter" type="date" aria-label="Found since" value={publicDateFrom} onChange={(event) => setPublicDateFrom(event.target.value)} /><button className="button button-dark" type="submit" disabled={publicLoading}>{publicLoading ? "Searching…" : "Search"}</button></form>{publicError && <div className="error-banner" role="alert">{publicError} <button className="inline-button" onClick={searchPublic}>Retry</button></div>}{publicLoading && !publicFound.length && <div className="state-card" role="status"><span className="spinner" /> Searching recent finds…</div>}{!publicLoading && !publicError && !visiblePublicFound.length && <EmptyState icon={Search} title={publicFound.length ? "No items match these filters" : "No found items match that search"} text={publicFound.length ? "Try clearing the location or date filters." : "Try a different search or check back as new reports come in."} />}{!!visiblePublicFound.length && <div className="report-grid">{visiblePublicFound.map((item) => <ItemCard key={getId(item)} item={item} kind="found-public" onClaim={(value) => setModal({ type: "claim", item: value })} />)}</div>}</section>}
          {!isAdmin && tab === "found" && <ListPage eyebrow="YOUR FOUND ITEMS" title="Things you’ve found" description="Thanks for looking out for someone in your community." loading={loading} error={errors.found} onRetry={refresh} items={activeFound} emptyTitle="No active found reports" emptyText="Your resolved reports live in the history tab. Post another find to help someone else." emptyAction="Post a found item" onEmpty={() => setModal({ type: "report", kind: "found" })} renderItem={(item) => <ItemCard key={getId(item)} item={item} kind="finder" onReturned={markReturned} onEdit={(value) => editReport(value, "found")} onDetails={() => setTab("claims")} busy={busy} />} />}

          {!isAdmin && tab === "claims" && <ClaimsPage ownerClaims={ownerClaims} finderClaims={finderClaims} onDecision={finderDecision} onDetails={showClaim} onContact={(claim) => setModal({ type: "contact", claim })} busy={busy} error={errors.claims || errors.finder} loading={loading} onRetry={refresh} />}

          {!isAdmin && tab === "resolved" && <ListPage eyebrow="CLOSED THE LOOP" title="Resolved history" description="A little history of reports that made it all the way home." loading={loading} error={errors.lost || errors.found} onRetry={refresh} items={resolvedItems} emptyTitle="No resolved reports yet" emptyText="When an item is returned or a report is closed, you’ll find it here." renderItem={(item) => <ItemCard key={getId(item)} item={item} kind="history" />} />}

          {tab === "notifications" && <NotificationsPage notifications={notifications} loading={loading} error={errors.notifications} onRetry={refresh} onRead={markRead} />}

          {isAdmin && tab === "claims" && <AdminClaimsPage claims={adminClaims} filter={claimFilter} setFilter={setClaimFilter} loading={loading} error={errors.claims} onRetry={refresh} onDetails={showClaim} />}
          {isAdmin && tab === "users" && <UsersPage users={users} loading={loading} error={errors.users} onRetry={refresh} onDeactivate={deactivate} busy={busy} />}
        </div>
      </main>

      {toast && <div className="toast-message" role="status"><CheckCircle2 size={17} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss message"><X size={15} /></button></div>}
      {modal?.type === "report" && <ReportModal kind={modal.kind} item={modal.item} onClose={() => setModal(null)} onCreated={() => changed(modal.item ? "Your report was updated." : "Your report is live. Thanks for being part of the community.")} />}
      {modal?.type === "claim" && <ClaimModal item={modal.item} lostItems={activeLost} onClose={() => setModal(null)} onSubmitted={() => changed("Your claim was submitted for review.")} />}
      {modal?.type === "matches" && <MatchModal item={modal.item} onClose={() => setModal(null)} onClaim={(found) => setModal({ type: "claim", item: found })} />}
      {modal?.type === "contact" && <ContactModal claim={modal.claim} onClose={() => setModal(null)} />}
      {modal?.type === "claim-detail" && <ClaimDetailModal claim={modal.claim} onClose={() => setModal(null)} onDecision={adminDecision} busy={busy} admin={isAdmin} />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, foot }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}-bg`}><Icon size={19} /></span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span></article>;
}

function EmptyState({ icon: Icon, title, text, action, onAction }) {
  return <div className="empty-panel"><span className="empty-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p>{action && <button className="button button-dark button-small" onClick={onAction}>{action} <ArrowRight size={14} /></button>}</div>;
}

function ListPage({ eyebrow, title, description, items, loading, error, onRetry, renderItem, emptyTitle, emptyText, emptyAction, onEmpty }) {
  return <section className="page-section"><div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{emptyAction && <button className="button button-dark" onClick={onEmpty}><Plus size={17} />{emptyAction}</button>}</div>{error && <div className="error-banner" role="alert">{error} <button className="inline-button" onClick={onRetry}>Retry</button></div>}{loading && !items.length && <div className="state-card" role="status"><span className="spinner" /> Loading reports…</div>}{!loading && !error && !items.length && <EmptyState icon={PackageCheck} title={emptyTitle} text={emptyText} action={emptyAction} onAction={onEmpty} />}{!!items.length && <div className="report-grid">{items.map(renderItem)}</div>}</section>;
}

function ClaimsPage({ ownerClaims, finderClaims, onDecision, onDetails, onContact, busy, error, loading, onRetry }) {
  const unresolvedOwner = ownerClaims.filter((claim) => !["approved", "rejected", "resolved"].includes(statusOf(claim)));
  const pendingFinder = finderClaims.filter((claim) => !["approved", "rejected", "resolved"].includes(statusOf(claim)));
  const resolved = [...ownerClaims, ...finderClaims].filter((claim) => ["approved", "rejected", "resolved"].includes(statusOf(claim)));
  return <section className="page-section"><div className="page-heading"><div><span className="eyebrow">CLAIMS & REUNIONS</span><h1>Claims that need you</h1><p>Review incoming claims on your found items, or check on claims you’ve submitted.</p></div></div>{error && <div className="error-banner" role="alert">{error} <button className="inline-button" onClick={onRetry}>Retry</button></div>}{loading && !ownerClaims.length && !finderClaims.length && <div className="state-card" role="status"><span className="spinner" /> Loading claims…</div>}<div className="claim-section"><div className="subsection-title"><h2>Incoming for your found items</h2><span>{pendingFinder.length}</span></div>{pendingFinder.length ? <div className="claims-list">{pendingFinder.map((claim) => <ClaimRow key={getId(claim)} claim={claim} incoming onDecision={onDecision} onDetails={onDetails} onContact={onContact} busy={busy} />)}</div> : <p className="subsection-empty">No incoming claims need a decision right now.</p>}</div><div className="claim-section"><div className="subsection-title"><h2>Claims you submitted</h2><span>{unresolvedOwner.length}</span></div>{unresolvedOwner.length ? <div className="claims-list">{unresolvedOwner.map((claim) => <ClaimRow key={getId(claim)} claim={claim} onContact={onContact} onDetails={onDetails} />)}</div> : <p className="subsection-empty">You haven’t submitted any open claims.</p>}</div>{resolved.length > 0 && <div className="claim-section"><div className="subsection-title"><h2>Claim history</h2><span>{resolved.length}</span></div><div className="claims-list">{resolved.map((claim) => <ClaimRow key={`${getId(claim)}-${claim._view || "owner"}`} claim={claim} onContact={onContact} onDetails={onDetails} />)}</div></div>}</section>;
}

function ClaimRow({ claim, incoming = false, onDecision, onDetails, onContact, busy }) {
  const name = claim.itemName || claim.lostItem?.itemName || claim.foundItem?.itemName || claim.item?.itemName || "Item claim";
  const answer = claim.answers?.verificationAnswer;
  return <article className="claim-row"><span className={`claim-row-icon ${incoming ? "mint-bg" : "lavender-bg"}`}>{incoming ? <ArrowDownLeft size={17} /> : <Inbox size={17} />}</span><div className="claim-row-main"><strong>{name}</strong><small>{incoming ? "A community member is claiming this find" : "Your claim"}{claim.createdAt ? ` · ${formatDate(claim.createdAt)}` : ""}{incoming && claim.matchScore !== undefined ? ` · Match ${Math.round(claim.matchScore * 100)}%` : ""}{incoming && claim.verificationScore !== undefined ? ` · Verification ${Math.round(claim.verificationScore * 100)}%` : ""}</small>{incoming && answer && <p className="claim-answer-preview">Answer: {answer}</p>}</div><StatusBadge status={claim.status} />{incoming && !claim.finderDecision && statusOf(claim) === "pending" && <div className="claim-row-actions"><button className="button button-light button-compact" onClick={() => onDecision(claim, "not_owner")} disabled={busy}>Not the owner</button><button className="button button-dark button-compact" onClick={() => onDecision(claim, "looks_right")} disabled={busy}>Looks right</button></div>}  {onContact && claim.contactEligible && statusOf(claim) !== "rejected" && <button className="icon-button" aria-label={incoming ? "Contact owner securely" : "Contact finder securely"} onClick={() => onContact(claim)}><Mail size={17} /></button>}{onDetails && <button className="icon-button" aria-label={`View claim details for ${name}`} onClick={() => onDetails(claim)}><ArrowRight size={17} /></button>}</article>;
}

function NotificationsPage({ notifications, loading, error, onRetry, onRead }) {
  return <section className="page-section"><div className="page-heading"><div><span className="eyebrow">UPDATES</span><h1>Notifications</h1><p>Claim updates, helpful matches, and the latest on your reports.</p></div></div>{error && <div className="error-banner" role="alert">{error} <button className="inline-button" onClick={onRetry}>Retry</button></div>}{loading && !notifications.length && <div className="state-card" role="status"><span className="spinner" /> Loading notifications…</div>}{!loading && !error && !notifications.length && <EmptyState icon={Bell} title="You’re all caught up" text="When something needs your attention, you’ll see it here." />}{!!notifications.length && <div className="notifications-list">{notifications.map((notification) => { const unread = !notification.readAt && !notification.isRead && notification.status !== "read"; return <article className={`notification-row ${unread ? "notification-unread" : ""}`} key={getId(notification)}><span className="notification-icon"><Bell size={17} /></span><div><strong>{notification.title || notification.message || "TraceBack update"}</strong>{notification.title && notification.message && <p>{notification.message}</p>}<small>{formatDate(notification.createdAt)}</small></div>{unread && <button className="button button-light button-compact" onClick={() => onRead(notification)}>Mark read</button>}</article>; })}</div>}</section>;
}

function AdminOverview({ stats, claims, onViewClaims }) {
  const metrics = [
    { label: "Total lost", value: stats.lostReports || 0, icon: Search, tone: "peach" },
    { label: "Total found", value: stats.foundReports || 0, icon: HandHelping, tone: "mint" },
    { label: "Resolved", value: stats.resolvedReports || 0, icon: Heart, tone: "yellow" },
    { label: "Pending claims", value: stats.pendingClaims ?? claims.filter((claim) => statusOf(claim) === "pending").length, icon: Inbox, tone: "lavender" },
    { label: "Average match", value: `${stats.averageMatchPercent ?? 0}%`, icon: Sparkles, tone: "yellow" },
  ];
  const chartData = stats.weeklyReports || stats.monthly || stats.reportsByMonth || stats.activity || [];
  const bars = Array.isArray(chartData) ? chartData.slice(-8) : [];
  const maxValue = Math.max(1, ...bars.map((entry) => Number(entry.count ?? entry.value ?? entry.total) || 0));
  return <><div className="stat-grid admin-stat-grid">{metrics.map((metric) => <StatCard key={metric.label} {...metric} foot="Community overview" />)}</div><div className="admin-overview-grid"><section className="dashboard-panel chart-panel"><div className="panel-heading"><div><h2>Community activity</h2><p>Reports and reunions over time</p></div><span className="chart-period"><Activity size={14} /> Recent</span></div>{bars.length ? <div className="bar-chart" role="img" aria-label="Community activity chart">{bars.map((entry, index) => { const value = Number(entry.count ?? entry.value ?? entry.total) || 0; return <div className="chart-column" key={`${entry.label || entry.month || index}`}><span className="chart-value">{value}</span><div className="chart-bar-track"><span style={{ height: `${Math.max(4, value / maxValue * 100)}%` }} /></div><small>{entry.label || entry.month || ""}</small></div>; })}</div> : <div className="chart-empty"><Activity size={24} /><p>Activity data will appear here as your community grows.</p></div>}</section><section className="dashboard-panel admin-action-panel"><div className="panel-heading"><div><h2>Needs review</h2><p>Claims waiting on an administrator</p></div></div><div className="admin-claim-count"><span>{claims.filter((claim) => !["approved", "rejected"].includes(statusOf(claim))).length}</span><small>open claims</small></div><button className="button button-dark" onClick={onViewClaims}>Review claims <ArrowRight size={16} /></button></section></div></>;
}

function AdminClaimsPage({ claims, filter, setFilter, loading, error, onRetry, onDetails }) {
  const options = [
    { value: "", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "accepted", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ];
  return <section className="page-section"><div className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Claim review</h1><p>Review claim details and make a final, documented decision.</p></div><label className="filter-control"><Filter size={15} /><span className="sr-only">Filter claims by status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} /></label></div>{error && <div className="error-banner" role="alert">{error} <button className="inline-button" onClick={onRetry}>Retry</button></div>}{loading && !claims.length && <div className="state-card" role="status"><span className="spinner" /> Loading claims…</div>}{!loading && !error && !claims.length && <EmptyState icon={Inbox} title="No claims to review" text="There are no claims matching this filter right now." />}{!!claims.length && <div className="dashboard-panel table-panel"><div className="table-responsive"><table><thead><tr><th>Item</th><th>Claimant</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{claims.map((claim) => <tr key={getId(claim)}><td><strong>{claim.itemName || claim.lostItem?.itemName || claim.item?.itemName || "Item claim"}</strong><small>{claim.category || "Claim review"}</small></td><td>{claim.claimant?.name || claim.claimantName || claim.claimantEmail || "Private claimant"}</td><td>{formatDate(claim.createdAt)}</td><td><StatusBadge status={claim.status} /></td><td><button className="button button-light button-compact" onClick={() => onDetails(claim)}>Review <ArrowRight size={14} /></button></td></tr>)}</tbody></table></div></div>}</section>;
}

function UsersPage({ users, loading, error, onRetry, onDeactivate, busy }) {
  return <section className="page-section"><div className="page-heading"><div><span className="eyebrow">COMMUNITY SAFETY</span><h1>Member accounts</h1><p>Review account activity and deactivate accounts when necessary.</p></div></div>{error && <div className="error-banner" role="alert">{error} <button className="inline-button" onClick={onRetry}>Retry</button></div>}{loading && !users.length && <div className="state-card" role="status"><span className="spinner" /> Loading members…</div>}{!loading && !error && !users.length && <EmptyState icon={Users} title="No members found" text="Member accounts will appear here." />}{!!users.length && <div className="dashboard-panel table-panel"><div className="table-responsive"><table><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((person) => { const active = person.isActive !== false && person.status !== "inactive" && person.active !== false; return <tr key={getId(person)}><td><div className="user-cell"><span className="avatar">{(person.name || person.email || "U").slice(0, 1).toUpperCase()}</span><span><strong>{person.name || "Member"}</strong><small>{person.email || "No email available"}</small></span></div></td><td>{person.role || "member"}</td><td>{formatDate(person.createdAt)}</td><td><StatusBadge status={active ? "active" : "inactive"} /></td><td>{active ? <button className="button button-danger-quiet button-compact" onClick={() => onDeactivate(person)} disabled={busy}>Deactivate</button> : <span className="muted-text">Inactive</span>}</td></tr>; })}</tbody></table></div></div>}</section>;
}
