import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { MATCH_THRESHOLD } from "../src/config/matching.js";
import Report from "../src/models/Report.js";
import User from "../src/models/User.js";
import { compareReports } from "../src/services/matchingService.js";

await connectDB();

try {
  const [owner, finder] = await Promise.all([
    User.findOne({ email: "demo-owner@traceback.local" }).select("_id"),
    User.findOne({ email: "demo-finder@traceback.local" }).select("_id"),
  ]);
  assert.ok(owner && finder, "Run npm run seed before the matching check.");
  const lostReports = await Report.find({ type: "lost", owner: owner._id })
    .sort({ title: 1 })
    .select("+textEmbedding +photoEmbeddings");
  const foundReports = await Report.find({ type: "found", owner: finder._id })
    .sort({ title: 1 })
    .select("+textEmbedding +photoEmbeddings");
  const sampleLost = lostReports;
  const sampleFound = foundReports;
  assert.ok(sampleLost.length >= 10 && sampleFound.length >= 10, "The seed should contain ten lost and ten found reports.");
  const expectedFoundByLostTitle = new Map([
    ["Blue canvas backpack", "Backpack found in Main Hall"],
    ["Black laptop charger", "Laptop charger found in Science Lab"],
    ["Silver water bottle", "Water bottle found at the Gym"],
    ["Gray campus hoodie", "Hoodie found in Student Center"],
    ["Brass key ring", "Keys found in the Library"],
    ["Wireless earbuds case", "Earbuds case found in Science Lab"],
    ["Gold pendant necklace", "Pendant necklace found in Arts Building"],
    ["Calculus textbook", "Textbook found in Library"],
    ["Black laptop sleeve", "Laptop sleeve found in Computer Lab"],
    ["Red calculator", "Calculator found in Engineering Building"],
  ]);

  const results = [];
  for (const lost of sampleLost) {
    const comparisons = await Promise.all(sampleFound.map(async (found) => ({
      found,
      result: await compareReports(lost, found),
    })));
    const top = comparisons.reduce((best, current) =>
      current.result.score > best.result.score ? current : best
    );
    const expected = sampleFound.find((found) =>
      found.title === expectedFoundByLostTitle.get(lost.title)
    );
    results.push({
      lost: lost.title,
      expected: expected?.title || "none",
      predicted: top.found.title,
      score: top.result.score.toFixed(3),
      threshold: top.result.score >= MATCH_THRESHOLD ? "match" : "below",
      correct: top.found._id.equals(expected?._id) ? "yes" : "no",
    });
  }
  console.table(results);
  const accuracy = results.filter((result) => result.correct === "yes").length / results.length;
  console.log(`Top-1 accuracy: ${(accuracy * 100).toFixed(1)}% (${results.length} seeded lost reports)`);
  assert.ok(accuracy >= 0.8, "Matching top-1 accuracy fell below 80% on the seed pairs.");
} finally {
  await mongoose.disconnect();
}
