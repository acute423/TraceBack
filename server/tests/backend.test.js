import test from "node:test";
import assert from "node:assert/strict";
import {
  claimSchema,
  createReportSchema,
  normalizeReportFields,
  updateReportSchema,
} from "../src/utils/reportValidation.js";
import { compareReports } from "../src/services/matchingService.js";
import { verificationScore } from "../src/controllers/claimController.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

test("upstream service failures return only their actionable public message", () => {
  const originalConsoleError = console.error;
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  console.error = () => {};
  try {
    errorHandler({
      message: "private upstream response",
      statusCode: 503,
      publicMessage: "The matching service is unavailable.",
    }, {}, response, () => {});
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    success: false,
    message: "The matching service is unavailable.",
  });
});

test("report creation validates required public and private fields", () => {
  const parsed = createReportSchema.safeParse({
    title: "Blue backpack",
    description: "A blue backpack was left at the station.",
    category: "Bags",
    location: "Central station",
    date: "2026-11-10",
    hiddenDetails: "A keychain is attached inside.",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.category, "Bags");
  assert.equal(createReportSchema.safeParse({ title: "Incomplete" }).success, false);
});

test("lost and found multipart fields normalize to the report schema", () => {
  for (const [type, dateField] of [["lost", "lostDate"], ["found", "foundDate"]]) {
    const req = {
      body: {
        itemName: "Blue backpack",
        description: "A blue backpack with a small silver keychain.",
        category: "Bags",
        location: "Main Library",
        [dateField]: "2026-11-10",
        ...(type === "found" ? { hiddenDetails: "A stitch is loose near the left pocket." } : {}),
      },
    };
    let nextCalled = false;
    normalizeReportFields(type)(req, {}, () => { nextCalled = true; });
    const parsed = createReportSchema.safeParse(req.body);
    assert.equal(nextCalled, true);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    assert.equal(parsed.data.title, "Blue backpack");
    assert.ok(parsed.data.date instanceof Date);
    assert.equal("itemName" in req.body, false);
    assert.equal(dateField in req.body, false);
  }
});

test("report updates require at least one valid field", () => {
  assert.equal(updateReportSchema.safeParse({}).success, false);
  assert.equal(updateReportSchema.safeParse({ location: "Library" }).success, true);
});

test("claims require a valid report id and message", () => {
  assert.equal(claimSchema.safeParse({
    lostId: "507f1f77bcf86cd799439011",
    foundId: "507f1f77bcf86cd799439012",
    answers: { verificationAnswer: "A red compass keychain." },
  }).success, true);
  assert.equal(claimSchema.safeParse({
    reportId: "bad",
    message: "short",
  }).success, false);
});

test("matching produces the five-factor weighted breakdown and best photo-pair score", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const { a, b } = JSON.parse(options.body);
    const value = a.length === 2 ? a[0] * b[0] + a[1] * b[1] : 0.5;
    return { ok: true, json: async () => ({ similarity: value }) };
  };
  try {
    const result = await compareReports(
      {
        category: "bags",
        location: "Main Hall",
        date: "2026-11-01",
        photoEmbeddings: [[1, 0], [0, 1]],
        textEmbedding: [1],
      },
      {
        category: "bags",
        location: "Main Hall",
        date: "2026-11-06",
        photoEmbeddings: [[0, 1]],
        textEmbedding: [1],
      }
    );
    assert.ok(Math.abs(result.score - (0.4 + 0.15 + 0.1 + 0.1 + 0.1 * (1 - 5 / 30))) < 1e-12);
    assert.deepEqual(Object.keys(result.breakdown), [
      "imageSim", "textSim", "categoryMatch", "locationSim", "dateScore",
    ]);
    assert.equal(result.breakdown.imageSim, 1);
    assert.equal(result.breakdown.locationSim, 1);
    assert.equal(result.breakdown.dateScore, 1 - 5 / 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verification compares claimant answers to private details with text cosine similarity", async () => {
  const originalFetch = globalThis.fetch;
  const requestedTexts = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/embed-text")) {
      requestedTexts.push(JSON.parse(options.body).text);
      return { ok: true, json: async () => ({ embedding: [1, 0] }) };
    }
    return { ok: true, json: async () => ({ similarity: 0.8 }) };
  };
  try {
    assert.deepEqual(
      await verificationScore("red compass", "red compass keychain attached inside", [0, 1]),
      { score: 0.8, status: "verified", degraded: false }
    );
    assert.deepEqual(requestedTexts, ["red compass"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(
    await verificationScore("anything", ""),
    { score: 0, status: "not_configured" }
  );
});
