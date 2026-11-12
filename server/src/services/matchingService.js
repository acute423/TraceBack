import {
  CAMPUS_ZONES,
  DATE_DECAY_DAYS,
  MATCHING_WEIGHTS,
  MATCH_THRESHOLD,
} from "../config/matching.js";
import Report from "../models/Report.js";

const serviceUrl = (path) =>
  `${(process.env.AI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "")}${path}`;

const requestEmbedding = async (path, body) => {
  let response;
  try {
    response = await fetch(serviceUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (cause) {
    const error = new Error(`Embedding service unavailable at ${path}: ${cause.message}`);
    error.statusCode = 503;
    error.publicMessage = "The matching service did not respond in time. Keep the AI service running and retry after its model has loaded.";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Embedding service returned ${response.status} for ${path}`);
    error.statusCode = 503;
    error.publicMessage = "The matching service could not process this report. Check the AI service and its model, then retry.";
    throw error;
  }
  const result = await response.json();
  if (!Array.isArray(result.embedding) || !result.embedding.length || !result.embedding.every(Number.isFinite)) {
    const error = new Error(`Embedding service returned an invalid embedding for ${path}`);
    error.statusCode = 503;
    error.publicMessage = "The matching service returned an invalid result. Check the AI service logs and retry.";
    throw error;
  }
  return result.embedding;
};

export const createTextEmbedding = (text) =>
  requestEmbedding("/embed-text", { text: String(text || "").trim() });

export const createEmbeddings = async ({ title, itemName, description, category, location, imageBuffers = [] }) => {
  const text = [itemName || title, description, category, location].filter(Boolean).join(" ");
  const [textEmbedding, ...photoEmbeddings] = await Promise.all([
    requestEmbedding("/embed-text", { text }),
    ...imageBuffers.map((buffer) =>
      requestEmbedding("/embed-image", { image: buffer.toString("base64") })
    ),
  ]);
  return { textEmbedding, photoEmbeddings };
};

const localCosineSimilarity = (left, right) => {
  if (!left?.length || left.length !== right?.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (!leftNorm || !rightNorm) return 0;
  const cosine = dot / Math.sqrt(leftNorm * rightNorm);
  return Math.max(0, Math.min(1, (cosine + 1) / 2));
};

const similarity = async (a, b) => {
  try {
    const response = await fetch(serviceUrl("/similarity"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a, b }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Similarity service returned ${response.status}`);
    const result = await response.json();
    if (!Number.isFinite(result.similarity)) throw new Error("Similarity service returned an invalid score");
    return { score: Math.max(0, Math.min(1, result.similarity)), degraded: false };
  } catch {
    return { score: localCosineSimilarity(a, b), degraded: true };
  }
};

export const compareEmbeddings = similarity;

export const compareText = async (left, right) => {
  const [leftEmbedding, rightEmbedding] = await Promise.all([
    createTextEmbedding(left),
    createTextEmbedding(right),
  ]);
  return similarity(leftEmbedding, rightEmbedding);
};

const bestImageSimilarity = async (left, right) => {
  const leftEmbeddings = left.photoEmbeddings?.length
    ? left.photoEmbeddings
    : left.imageEmbedding?.length ? [left.imageEmbedding] : [];
  const rightEmbeddings = right.photoEmbeddings?.length
    ? right.photoEmbeddings
    : right.imageEmbedding?.length ? [right.imageEmbedding] : [];
  if (!leftEmbeddings.length || !rightEmbeddings.length) {
    return { score: 0, degraded: false };
  }
  const comparisons = await Promise.all(leftEmbeddings.flatMap((a) =>
    rightEmbeddings.map((b) => similarity(a, b))
  ));
  return {
    score: Math.max(...comparisons.map((result) => result.score)),
    degraded: comparisons.some((result) => result.degraded),
  };
};

const normalizeLocation = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const locationSimilarity = (left, right) => {
  const a = normalizeLocation(left);
  const b = normalizeLocation(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return CAMPUS_ZONES.some((zone) => zone.includes(a) && zone.includes(b)) ? 0.5 : 0;
};

const dateSimilarity = (lostDate, foundDate) => {
  const lostTime = new Date(lostDate).getTime();
  const foundTime = new Date(foundDate).getTime();
  if (!Number.isFinite(lostTime) || !Number.isFinite(foundTime) || foundTime < lostTime) return 0;
  const elapsedDays = (foundTime - lostTime) / 86_400_000;
  return Math.max(0, Math.min(1, 1 - elapsedDays / DATE_DECAY_DAYS));
};

export const compareReports = async (lost, found) => {
  const textAvailable = Boolean(lost.textEmbedding?.length && found.textEmbedding?.length);
  const photosMissingEmbeddings = Boolean(
    (lost.photos?.length && !lost.photoEmbeddings?.length)
    || (found.photos?.length && !found.photoEmbeddings?.length)
  );
  const [imageResult, textResult] = await Promise.all([
    photosMissingEmbeddings
      ? { score: 0, degraded: true }
      : bestImageSimilarity(lost, found),
    textAvailable
      ? similarity(lost.textEmbedding, found.textEmbedding)
      : { score: 0, degraded: true },
  ]);
  const breakdown = {
    imageSim: imageResult.score,
    textSim: textResult.score,
    categoryMatch: normalizeLocation(lost.category) && normalizeLocation(lost.category) === normalizeLocation(found.category) ? 1 : 0,
    locationSim: locationSimilarity(lost.location, found.location),
    dateScore: dateSimilarity(lost.date, found.date),
  };
  const score = Object.entries(MATCHING_WEIGHTS).reduce(
    (total, [key, weight]) => total + breakdown[key] * weight,
    0
  );
  return {
    score: Math.max(0, Math.min(1, score)),
    breakdown,
    degraded: imageResult.degraded || textResult.degraded,
    available: textAvailable,
  };
};

export const matchNewReport = async (report) => {
  if (!report.textEmbedding?.length) {
    report.matches = [];
    report.matchingStatus = "unavailable";
    report.matchingMessage = "A required text embedding is missing; this report cannot be matched.";
    await report.save();
    return { matches: [], matchingStatus: report.matchingStatus, message: report.matchingMessage };
  }
  const candidates = await Report.find({
    _id: { $ne: report._id },
    type: report.type === "lost" ? "found" : "lost",
    status: "active",
  }).select("+photoEmbeddings +imageEmbedding +textEmbedding +matches");
  const matches = [];
  let degraded = false;
  for (const candidate of candidates) {
    const lost = report.type === "lost" ? report : candidate;
    const found = report.type === "found" ? report : candidate;
    const result = await compareReports(lost, found);
    degraded ||= result.degraded;
    const oppositeMatches = candidate.matches.filter(
      (match) => match.report.toString() !== report._id.toString()
    );
    if (!result.available) {
      candidate.matches = oppositeMatches;
      candidate.matchingStatus = "unavailable";
      candidate.matchingMessage = "A required text embedding is missing; this report was excluded from matching.";
      await candidate.save();
      continue;
    }
    if (result.score >= MATCH_THRESHOLD) {
      matches.push({ report: candidate._id, score: result.score, breakdown: result.breakdown });
      oppositeMatches.push({
        report: report._id,
        score: result.score,
        breakdown: result.breakdown,
      });
    }
    candidate.matches = oppositeMatches;
    if (result.degraded) {
      candidate.matchingStatus = "degraded";
      candidate.matchingMessage = "Some comparison data was unavailable; local cosine fallback or missing image embeddings affected scores.";
    }
    await candidate.save();
  }
  report.matches = matches;
  report.matchingStatus = degraded ? "degraded" : "ready";
  report.matchingMessage = degraded
    ? "Some comparison data was unavailable; local cosine fallback or missing image embeddings affected scores."
    : null;
  await report.save();
  return { matches, matchingStatus: report.matchingStatus, message: report.matchingMessage };
};
