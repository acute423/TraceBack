import mongoose from "mongoose";

const claimSchema = new mongoose.Schema(
  {
    lostReport: { type: mongoose.Schema.Types.ObjectId, ref: "Report", required: true, index: true },
    foundReport: { type: mongoose.Schema.Types.ObjectId, ref: "Report", required: true, index: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    finder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: {
      verificationAnswer: { type: String, required: true, trim: true, maxlength: 1000 },
    },
    verificationScore: { type: Number, min: 0, max: 1, default: 0 },
    verificationStatus: { type: String, enum: ["verified", "not_configured"], default: "not_configured" },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", index: true },
    matchScore: { type: Number, min: 0, max: 1, default: 0 },
    breakdown: {
      imageSim: { type: Number, min: 0, max: 1, default: 0 },
      textSim: { type: Number, min: 0, max: 1, default: 0 },
      categoryMatch: { type: Number, min: 0, max: 1, default: 0 },
      locationSim: { type: Number, min: 0, max: 1, default: 0 },
      dateScore: { type: Number, min: 0, max: 1, default: 0 },
    },
    matchingStatus: { type: String, enum: ["ready", "degraded", "unavailable"], default: "ready" },
    finderDecision: {
      type: String,
      enum: ["looks_right", "not_owner", "returned_to_owner"],
      default: null,
    },
    finderDecisionAt: { type: Date, default: null },
    adminDecision: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    adminDecisionAt: { type: Date, default: null },
    adminDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    adminNote: { type: String, trim: true, maxlength: 500, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

claimSchema.index({ lostReport: 1, foundReport: 1, claimant: 1 }, { unique: true });

export default mongoose.model("Claim", claimSchema);
